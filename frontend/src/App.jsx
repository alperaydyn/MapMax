import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Landing from './pages/Landing'
import MapApp from './pages/MapApp'

function Spinner() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <div className="w-12 h-12 bg-gradient-to-br from-brand to-accent rounded-2xl flex items-center justify-center text-2xl shadow-lg">
        🗺️
      </div>
      <div className="flex gap-1.5">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return user ? children : <Navigate to="/" replace />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/map" replace /> : <Landing />} />
      <Route path="/map" element={<ProtectedRoute><MapApp /></ProtectedRoute>} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
