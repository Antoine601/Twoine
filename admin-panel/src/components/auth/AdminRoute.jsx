import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminRoute() {
  const { user, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-admin-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-admin-400">Vérification des droits...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-admin-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-danger-500 mb-4">Accès refusé</h1>
          <p className="text-admin-400 mb-6">Cette interface est réservée aux administrateurs.</p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="btn btn-primary"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
