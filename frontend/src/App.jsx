import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Landing from './pages/Landing'
import MapApp from './pages/MapApp'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-dark-900">
      <div className="flex gap-2">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    </div>
  )
  return user ? children : <Navigate to="/" replace />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return null
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
