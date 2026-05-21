"""
Location intelligence: analyse visit history to detect home, work, and frequent places.
"""
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta, time as dtime
from typing import Optional

from database.models import LocationHistory, LocationInsight


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_user_patterns(db, user_id: int) -> None:
    """
    Analyse the last 30 days of location history for *user_id* and upsert
    LocationInsight records for detected home, work, and frequent places.
    """
    cutoff = datetime.utcnow() - timedelta(days=30)
    records = (
        db.query(LocationHistory)
        .filter(
            LocationHistory.user_id == user_id,
            LocationHistory.arrived_at >= cutoff,
        )
        .order_by(LocationHistory.arrived_at)
        .all()
    )

    if not records:
        return

    # Cluster records by proximity (100 m threshold)
    clusters = _cluster_records(records, threshold_km=0.1)

    for cluster in clusters:
        insight_type, confidence, evidence = _classify_cluster(cluster)
        if insight_type is None or confidence < 0.2:
            continue

        rep = cluster[0]  # representative record
        lat = sum(r.latitude for r in cluster) / len(cluster)
        lng = sum(r.longitude for r in cluster) / len(cluster)
        place_name = rep.place_name
        address = rep.address

        # Upsert the insight
        existing = (
            db.query(LocationInsight)
            .filter(
                LocationInsight.user_id == user_id,
                LocationInsight.insight_type == insight_type,
            )
            .first()
        )

        if existing:
            # Update if new confidence is higher or centroid moved
            if confidence >= existing.confidence:
                existing.latitude = lat
                existing.longitude = lng
                existing.place_name = place_name
                existing.address = address
                existing.confidence = confidence
                existing.evidence = json.dumps(evidence)
                existing.updated_at = datetime.utcnow()
        else:
            db.add(
                LocationInsight(
                    user_id=user_id,
                    insight_type=insight_type,
                    latitude=lat,
                    longitude=lng,
                    place_name=place_name,
                    address=address,
                    confidence=confidence,
                    evidence=json.dumps(evidence),
                )
            )

    db.commit()


def calculate_visit_stats(locations: list) -> dict:
    """
    Given a list of LocationHistory ORM objects, return summary statistics.
    """
    if not locations:
        return {}

    durations = [loc.duration_minutes for loc in locations if loc.duration_minutes]
    avg_duration = sum(durations) / len(durations) if durations else None

    arrival_hours = [loc.arrived_at.hour for loc in locations if loc.arrived_at]
    typical_arrival = round(sum(arrival_hours) / len(arrival_hours)) if arrival_hours else None

    return {
        "visit_count": len(locations),
        "avg_duration_minutes": round(avg_duration, 1) if avg_duration else None,
        "typical_arrival_hour": typical_arrival,
    }


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in kilometres between two lat/lng points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _cluster_records(records: list, threshold_km: float = 0.1) -> list[list]:
    """
    Simple greedy clustering: group records within *threshold_km* of each other.
    Returns a list of clusters (each cluster is a list of records).
    """
    clusters: list[list] = []
    used = [False] * len(records)

    for i, rec in enumerate(records):
        if used[i]:
            continue
        cluster = [rec]
        used[i] = True
        for j in range(i + 1, len(records)):
            if used[j]:
                continue
            if haversine_distance(rec.latitude, rec.longitude,
                                  records[j].latitude, records[j].longitude) <= threshold_km:
                cluster.append(records[j])
                used[j] = True
        clusters.append(cluster)

    return clusters


def _classify_cluster(cluster: list) -> tuple[Optional[str], float, dict]:
    """
    Classify a cluster of visits into an insight type.

    Returns (insight_type | None, confidence 0-1, evidence dict).
    """
    visit_count = len(cluster)
    durations = [r.duration_minutes for r in cluster if r.duration_minutes]
    avg_duration = sum(durations) / len(durations) if durations else 0

    # Gather arrival hours and weekday/weekend split
    arrival_hours = [r.arrived_at.hour for r in cluster if r.arrived_at]
    night_visits = sum(1 for h in arrival_hours if h >= 22 or h < 8)
    morning_visits = sum(1 for h in arrival_hours if 8 <= h < 12)
    weekday_visits = sum(
        1 for r in cluster if r.arrived_at and r.arrived_at.weekday() < 5
    )
    weekend_visits = visit_count - weekday_visits

    # Check place types for hints
    all_types: list = []
    for r in cluster:
        if r.place_types:
            try:
                all_types.extend(json.loads(r.place_types))
            except (json.JSONDecodeError, TypeError):
                pass

    evidence = {
        "visit_count": visit_count,
        "avg_duration_minutes": round(avg_duration, 1),
        "night_visits": night_visits,
        "morning_visits": morning_visits,
        "weekday_visits": weekday_visits,
        "weekend_visits": weekend_visits,
        "place_types_sample": list(set(all_types))[:10],
    }

    # --- Home detection ---
    # Visited between 10 pm – 8 am, stays > 4 hours, multiple times
    if (
        night_visits >= 3
        and avg_duration > 240  # > 4 hours
        and night_visits / max(visit_count, 1) > 0.5
    ):
        confidence = min(1.0, 0.4 + 0.1 * night_visits + 0.1 * (avg_duration / 480))
        return "home", confidence, evidence

    # --- Work detection ---
    # Weekday mornings, stays 6-10 hours, consistent
    if (
        weekday_visits >= 5
        and morning_visits >= 3
        and 300 <= avg_duration <= 660  # 5-11 hours
        and weekday_visits / max(visit_count, 1) > 0.6
    ):
        confidence = min(1.0, 0.4 + 0.05 * weekday_visits + 0.05 * morning_visits)
        return "work", confidence, evidence

    # --- Gym detection ---
    gym_types = {"gym", "health", "fitness_center", "spa"}
    if gym_types.intersection(set(all_types)) and visit_count >= 3:
        confidence = min(1.0, 0.5 + 0.05 * visit_count)
        return "gym", confidence, evidence

    # --- School detection ---
    school_types = {"school", "university", "primary_school", "secondary_school", "library"}
    if school_types.intersection(set(all_types)) and visit_count >= 3:
        confidence = min(1.0, 0.5 + 0.05 * visit_count)
        return "school", confidence, evidence

    # --- Frequent place ---
    if visit_count >= 5:
        confidence = min(1.0, 0.3 + 0.05 * visit_count)
        return "frequent", confidence, evidence

    return None, 0.0, evidence
