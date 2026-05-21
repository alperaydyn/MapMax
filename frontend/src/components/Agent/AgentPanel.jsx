import React, { useState, useRef, useEffect, useCallback } from 'react'
import VoiceButton, { speak } from './VoiceButton'

function ThinkingIndicator() {
  return (
    <div className="flex items-end gap-2 animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand to-accent flex items-center justify-center text-xs flex-shrink-0">
        M
      </div>
      <div className="glass-light px-4 py-3 rounded-2xl rounded-bl-sm max-w-[80%]">
        <div className="flex gap-1.5 items-center">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      </div>
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex items-end gap-2 animate-slide-up ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand to-accent flex items-center justify-center text-xs flex-shrink-0 mb-0.5">
          M
        </div>
      )}
      <div className={`px-4 py-2.5 rounded-2xl max-w-[82%] text-sm leading-relaxed
        ${isUser
          ? 'bg-brand text-white rounded-br-sm ml-auto'
          : 'glass-light text-white/90 rounded-bl-sm'
        }`}>
        {msg.content}
      </div>
    </div>
  )
}

function ActionBadge({ action }) {
  const icons = {
    navigate: '🧭',
    show_places: '📍',
    update_markers: '🔖',
    show_insight: '💡',
  }
  const labels = {
    navigate: 'Navigating',
    show_places: 'Showing places',
    update_markers: 'Bookmarks updated',
    show_insight: 'New insight',
  }
  return (
    <div className="flex justify-center">
      <span className="glass-light text-white/60 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
        <span>{icons[action.type] || '⚡'}</span>
        <span>{labels[action.type] || action.type}</span>
      </span>
    </div>
  )
}

export default function AgentPanel({ socket, currentLocation, onAction, collapsed, onToggle }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m MapMax, your AI map assistant. You can speak or type to navigate, search places, save bookmarks, or ask anything about your surroundings.' }
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const sendMessage = useCallback((text) => {
    if (!text.trim() || thinking || !socket?.ready) return
    const content = text.trim()
    setMessages(prev => [...prev, { role: 'user', content }])
    setInput('')
    setThinking(true)
    socket.send(content, currentLocation)
  }, [thinking, socket, currentLocation])

  useEffect(() => {
    if (!socket) return
    const origOnMessage = socket._onMessage

    socket.onAgentMessage = (data) => {
      setThinking(false)
      if (data.type === 'response') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
        if (voiceMode && data.content) speak(data.content)
        if (data.actions?.length) {
          data.actions.forEach(action => {
            setMessages(prev => [...prev, { role: 'action', action }])
            onAction?.(action)
          })
        }
      } else if (data.type === 'error') {
        setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I ran into an issue: ${data.message}` }])
      } else if (data.type === 'thinking') {
        setThinking(true)
      }
    }
  }, [socket, voiceMode, onAction])

  // Wire socket messages to handler
  useEffect(() => {
    if (!socket) return
    const handler = (data) => {
      setThinking(false)
      if (data.type === 'response') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
        if (voiceMode && data.content) speak(data.content)
        if (data.actions?.length) {
          data.actions.forEach(action => {
            setMessages(prev => [...prev, { role: 'action', action }])
            onAction?.(action)
          })
        }
      } else if (data.type === 'error') {
        setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${data.message}` }])
      } else if (data.type === 'thinking') {
        setThinking(true)
      }
    }
    socket._messageHandler = handler
  }, [socket, voiceMode, onAction])

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="glass rounded-2xl p-3 flex flex-col items-center gap-1 shadow-xl cursor-pointer hover:bg-white/10 transition-all"
        title="Open assistant"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-brand to-accent rounded-xl flex items-center justify-center text-sm">M</div>
        <span className="text-white/50 text-[10px]">Assistant</span>
      </button>
    )
  }

  return (
    <div className="panel flex flex-col h-full w-80 max-h-[calc(100vh-2rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-brand to-accent rounded-xl flex items-center justify-center text-sm font-bold">
            M
          </div>
          <div>
            <div className="text-sm font-semibold text-white">MapMax</div>
            <div className={`text-[10px] ${socket?.ready ? 'text-success' : 'text-white/30'}`}>
              {socket?.ready ? '● Connected' : '○ Connecting...'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setVoiceMode(v => !v)}
            title={voiceMode ? 'Disable voice responses' : 'Enable voice responses'}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all
              ${voiceMode ? 'bg-brand/30 text-brand-light' : 'bg-white/5 text-white/40 hover:text-white/70'}`}
          >
            🔊
          </button>
          <button onClick={onToggle} className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/50 transition-all">
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 min-h-0">
        {messages.map((msg, i) =>
          msg.role === 'action' ? (
            <ActionBadge key={i} action={msg.action} />
          ) : (
            <Message key={i} msg={msg} />
          )
        )}
        {thinking && <ThinkingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/5">
        <div className="flex items-center gap-2">
          <VoiceButton
            onTranscript={sendMessage}
            disabled={thinking || !socket?.ready}
          />
          <div className="flex-1 flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10 focus-within:border-brand/40 transition-all">
            <input
              ref={inputRef}
              type="text"
              placeholder={socket?.ready ? 'Ask anything...' : 'Connecting...'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
              disabled={thinking || !socket?.ready}
              className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || thinking || !socket?.ready}
              className="w-7 h-7 rounded-lg bg-brand/80 hover:bg-brand flex items-center justify-center disabled:opacity-30 transition-all active:scale-90"
            >
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2 21L23 12 2 3v7l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
