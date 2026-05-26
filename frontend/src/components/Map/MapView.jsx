import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps'

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

const INSIGHT_ICONS = { home: '🏠', work: '💼', school: '🎓', gym: '🏋️', frequent: '⭐' }
const PLACE_TYPE_ICONS = { charging_station: '⚡', restaurant: '🍽️', cafe: '☕', gas_station: '⛽', shopping_mall: '🛍️', hospital: '🏥', pharmacy: '💊', default: '📍' }

function getPlaceIcon(types = []) {
  for (const t of types) if (PLACE_TYPE_ICONS[t]) return PLACE_TYPE_ICONS[t]
  return PLACE_TYPE_ICONS.default
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

function useClusters(places, zoom) {
  return useMemo(() => {
    if (!places?.length) return []
    // At zoom ≥ 16 always show individual markers
    if (zoom >= 16) return places.map(p => ({ lat: p.lat, lng: p.lng, items: [p] }))
    // degrees per pixel at this zoom level
    const degPerPx = 360 / (256 * Math.pow(2, zoom))
    const threshold = degPerPx * 50 // ~50px clustering radius
    const assigned = new Set()
    const clusters = []
    places.forEach((place, i) => {
      if (assigned.has(i)) return
      const cluster = [place]
      assigned.add(i)
      for (let j = i + 1; j < places.length; j++) {
        if (assigned.has(j)) continue
        const dlat = place.lat - places[j].lat
        const dlng = place.lng - places[j].lng
        if (Math.sqrt(dlat * dlat + dlng * dlng) < threshold) {
          cluster.push(places[j])
          assigned.add(j)
        }
      }
      const lat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length
      const lng = cluster.reduce((s, p) => s + p.lng, 0) / cluster.length
      clusters.push({ lat, lng, items: cluster })
    })
    return clusters
  }, [places, zoom])
}

function PlaceMarkersWithClustering({ places }) {
  const map = useMap()
  const [zoom, setZoom] = useState(13)
  const [openIdx, setOpenIdx] = useState(null)

  useEffect(() => {
    if (!map) return
    setZoom(map.getZoom() ?? 13)
    const listener = map.addListener('zoom_changed', () => {
      setZoom(map.getZoom() ?? 13)
      setOpenIdx(null)
    })
    return () => window.google?.maps?.event?.removeListener(listener)
  }, [map])

  const clusters = useClusters(places, zoom)

  return clusters.map((cluster, i) => {
    // Open popup
    if (openIdx === i) {
      return (
        <AdvancedMarker key={`cl-${i}`} position={{ lat: cluster.lat, lng: cluster.lng }}>
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
            style={{ minWidth: 210, maxWidth: 270 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-700">{cluster.items.length} yer</span>
              <button
                onClick={e => { e.stopPropagation(); setOpenIdx(null) }}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 text-sm rounded"
              >✕</button>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {cluster.items.map((place, j) => (
                <div key={j} className="px-3 py-2.5 hover:bg-slate-50 flex items-start gap-2.5 border-b border-slate-50 last:border-0 transition-colors">
                  <span className="text-base flex-shrink-0 mt-0.5">{getPlaceIcon(place.types)}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-800 truncate">{place.name}</div>
                    {place.address && <div className="text-[10px] text-slate-400 truncate mt-0.5">{place.address}</div>}
                    {place.rating && (
                      <div className="text-[10px] text-amber-500 mt-0.5">
                        {'★'.repeat(Math.round(place.rating))} {place.rating}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AdvancedMarker>
      )
    }

    // Single marker
    if (cluster.items.length === 1) {
      const place = cluster.items[0]
      return (
        <AdvancedMarker key={`cl-${i}`} position={{ lat: cluster.lat, lng: cluster.lng }} title={place.name}>
          <div className="glass rounded-xl px-2 py-1 flex items-center gap-1 text-xs text-slate-700 shadow-md border border-slate-200 hover:border-brand/40 cursor-pointer transition-all">
            <span>{getPlaceIcon(place.types)}</span>
            <span className="max-w-[80px] truncate font-medium">{place.name}</span>
          </div>
        </AdvancedMarker>
      )
    }

    // Cluster badge
    return (
      <AdvancedMarker key={`cl-${i}`} position={{ lat: cluster.lat, lng: cluster.lng }} onClick={() => setOpenIdx(i)}>
        <div className="w-10 h-10 bg-brand rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
          <span className="text-white font-bold text-sm">{cluster.items.length}</span>
        </div>
      </AdvancedMarker>
    )
  })
}

// ---------------------------------------------------------------------------
// Route polyline
// ---------------------------------------------------------------------------

function decodePolyline(encoded) {
  const points = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    for (let isLng = 0; isLng < 2; isLng++) {
      let result = 0, shift = 0, b
      do {
        b = encoded.charCodeAt(index++) - 63
        result |= (b & 0x1F) << shift
        shift += 5
      } while (b >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (isLng === 0) lat += delta; else { lng += delta; points.push({ lat: lat * 1e-5, lng: lng * 1e-5 }) }
    }
  }
  return points
}

function RoutePolyline({ encodedPolyline }) {
  const map = useMap()
  const polylineRef = useRef(null)

  useEffect(() => {
    if (!map || !encodedPolyline) return
    const points = decodePolyline(encodedPolyline)
    if (polylineRef.current) polylineRef.current.setMap(null)
    const poly = new window.google.maps.Polyline({
      path: points,
      geodesic: true,
      strokeColor: '#3b82f6',
      strokeOpacity: 0.85,
      strokeWeight: 5,
      map,
    })
    polylineRef.current = poly
    const bounds = new window.google.maps.LatLngBounds()
    points.forEach(p => bounds.extend(p))
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 })
    return () => poly.setMap(null)
  }, [map, encodedPolyline])

  return null
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function MapControls({ onLocate, onClearRoute, hasRoute }) {
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
      <button
        onClick={onLocate}
        title="Konumuma git"
        className="w-10 h-10 glass rounded-xl flex items-center justify-center text-slate-600 hover:text-brand hover:bg-brand/5 transition-all shadow-lg"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" /><circle cx="12" cy="12" r="8" strokeDasharray="2 4" />
        </svg>
      </button>
      {hasRoute && (
        <button
          onClick={onClearRoute}
          title="Rotayı temizle"
          className="w-10 h-10 glass rounded-xl flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-50 transition-all shadow-lg text-lg"
        >✕</button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Route info bar with save
// ---------------------------------------------------------------------------

function RouteInfo({ route, onSaveRoute }) {
  const [saving, setSaving] = useState(false)
  const [originName, setOriginName] = useState('')
  const [destName, setDestName] = useState('')
  const [saved, setSaved] = useState(false)

  // Reset saved indicator when route changes
  useEffect(() => { setSaved(false) }, [route])

  if (!route) return null

  if (saving) {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 animate-slide-up">
        <div className="glass rounded-2xl px-5 py-4 shadow-xl flex flex-col gap-3" style={{ minWidth: 300 }}>
          <div className="text-sm font-semibold text-slate-800">Rotayı Kaydet</div>
          <input
            autoFocus
            value={originName}
            onChange={e => setOriginName(e.target.value)}
            placeholder="Başlangıç adı (örn: Ev)"
            className="text-sm bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-brand/50 transition-all text-slate-800"
          />
          <input
            value={destName}
            onChange={e => setDestName(e.target.value)}
            placeholder="Varış adı (örn: İş)"
            onKeyDown={e => {
              if (e.key === 'Enter' && originName.trim() && destName.trim()) {
                onSaveRoute?.(originName.trim(), destName.trim())
                setSaving(false)
                setSaved(true)
              }
            }}
            className="text-sm bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-brand/50 transition-all text-slate-800"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setSaving(false)}
              className="flex-1 text-sm py-1.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
            >İptal</button>
            <button
              disabled={!originName.trim() || !destName.trim()}
              onClick={() => {
                onSaveRoute?.(originName.trim(), destName.trim())
                setSaving(false)
                setSaved(true)
              }}
              className="flex-1 text-sm py-1.5 rounded-xl bg-brand text-white hover:bg-brand-dark disabled:opacity-40 transition-all"
            >Kaydet</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 animate-slide-up">
      <div className="glass rounded-2xl px-5 py-3 flex items-center gap-5 shadow-xl">
        <div className="text-center">
          <div className="text-brand font-bold text-lg">{route.duration_text}</div>
          <div className="text-slate-400 text-xs">ETA</div>
        </div>
        <div className="w-px h-8 bg-slate-200" />
        <div className="text-center">
          <div className="text-slate-800 font-medium">{route.distance_text}</div>
          <div className="text-slate-400 text-xs">Mesafe</div>
        </div>
        {route.steps?.length > 0 && (
          <>
            <div className="w-px h-8 bg-slate-200" />
            <div className="max-w-[160px]">
              <div className="text-slate-600 text-xs truncate">
                {route.steps[0].instruction?.replace(/<[^>]+>/g, '') || route.steps[0].maneuver}
              </div>
              <div className="text-slate-400 text-[10px]">Sonraki adım</div>
            </div>
          </>
        )}
        <div className="w-px h-8 bg-slate-200" />
        <button
          onClick={() => { setSaving(true); setOriginName(''); setDestName('') }}
          title="Rotayı kaydet"
          className={`flex items-center gap-1.5 text-xs font-medium transition-all whitespace-nowrap
            ${saved ? 'text-success' : 'text-slate-400 hover:text-brand'}`}
        >
          <span>{saved ? '✓' : '💾'}</span>
          <span>{saved ? 'Kaydedildi' : 'Kaydet'}</span>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main MapView
// ---------------------------------------------------------------------------

export default function MapView({ currentLocation, route, places, insights, bookmarks, onMapClick, onSaveRoute }) {
  const [mapInstance, setMapInstance] = useState(null)
  const hasCenteredRef = useRef(false)

  // Pan to user's location once on first fix
  useEffect(() => {
    if (mapInstance && currentLocation && !hasCenteredRef.current) {
      mapInstance.panTo({ lat: currentLocation.lat, lng: currentLocation.lng })
      mapInstance.setZoom(15)
      hasCenteredRef.current = true
    }
  }, [mapInstance, currentLocation])

  const handleLocate = useCallback(() => {
    if (mapInstance && currentLocation) {
      mapInstance.panTo(currentLocation)
      mapInstance.setZoom(15)
    }
  }, [mapInstance, currentLocation])

  const handleClearRoute = useCallback(() => {
    onMapClick?.({ type: 'clear_route' })
  }, [onMapClick])

  return (
    <APIProvider apiKey={GMAPS_KEY}>
      <div className="w-full h-full relative">
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={13}
          mapId="mapmax-main"
          onLoad={setMapInstance}
          onClick={(e) => onMapClick?.({ type: 'map_click', latlng: e.detail.latLng })}
          gestureHandling="greedy"
          disableDefaultUI
          className="w-full h-full"
        >
          {/* User location dot */}
          {currentLocation && (
            <AdvancedMarker position={currentLocation} title="Konumunuz">
              <div className="w-5 h-5 bg-brand rounded-full border-2 border-white shadow-lg location-pulse" />
            </AdvancedMarker>
          )}

          {/* Route */}
          {route?.encoded_polyline && <RoutePolyline encodedPolyline={route.encoded_polyline} />}
          {route?.origin_latlng && (
            <AdvancedMarker position={route.origin_latlng} title="Başlangıç">
              <Pin background="#10b981" borderColor="#059669" glyphColor="white" glyph="A" />
            </AdvancedMarker>
          )}
          {route?.destination_latlng && (
            <AdvancedMarker position={route.destination_latlng} title="Varış">
              <Pin background="#ef4444" borderColor="#dc2626" glyphColor="white" glyph="B" />
            </AdvancedMarker>
          )}
          {route?.waypoints?.map((wp, i) => (
            <AdvancedMarker key={`wp-${i}`} position={wp} title={`Durak ${i + 1}`}>
              <Pin background="#8b5cf6" borderColor="#7c3aed" glyphColor="white" glyph={String(i + 1)} />
            </AdvancedMarker>
          ))}

          {/* Clustered place markers */}
          <PlaceMarkersWithClustering places={places} />

          {/* Insight markers */}
          {insights?.map((ins, i) => (
            <AdvancedMarker key={`ins-${ins.id || i}`} position={{ lat: ins.lat, lng: ins.lng }} title={ins.insight_type}>
              <div className="flex flex-col items-center gap-0.5">
                <div className="glass rounded-xl px-2 py-1 text-xs text-slate-700 shadow-md border border-brand/20 flex items-center gap-1">
                  <span>{INSIGHT_ICONS[ins.insight_type] || '📍'}</span>
                  <span className="capitalize font-medium">{ins.insight_type}</span>
                </div>
                <div className="w-0.5 h-2 bg-brand/40" />
                <div className="w-2.5 h-2.5 bg-brand rounded-full border-2 border-white shadow-sm" />
              </div>
            </AdvancedMarker>
          ))}

          {/* Bookmark markers */}
          {bookmarks?.map((bk, i) => (
            <AdvancedMarker key={`bk-${bk.id || i}`} position={{ lat: bk.lat, lng: bk.lng }} title={bk.name}>
              <div className="flex flex-col items-center gap-0.5">
                <div className="glass rounded-xl px-2 py-1 text-xs text-slate-700 shadow-md border border-slate-200 flex items-center gap-1">
                  <span>{bk.name}</span>
                </div>
                <div className="w-0.5 h-2 bg-slate-400" />
                <div className="w-2.5 h-2.5 bg-accent rounded-full border-2 border-white shadow-sm" />
              </div>
            </AdvancedMarker>
          ))}
        </Map>

        <MapControls onLocate={handleLocate} onClearRoute={handleClearRoute} hasRoute={!!route} />
        <RouteInfo route={route} onSaveRoute={onSaveRoute} />
      </div>
    </APIProvider>
  )
}
