import React, { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'

const INSIGHT_ICONS = { home: '🏠', work: '💼', school: '🎓', gym: '🏋️', frequent: '⭐', shopping: '🛍️' }
const CATEGORY_ICONS = { home: '🏠', work: '💼', school: '🎓', gym: '🏋️', favorite: '❤️', charging: '⚡', restaurant: '🍽️', shopping: '🛒' }

function ConfidenceBar({ value }) {
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${Math.round(value * 100)}%`,
          background: value > 0.7 ? '#10b981' : value > 0.4 ? '#f59e0b' : '#94a3b8',
        }}
      />
    </div>
  )
}

export default function MemoryPanel({ onLocationSelect, collapsed, onToggle, refreshKey }) {
  const { token } = useAuth()
  const [insights, setInsights] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [preferences, setPreferences] = useState([])
  const [tab, setTab] = useState('insights')
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try {
      const [ins, bks, prefs] = await Promise.all([
        api.getInsights(token),
        api.getBookmarks(token),
        api.getPreferences(token),
      ])
      setInsights(ins.insights || [])
      setBookmarks(bks.bookmarks || [])
      setPreferences(prefs.preferences || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { reload() }, [token, refreshKey])

  const handleDeletePreference = async (id) => {
    try {
      await api.deletePreference(token, id)
      setPreferences(prev => prev.filter(p => p.id !== id))
    } catch {}
  }

  const totalCount = insights.length + bookmarks.length + preferences.length

  if (collapsed) {
    return (
      <button onClick={onToggle} className="glass rounded-2xl p-3 flex flex-col items-center gap-1 shadow-lg cursor-pointer hover:bg-black/5 transition-all">
        <span className="text-xl">🧠</span>
        <span className="text-slate-500 text-[10px]">Hafıza</span>
        {totalCount > 0 && (
          <span className="bg-brand text-white text-[9px] rounded-full px-1.5 py-0.5 leading-none">
            {totalCount}
          </span>
        )}
      </button>
    )
  }

  const tabs = [
    ['insights', '💡 İçgörüler'],
    ['bookmarks', '🔖 Yerler'],
    ['preferences', '⚙️ Tercihler'],
  ]

  return (
    <div className="panel flex flex-col h-full w-72 max-h-[calc(100vh-2rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <span className="text-sm font-semibold text-slate-800">Konum Hafızası</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={reload} title="Yenile" className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm transition-all">↻</button>
          <button onClick={onToggle} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all">✕</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-slate-100">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 text-xs py-1.5 rounded-lg transition-all font-medium
              ${tab === key ? 'bg-brand/10 text-brand' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 bg-slate-50/50">
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
              <div className="text-slate-500 text-sm">Henüz örüntü öğrenilmedi</div>
              <div className="text-slate-400 text-xs mt-1">Uygulamayı kullandıkça MapMax rutininizi öğrenir</div>
            </div>
          ) : insights.map(ins => (
            <button key={ins.id}
              onClick={() => onLocationSelect?.({ lat: ins.lat, lng: ins.lng, label: ins.place_name })}
              className="w-full text-left bg-white border border-slate-100 rounded-xl p-3 hover:border-brand/30 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-xl flex-shrink-0">{INSIGHT_ICONS[ins.insight_type] || '📍'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-slate-800 text-sm font-medium capitalize">{ins.insight_type}</span>
                    <span className="text-slate-400 text-xs">{Math.round(ins.confidence * 100)}%</span>
                  </div>
                  <div className="text-slate-500 text-xs truncate mb-1.5">{ins.place_name || ins.address}</div>
                  <ConfidenceBar value={ins.confidence} />
                </div>
              </div>
            </button>
          ))
        ) : tab === 'bookmarks' ? (
          bookmarks.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🔖</div>
              <div className="text-slate-500 text-sm">Henüz kaydedilen yer yok</div>
              <div className="text-slate-400 text-xs mt-1">"Bu yeri Ev olarak kaydet" diyebilirsiniz</div>
            </div>
          ) : bookmarks.map(bk => (
            <button key={bk.id}
              onClick={() => onLocationSelect?.({ lat: bk.lat, lng: bk.lng, label: bk.name })}
              className="w-full text-left bg-white border border-slate-100 rounded-xl p-3 hover:border-brand/30 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-xl flex-shrink-0">{CATEGORY_ICONS[bk.category] || '📍'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-800 text-sm font-medium truncate">{bk.name}</div>
                  <div className="text-slate-400 text-xs truncate mt-0.5">{bk.address || 'Adres yok'}</div>
                  {bk.visit_count > 0 && (
                    <div className="text-slate-300 text-xs mt-1">{bk.visit_count} ziyaret</div>
                  )}
                </div>
              </div>
            </button>
          ))
        ) : (
          /* Preferences tab */
          preferences.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">⚙️</div>
              <div className="text-slate-500 text-sm">Henüz tercih kaydedilmedi</div>
              <div className="text-slate-400 text-xs mt-1 leading-relaxed">
                Asistana tercihlerinizi söyleyin,<br />otomatik olarak hatırlayacak
              </div>
            </div>
          ) : preferences.map(pref => (
            <div key={pref.id}
              className="bg-white border border-slate-100 rounded-xl p-3 flex items-start gap-2.5 group"
            >
              <span className="text-xl flex-shrink-0 mt-0.5">⚙️</span>
              <div className="flex-1 min-w-0">
                <div className="text-slate-800 text-sm font-medium leading-snug">{pref.display_text}</div>
                <div className="text-slate-400 text-[10px] mt-1 uppercase tracking-wide">{pref.category.replace(/_/g, ' ')}</div>
              </div>
              <button
                onClick={() => handleDeletePreference(pref.id)}
                title="Tercihi sil"
                className="opacity-0 group-hover:opacity-100 w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all text-sm mt-0.5"
              >✕</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
