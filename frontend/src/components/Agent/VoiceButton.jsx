import React, { useState, useRef, useCallback, useEffect } from 'react'

const SUPPORTED = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

export default function VoiceButton({ onTranscript, disabled }) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef(null)

  useEffect(() => {
    if (!SUPPORTED) return
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SpeechRecognition()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'

    rec.onresult = (e) => {
      const current = Array.from(e.results).map(r => r[0].transcript).join('')
      setTranscript(current)
      if (e.results[0].isFinal) {
        onTranscript(current)
        setTranscript('')
        setListening(false)
      }
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
  }, [onTranscript])

  const toggle = useCallback(() => {
    if (!SUPPORTED || disabled) return
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
    } else {
      recognitionRef.current?.start()
      setListening(true)
    }
  }, [listening, disabled])

  if (!SUPPORTED) return null

  return (
    <div className="flex flex-col items-center gap-2">
      {transcript && (
        <div className="text-xs text-white/50 italic max-w-[160px] text-center truncate">{transcript}</div>
      )}
      <button
        onClick={toggle}
        disabled={disabled}
        title={listening ? 'Stop recording' : 'Start voice input'}
        className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200
          ${listening
            ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/40'
            : 'bg-white/10 hover:bg-white/20'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
      >
        {listening && (
          <>
            <span className="voice-ring" />
            <span className="voice-ring voice-ring-2" />
          </>
        )}
        <svg className="w-4 h-4 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24">
          {listening ? (
            <rect x="6" y="6" width="12" height="12" rx="2" />
          ) : (
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93H2c0 4.42 3.12 8.07 7 8.87V22h2v-2.93c3.88-.8 7-4.45 7-8.87h-2c0 3.53-2.61 6.43-6 6.93z" />
          )}
        </svg>
      </button>
    </div>
  )
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = 1.05
  utter.pitch = 1
  window.speechSynthesis.speak(utter)
}
