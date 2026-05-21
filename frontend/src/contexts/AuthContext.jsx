import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('mapmax_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      api.getMe(token)
        .then(u => setUser(u))
        .catch(() => { localStorage.removeItem('mapmax_token'); setToken(null) })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password)
    localStorage.setItem('mapmax_token', data.access_token)
    setToken(data.access_token)
    setUser(data.user)
    return data
  }, [])

  const register = useCallback(async (email, name, password) => {
    const data = await api.register(email, name, password)
    localStorage.setItem('mapmax_token', data.access_token)
    setToken(data.access_token)
    setUser(data.user)
    return data
  }, [])

  const googleLogin = useCallback(async (credential) => {
    const data = await api.googleAuth(credential)
    localStorage.setItem('mapmax_token', data.access_token)
    setToken(data.access_token)
    setUser(data.user)
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('mapmax_token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
