import React, { useCallback, useEffect, useRef, useState } from 'react'
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

function MapControls({ onLocate, onClearRoute, hasRoute }) {
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
      <button
        onClick={onLocate}
        title="Go to my location"
        className="w-10 h-10 glass rounded-xl flex items-center justify-center text-slate-600 hover:text-brand hover:bg-brand/5 transition-all shadow-lg"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" /><circle cx="12" cy="12" r="8" strokeDasharray="2 4" />
        </svg>
      </button>
      {hasRoute && (
        <button
          onClick={onClearRoute}
          title="Clear route"
          className="w-10 h-10 glass rounded-xl flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-50 transition-all shadow-lg text-lg"
        >✕</button>
      )}
    </div>
  )
}

function RouteInfo({ route }) {
  if (!route) return null
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 animate-slide-up">
      <div className="glass rounded-2xl px-6 py-3 flex items-center gap-6 shadow-xl">
        <div className="text-center">
          <div className="text-brand font-bold text-lg">{route.duration_text}</div>
          <div className="text-slate-400 text-xs">ETA</div>
        </div>
        <div className="w-px h-8 bg-slate-200" />
        <div className="text-center">
          <div className="text-slate-800 font-medium">{route.distance_text}</div>
          <div className="text-slate-400 text-xs">Distance</div>
        </div>
        {route.steps?.length > 0 && (
          <>
            <div className="w-px h-8 bg-slate-200" />
            <div className="max-w-[180px]">
              <div className="text-slate-600 text-xs truncate">{route.steps[0].instruction?.replace(/<[^>]+>/g, '') || route.steps[0].maneuver}</div>
              <div className="text-slate-400 text-[10px]">Next step</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function MapView({ currentLocation, route, places, insights, bookmarks, onMapClick }) {
  const [mapInstance, setMapInstance] = useState(null)
  const defaultCenter = currentLocation || { lat: 41.015137, lng: 28.979530 }

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
          {currentLocation && (
            <AdvancedMarker position={currentLocation} title="You are here">
              <div className="w-5 h-5 bg-brand rounded-full border-2 border-white shadow-lg location-pulse" />
            </AdvancedMarker>
          )}

          {route?.encoded_polyline && <RoutePolyline encodedPolyline={route.encoded_polyline} />}

          {route?.origin_latlng && (
            <AdvancedMarker position={route.origin_latlng} title="Start">
              <Pin background="#10b981" borderColor="#059669" glyphColor="white" glyph="A" />
            </AdvancedMarker>
          )}
          {route?.destination_latlng && (
            <AdvancedMarker position={route.destination_latlng} title="Destination">
              <Pin background="#ef4444" borderColor="#dc2626" glyphColor="white" glyph="B" />
            </AdvancedMarker>
          )}

          {route?.waypoints?.map((wp, i) => (
            <AdvancedMarker key={`wp-${i}`} position={wp} title={`Stop ${i + 1}`}>
              <Pin background="#8b5cf6" borderColor="#7c3aed" glyphColor="white" glyph={String(i + 1)} />
            </AdvancedMarker>
          ))}

          {places?.map((place, i) => (
            <AdvancedMarker key={`place-${place.place_id || i}`} position={{ lat: place.lat, lng: place.lng }} title={place.name}>
              <div className="glass rounded-xl px-2 py-1 flex items-center gap-1 text-xs text-slate-700 shadow-md border border-slate-200 hover:border-brand/40 cursor-pointer transition-all">
                <span>{getPlaceIcon(place.types)}</span>
                <span className="max-w-[80px] truncate font-medium">{place.name}</span>
              </div>
            </AdvancedMarker>
          ))}

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
        <RouteInfo route={route} />
      </div>
    </APIProvider>
  )
}
