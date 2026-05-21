import React, { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'

const INSIGHT_ICONS = { home: '🏠', work: '💼', school: '🎓', gym: '🏋️', frequent: '⭐', shopping: '🛍️' }
const CATEGORY_ICONS = { home: '🏠', work: '💼', school: '🎓', gym: '🏋️', favorite: '❤️', charging: '⚡', restaurant: '🍽️', shopping: '🛒' }

function ConfidenceBar({ value }) {
  return (
    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${Math.round(value * 100)}%`,
          background: value > 0.7 ? '#10b981' : value > 0.4 ? '#f59e0b' : '#6b7280',
        }}
      />
    </div>
  )
}

export default function MemoryPanel({ onLocationSelect, collapsed, onToggle }) {
  const { token } = useAuth()
  const [insights, setInsights] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [tab, setTab] = useState('insights')
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try {
      const [ins, bks] = await Promise.all([api.getInsights(token), api.getBookmarks(token)])
      setInsights(ins.insights || [])
      setBookmarks(bks.bookmarks || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { reload() }, [token])

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="glass rounded-2xl p-3 flex flex-col items-center gap-1 shadow-xl cursor-pointer hover:bg-white/10 transition-all"
        title="Open memory"
      >
        <span className="text-xl">🧠</span>
        <span className="text-white/50 text-[10px]">Memory</span>
        {(insights.length + bookmarks.length) > 0 && (
          <span className="bg-brand text-white text-[9px] rounded-full px-1.5 py-0.5 leading-none">
            {insights.length + bookmarks.length}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="panel flex flex-col h-full w-72 max-h-[calc(100vh-2rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <span className="text-sm font-semibold text-white">Location Memory</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={reload} title="Refresh" className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 flex items-center justify-center text-xs transition-all">
            ↻
          </button>
          <button onClick={onToggle} className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 flex items-center justify-center transition-all">
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-white/5">
        {[['insights', '💡 Insights'], ['bookmarks', '🔖 Saved']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 text-xs py-1.5 rounded-lg transition-all font-medium
              ${tab === key ? 'bg-brand/20 text-brand-light' : 'text-white/40 hover:text-white/70'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="flex gap-1.5">
              <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
            </div>
          </div>
        ) : tab === 'insights' ? (
          insights.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🗺️</div>
              <div className="text-white/40 text-sm">No patterns learned yet</div>
              <div className="text-white/25 text-xs mt-1">Use the app to let MapMax learn your routine</div>
            </div>
          ) : (
            insights.map(ins => (
              <button
                key={ins.id}
                onClick={() => onLocationSelect?.({ lat: ins.lat, lng: ins.lng, label: ins.place_name })}
                className="w-full text-left glass-light rounded-xl p-3 hover:bg-white/10 transition-all group"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-xl flex-shrink-0">{INSIGHT_ICONS[ins.insight_type] || '📍'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-white/90 text-sm font-medium capitalize">{ins.insight_type}</span>
                      <span className="text-white/40 text-xs">{Math.round(ins.confidence * 100)}%</span>
                    </div>
                    <div className="text-white/60 text-xs truncate mb-1.5">{ins.place_name || ins.address}</div>
                    <ConfidenceBar value={ins.confidence} />
                  </div>
                </div>
              </button>
            ))
          )
        ) : (
          bookmarks.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🔖</div>
              <div className="text-white/40 text-sm">No saved places yet</div>
              <div className="text-white/25 text-xs mt-1">Say "bookmark this place as Home"</div>
            </div>
          ) : (
            bookmarks.map(bk => (
              <button
                key={bk.id}
                onClick={() => onLocationSelect?.({ lat: bk.lat, lng: bk.lng, label: bk.name })}
                className="w-full text-left glass-light rounded-xl p-3 hover:bg-white/10 transition-all group"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-xl flex-shrink-0">{CATEGORY_ICONS[bk.category] || '📍'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white/90 text-sm font-medium truncate">{bk.name}</div>
                    <div className="text-white/45 text-xs truncate mt-0.5">{bk.address || 'No address'}</div>
                    {bk.visit_count > 0 && (
                      <div className="text-white/30 text-xs mt-1">{bk.visit_count} visits</div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )
        )}
      </div>
    </div>
  )
}
