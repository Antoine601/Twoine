import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'

import Layout from './components/layout/Layout'
import AdminRoute from './components/auth/AdminRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import UsersPage from './pages/UsersPage'
import UserDetailPage from './pages/UserDetailPage'
import SitesPage from './pages/SitesPage'
import SiteDetailPage from './pages/SiteDetailPage'
import ServicesPage from './pages/ServicesPage'
import FilesPage from './pages/FilesPage'
import DatabasesPage from './pages/DatabasesPage'
import DomainsPage from './pages/DomainsPage'
import StatsPage from './pages/StatsPage'
import SecurityPage from './pages/SecurityPage'
import ConfigPage from './pages/ConfigPage'
import ProfilePage from './pages/ProfilePage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-admin-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-admin-400">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route 
        path="/login" 
        element={user ? <Navigate to="/" replace /> : <LoginPage />} 
      />

      {/* Protected admin routes */}
      <Route element={<AdminRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          
          {/* Users */}
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/:userId" element={<UserDetailPage />} />
          
          {/* Sites */}
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/sites/:siteId" element={<SiteDetailPage />} />
          
          {/* Services */}
          <Route path="/services" element={<ServicesPage />} />
          
          {/* Files */}
          <Route path="/files" element={<FilesPage />} />
          <Route path="/files/:siteId" element={<FilesPage />} />
          <Route path="/files/:siteId/*" element={<FilesPage />} />
          
          {/* Databases */}
          <Route path="/databases" element={<DatabasesPage />} />
          
          {/* Domains */}
          <Route path="/domains" element={<DomainsPage />} />
          
          {/* Stats */}
          <Route path="/stats" element={<StatsPage />} />
          
          {/* Security */}
          <Route path="/security" element={<SecurityPage />} />
          
          {/* Config */}
          <Route path="/config" element={<ConfigPage />} />
          
          {/* Profile */}
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
