import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../config/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        setLoading(false)
        return
      }

      const response = await api.get('/auth/me')
      setUser(response.data.data)
    } catch (error) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const login = async (identifier, password) => {
    const response = await api.post('/auth/login', { email: identifier, password })
    const { accessToken, refreshToken, user: userData } = response.data.data

    localStorage.setItem('accessToken', accessToken)
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken)
    }

    setUser(userData)
    return userData
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      setUser(null)
    }
  }

  const changePassword = async (currentPassword, newPassword) => {
    await api.post('/auth/change-password', { currentPassword, newPassword })
    await logout()
  }

  const updateProfile = async (data) => {
    await api.put('/auth/me', data)
    await fetchUser()
  }

  const isReadonly = user?.role === 'readonly'
  const isUser = user?.role === 'user'
  const isAdmin = user?.role === 'admin'

  const canWrite = !isReadonly

  const value = {
    user,
    loading,
    login,
    logout,
    changePassword,
    updateProfile,
    fetchUser,
    isReadonly,
    isUser,
    isAdmin,
    canWrite,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
