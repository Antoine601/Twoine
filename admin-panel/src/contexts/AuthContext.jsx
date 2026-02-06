import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../config/api'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState(false)

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminAccessToken')
      if (!token) {
        setLoading(false)
        return
      }

      const response = await api.get('/auth/me')
      const userData = response.data.data

      if (userData.role !== 'admin') {
        localStorage.removeItem('adminAccessToken')
        localStorage.removeItem('adminRefreshToken')
        setUser(null)
        toast.error('Accès réservé aux administrateurs')
        setLoading(false)
        return
      }

      setUser(userData)
      setIsImpersonating(response.data.data.isImpersonating || false)
    } catch (error) {
      localStorage.removeItem('adminAccessToken')
      localStorage.removeItem('adminRefreshToken')
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

    if (userData.role !== 'admin') {
      throw new Error('Accès réservé aux administrateurs')
    }

    localStorage.setItem('adminAccessToken', accessToken)
    if (refreshToken) {
      localStorage.setItem('adminRefreshToken', refreshToken)
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
      localStorage.removeItem('adminAccessToken')
      localStorage.removeItem('adminRefreshToken')
      setUser(null)
      setIsImpersonating(false)
    }
  }

  const impersonateUser = async (userId) => {
    try {
      const response = await api.post(`/admin/users/${userId}/impersonate`)
      const { accessToken, refreshToken } = response.data.data

      localStorage.setItem('adminAccessToken', accessToken)
      if (refreshToken) {
        localStorage.setItem('adminRefreshToken', refreshToken)
      }

      setIsImpersonating(true)
      await fetchUser()
      toast.success(`Connecté en tant que ${response.data.data.user.username}`)
      return response.data.data
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de l\'impersonation')
      throw error
    }
  }

  const stopImpersonation = async () => {
    try {
      const response = await api.post('/admin/stop-impersonation')
      const { accessToken, refreshToken } = response.data.data

      localStorage.setItem('adminAccessToken', accessToken)
      if (refreshToken) {
        localStorage.setItem('adminRefreshToken', refreshToken)
      }

      setIsImpersonating(false)
      await fetchUser()
      toast.success('Retour au compte administrateur')
      return response.data.data
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de l\'arrêt de l\'impersonation')
      throw error
    }
  }

  const changePassword = async (currentPassword, newPassword) => {
    await api.post('/auth/change-password', { currentPassword, newPassword })
    toast.success('Mot de passe modifié')
    await logout()
  }

  const value = {
    user,
    loading,
    login,
    logout,
    changePassword,
    fetchUser,
    isImpersonating,
    impersonateUser,
    stopImpersonation,
    isAdmin: user?.role === 'admin',
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
