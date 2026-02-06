import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-admin-900 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-admin-700">404</h1>
        <h2 className="text-2xl font-semibold text-white mt-4">Page non trouvée</h2>
        <p className="text-admin-400 mt-2 max-w-md mx-auto">
          La page que vous recherchez n'existe pas ou a été déplacée.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8">
          <button 
            onClick={() => window.history.back()}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
          <Link to="/" className="btn btn-primary">
            <Home className="w-4 h-4" /> Accueil
          </Link>
        </div>
      </div>
    </div>
  )
}
