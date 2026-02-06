import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'

import Layout from './components/layout/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SitesPage from './pages/SitesPage'
import SiteDetailPage from './pages/SiteDetailPage'
import ServicesPage from './pages/ServicesPage'
import FilesPage from './pages/FilesPage'
import DatabasesPage from './pages/DatabasesPage'
import DomainsPage from './pages/DomainsPage'
import StatsPage from './pages/StatsPage'
import ProfilePage from './pages/ProfilePage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import NotFoundPage from './pages/NotFoundPage'
import AboutPage from './pages/AboutPage'
import FormationsPage from './pages/FormationsPage'
import FormationDetailPage from './pages/FormationDetailPage'
import ProductsPage from './pages/ProductsPage'
import ProductDetailPage from './pages/ProductDetailPage'
import NotificationsPage from './pages/NotificationsPage'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">Loading...</p>
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

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/sites/:siteId" element={<SiteDetailPage />} />
          <Route path="/sites/:siteId/services" element={<ServicesPage />} />
          <Route path="/sites/:siteId/files" element={<FilesPage />} />
          <Route path="/sites/:siteId/files/*" element={<FilesPage />} />
          <Route path="/sites/:siteId/databases" element={<DatabasesPage />} />
          <Route path="/sites/:siteId/domains" element={<DomainsPage />} />
          <Route path="/sites/:siteId/stats" element={<StatsPage />} />
          <Route path="/a-propos" element={<AboutPage />} />
          <Route path="/formations" element={<FormationsPage />} />
          <Route path="/formations/:slug" element={<FormationDetailPage />} />
          <Route path="/produits" element={<ProductsPage />} />
          <Route path="/produits/:slug" element={<ProductDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
