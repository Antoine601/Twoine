import { useState, useEffect } from 'react'
import { 
  Shield, 
  Key, 
  Users, 
  Clock,
  AlertTriangle,
  CheckCircle,
  Lock,
  RefreshCw,
  Eye,
  LogIn
} from 'lucide-react'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import DataTable from '../components/ui/DataTable'
import StatusBadge from '../components/ui/StatusBadge'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function SecurityPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [recentLogins, setRecentLogins] = useState([])
  const [blockedUsers, setBlockedUsers] = useState([])
  const [passwordPolicy, setPasswordPolicy] = useState({
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxAge: 90
  })

  useEffect(() => {
    loadSecurityData()
  }, [])

  const loadSecurityData = async () => {
    try {
      setLoading(true)
      const [statsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users?status=blocked&limit=10')
      ])
      
      setStats(statsRes.data.data)
      setRecentLogins(statsRes.data.data.recentLogins || [])
      setBlockedUsers(usersRes.data.data.users || [])
    } catch (error) {
      toast.error('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <PageLoading />

  const securityChecks = [
    {
      name: 'JWT Authentication',
      status: 'active',
      description: 'Authentification par tokens JWT sécurisés'
    },
    {
      name: 'Rate Limiting',
      status: 'active',
      description: 'Protection contre les attaques par force brute'
    },
    {
      name: 'CORS Policy',
      status: 'active',
      description: 'Politique CORS configurée'
    },
    {
      name: 'Helmet Security',
      status: 'active',
      description: 'Headers de sécurité HTTP'
    },
    {
      name: 'Password Hashing',
      status: 'active',
      description: 'Bcrypt avec salt pour le stockage des mots de passe'
    },
    {
      name: 'Session Management',
      status: 'active',
      description: 'Gestion des sessions avec expiration'
    }
  ]

  const loginColumns = [
    {
      key: 'username',
      title: 'Utilisateur',
      render: (username) => (
        <div className="flex items-center gap-2">
          <LogIn className="w-4 h-4 text-admin-500" />
          <span className="text-white">{username}</span>
        </div>
      )
    },
    {
      key: 'lastLoginIP',
      title: 'Adresse IP',
      render: (ip) => (
        <span className="text-admin-300 font-mono text-sm">{ip || 'N/A'}</span>
      )
    },
    {
      key: 'lastLoginAt',
      title: 'Date',
      render: (date) => (
        <span className="text-admin-400 text-sm">
          {date ? format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: fr }) : 'N/A'}
        </span>
      )
    }
  ]

  const blockedColumns = [
    {
      key: 'username',
      title: 'Utilisateur',
      render: (username) => (
        <span className="text-white">{username}</span>
      )
    },
    {
      key: 'blockedReason',
      title: 'Raison',
      render: (reason) => (
        <span className="text-admin-400">{reason || 'Non spécifiée'}</span>
      )
    },
    {
      key: 'blockedAt',
      title: 'Bloqué le',
      render: (date) => (
        <span className="text-admin-400 text-sm">
          {date ? format(new Date(date), 'dd/MM/yyyy', { locale: fr }) : 'N/A'}
        </span>
      )
    },
    {
      key: 'status',
      title: 'État',
      render: () => <StatusBadge status="blocked" />
    }
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Sécurité & Authentification</h1>
        <p className="page-subtitle">Paramètres de sécurité et historique des connexions</p>
      </div>

      {/* Security Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent-900/50 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-accent-400" />
            </div>
            <div>
              <p className="stat-value text-accent-400">{securityChecks.filter(c => c.status === 'active').length}/{securityChecks.length}</p>
              <p className="stat-label">Sécurité OK</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-900/50 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <p className="stat-value">{stats?.users?.active || 0}</p>
              <p className="stat-label">Utilisateurs actifs</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-danger-900/50 rounded-lg flex items-center justify-center">
              <Lock className="w-6 h-6 text-danger-400" />
            </div>
            <div>
              <p className="stat-value text-danger-400">{stats?.users?.blocked || 0}</p>
              <p className="stat-label">Comptes bloqués</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-warning-900/50 rounded-lg flex items-center justify-center">
              <Key className="w-6 h-6 text-warning-400" />
            </div>
            <div>
              <p className="stat-value">{passwordPolicy.minLength}+</p>
              <p className="stat-label">Longueur min MDP</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Security Checks */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-white">État de la Sécurité</h2>
          </div>
          <div className="card-body p-0">
            <div className="divide-y divide-admin-700">
              {securityChecks.map((check, index) => (
                <div key={index} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    {check.status === 'active' ? (
                      <CheckCircle className="w-5 h-5 text-accent-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-warning-400" />
                    )}
                    <div>
                      <p className="text-white font-medium">{check.name}</p>
                      <p className="text-xs text-admin-500">{check.description}</p>
                    </div>
                  </div>
                  <StatusBadge status={check.status} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Password Policy */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-white">Politique de Mot de Passe</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="flex items-center justify-between p-3 bg-admin-700/50 rounded-lg">
              <span className="text-admin-300">Longueur minimale</span>
              <span className="text-white font-medium">{passwordPolicy.minLength} caractères</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-admin-700/50 rounded-lg">
              <span className="text-admin-300">Majuscules requises</span>
              <span className={passwordPolicy.requireUppercase ? 'text-accent-400' : 'text-admin-500'}>
                {passwordPolicy.requireUppercase ? 'Oui' : 'Non'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-admin-700/50 rounded-lg">
              <span className="text-admin-300">Minuscules requises</span>
              <span className={passwordPolicy.requireLowercase ? 'text-accent-400' : 'text-admin-500'}>
                {passwordPolicy.requireLowercase ? 'Oui' : 'Non'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-admin-700/50 rounded-lg">
              <span className="text-admin-300">Chiffres requis</span>
              <span className={passwordPolicy.requireNumbers ? 'text-accent-400' : 'text-admin-500'}>
                {passwordPolicy.requireNumbers ? 'Oui' : 'Non'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-admin-700/50 rounded-lg">
              <span className="text-admin-300">Caractères spéciaux</span>
              <span className={passwordPolicy.requireSpecialChars ? 'text-accent-400' : 'text-admin-500'}>
                {passwordPolicy.requireSpecialChars ? 'Oui' : 'Non'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-admin-700/50 rounded-lg">
              <span className="text-admin-300">Expiration</span>
              <span className="text-white font-medium">{passwordPolicy.maxAge} jours</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Logins & Blocked Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Dernières Connexions</h2>
            <button onClick={loadSecurityData} className="btn btn-ghost btn-sm">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <DataTable
            columns={loginColumns}
            data={recentLogins}
            emptyTitle="Aucune connexion récente"
            emptyIcon={LogIn}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-white">Comptes Bloqués</h2>
          </div>
          <DataTable
            columns={blockedColumns}
            data={blockedUsers}
            emptyTitle="Aucun compte bloqué"
            emptyIcon={Lock}
          />
        </div>
      </div>
    </div>
  )
}
