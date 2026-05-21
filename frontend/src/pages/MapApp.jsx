import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api, createAgentSocket } from '../services/api'
import MapView from '../components/Map/MapView'
import AgentPanel from '../components/Agent/AgentPanel'
import MemoryPanel from '../components/LocationMemory/MemoryPanel'

const LOCATION_INTERVAL = 30_000  // 30 seconds

export default function MapApp() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const [currentLocation, setCurrentLocation] = useState(null)
  const [route, setRoute] = useState(null)
  const [places, setPlaces] = useState([])
  const [insights, setInsights] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [socket, setSocket] = useState(null)
  const [agentCollapsed, setAgentCollapsed] = useState(false)
  const [memoryCollapsed, setMemoryCollapsed] = useState(true)

  // Load initial data
  useEffect(() => {
    Promise.all([api.getInsights(token), api.getBookmarks(token)])
      .then(([ins, bks]) => {
        setInsights(ins.insights || [])
        setBookmarks(bks.bookmarks || [])
      })
      .catch(() => {})
  }, [token])

  // Geolocation tracking
  useEffect(() => {
    if (!navigator.geolocation) return

    const sendLocation = (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords
      setCurrentLocation({ lat, lng })
      api.updateLocation(token, lat, lng, accuracy).catch(() => {})
    }

    const watchId = navigator.geolocation.watchPosition(sendLocation, null, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
    })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [token])

  // WebSocket agent
  useEffect(() => {
    if (!token) return

    const wsObj = createAgentSocket(
      token,
      (data) => wsObj._messageHandler?.(data),
      () => {
        // Reconnect after 3s
        setTimeout(() => {
          if (token) setSocket(null)  // triggers re-mount
        }, 3000)
      }
    )
    setSocket(wsObj)

    return () => wsObj.close()
  }, [token])

  // Handle map actions from agent
  const handleAgentAction = useCallback((action) => {
    switch (action.type) {
      case 'navigate':
        setRoute({
          ...action.route,
          origin_latlng: action.origin,
          destination_latlng: action.destination,
        })
        setPlaces([])
        break
      case 'show_places':
      case 'show_places_along_route':
        setPlaces(action.places || [])
        if (action.route) setRoute(action.route)
        break
      case 'show_place_detail':
        setPlaces(action.place ? [action.place] : [])
        break
      case 'update_markers':
        Promise.all([api.getInsights(token), api.getBookmarks(token)])
          .then(([ins, bks]) => {
            setInsights(ins.insights || [])
            setBookmarks(bks.bookmarks || [])
          })
          .catch(() => {})
        break
    }
  }, [token, route])

  const handleLocationSelect = useCallback(({ lat, lng, label }) => {
    // Pan map to location (trigger via current location state hack)
    setCurrentLocation(prev => ({ ...prev, _focus: { lat, lng } }))
  }, [])

  const handleMapClick = useCallback(({ type }) => {
    if (type === 'clear_route') {
      setRoute(null)
      setPlaces([])
    }
  }, [])

  return (
    <div className="w-screen h-screen flex overflow-hidden relative bg-dark-900">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MapView
          currentLocation={currentLocation}
          route={route}
          places={places}
          insights={insights}
          bookmarks={bookmarks}
          onMapClick={handleMapClick}
        />
      </div>

      {/* Top bar */}
      <div className="absolute top-4 left-4 right-20 flex items-center gap-3 z-10 pointer-events-none">
        <div className="glass rounded-2xl px-4 py-2.5 flex items-center gap-3 pointer-events-auto shadow-xl">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-brand to-accent rounded-lg flex items-center justify-center text-sm">
              🗺️
            </div>
            <span className="font-semibold text-white text-sm">MapMax</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-white/50 text-sm truncate max-w-[200px]">
            {user?.name || 'Welcome'}
          </span>
          {currentLocation && (
            <>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                <span className="text-success text-xs">Live</span>
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Memory toggle */}
        <button
          onClick={() => setMemoryCollapsed(v => !v)}
          className="glass rounded-2xl px-3 py-2.5 flex items-center gap-2 pointer-events-auto hover:bg-white/10 transition-all shadow-xl"
        >
          <span>🧠</span>
          <span className="text-white/70 text-sm hidden sm:block">Memory</span>
          {(insights.length + bookmarks.length) > 0 && (
            <span className="bg-brand text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
              {insights.length + bookmarks.length}
            </span>
          )}
        </button>

        {/* Logout */}
        <button
          onClick={() => { logout(); navigate('/') }}
          className="glass rounded-2xl px-3 py-2.5 text-white/50 hover:text-white/80 text-sm pointer-events-auto transition-all shadow-xl"
        >
          Sign out
        </button>
      </div>

      {/* Left: Agent panel */}
      <div className="absolute left-4 top-20 bottom-4 z-10 flex items-start">
        {agentCollapsed ? (
          <button
            onClick={() => setAgentCollapsed(false)}
            className="glass rounded-2xl p-3 flex flex-col items-center gap-1 shadow-xl cursor-pointer hover:bg-white/10 transition-all"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-brand to-accent rounded-xl flex items-center justify-center text-sm">M</div>
            <span className="text-white/50 text-[10px]">Assistant</span>
          </button>
        ) : (
          <AgentPanel
            socket={socket}
            currentLocation={currentLocation}
            onAction={handleAgentAction}
            collapsed={false}
            onToggle={() => setAgentCollapsed(true)}
          />
        )}
      </div>

      {/* Right: Memory panel */}
      {!memoryCollapsed && (
        <div className="absolute right-4 top-20 bottom-4 z-10 flex items-start">
          <MemoryPanel
            onLocationSelect={handleLocationSelect}
            collapsed={false}
            onToggle={() => setMemoryCollapsed(true)}
          />
        </div>
      )}

      {/* Insight badges overlay (small floating indicators) */}
      {insights.slice(0, 3).map((ins, i) => (
        <div
          key={ins.id}
          className="absolute z-10 animate-fade-in"
          style={{ bottom: `${5 + i * 3.5}rem`, right: memoryCollapsed ? '1rem' : '19rem' }}
        >
          {memoryCollapsed && (
            <div className="glass-light rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-white/60 shadow-lg border border-white/5 pointer-events-none">
              <span>{['🏠','💼','🎓','⭐'][i] || '📍'}</span>
              <span className="capitalize">{ins.insight_type}</span>
              <span className="text-white/30">{Math.round(ins.confidence * 100)}%</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
