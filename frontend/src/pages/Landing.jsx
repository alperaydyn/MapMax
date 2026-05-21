import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '../contexts/AuthContext'

export default function Landing() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', name: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register, googleLogin } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(form.email, form.password)
      } else {
        if (!form.name.trim()) { setError('Name is required'); setLoading(false); return }
        if (form.password.length > 72) { setError('Password must be 72 characters or fewer'); setLoading(false); return }
        await register(form.email, form.name, form.password)
      }
      navigate('/map')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setError('')
      setLoading(true)
      try {
        // Exchange access token for user info, then pass id_token to backend
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        })
        const userInfo = await userInfoRes.json()
        await googleLogin(tokenResponse.access_token, userInfo)
        navigate('/map')
      } catch (err) {
        setError(err.message || 'Google sign-in failed')
      } finally {
        setLoading(false)
      }
    },
    onError: () => setError('Google sign-in was cancelled or failed'),
  })

  const handleGoogleIdToken = useGoogleLogin({
    onSuccess: async (credentialResponse) => {
      setError('')
      setLoading(true)
      try {
        await googleLogin(credentialResponse.credential)
        navigate('/map')
      } catch (err) {
        setError(err.message || 'Google sign-in failed')
      } finally {
        setLoading(false)
      }
    },
    onError: () => setError('Google sign-in was cancelled or failed'),
    flow: 'implicit',
  })

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand/20 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-success/5 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Header */}
      <div className="relative z-10 text-center mb-8 animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-12 h-12 bg-gradient-to-br from-brand to-accent rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-brand/30">
            🗺️
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-brand-light via-white to-accent bg-clip-text text-transparent">
            MapMax
          </h1>
        </div>
        <p className="text-white/50 text-lg">Your intelligent AI map companion</p>
      </div>

      {/* Feature pills */}
      <div className="relative z-10 flex flex-wrap justify-center gap-2 mb-8 px-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        {[
          { icon: '🎙️', label: 'Voice Navigation' },
          { icon: '🧠', label: 'Learns Your Routine' },
          { icon: '⚡', label: 'Smart Waypoints' },
          { icon: '📍', label: 'Location Memory' },
        ].map(f => (
          <span key={f.label} className="glass-light text-white/70 text-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <span>{f.icon}</span> {f.label}
          </span>
        ))}
      </div>

      {/* Auth card */}
      <div className="relative z-10 w-full max-w-sm mx-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <div className="panel p-8">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white/5 p-1 rounded-xl">
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 capitalize
                  ${mode === m ? 'bg-brand text-white shadow-lg shadow-brand/30' : 'text-white/50 hover:text-white/80'}`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Google Sign-In */}
          <button
            onClick={() => handleGoogleIdToken()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-medium py-2.5 px-4 rounded-xl transition-all duration-200 mb-4 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-white/30 text-xs">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-white/60 text-sm mb-1.5">Full Name</label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="input-field"
                  autoFocus
                />
              </div>
            )}
            <div>
              <label className="block text-white/60 text-sm mb-1.5">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="input-field"
                autoFocus={mode === 'login'}
              />
            </div>
            <div>
              <label className="block text-white/60 text-sm mb-1.5">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="input-field"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading ? (
                <>
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                  <span className="thinking-dot" />
                </>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
        </div>
      </div>

      <p className="relative z-10 mt-6 text-white/25 text-sm animate-fade-in" style={{ animationDelay: '0.3s' }}>
        Your intelligent map assistant — always learning, always helpful
      </p>
    </div>
  )
}
