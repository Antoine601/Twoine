import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Users, 
  Globe, 
  Server, 
  Database, 
  HardDrive, 
  Cpu, 
  MemoryStick,
  Clock,
  AlertTriangle,
  ArrowRight,
  Activity
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import StatusBadge from '../components/ui/StatusBadge'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [systemStats, setSystemStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadSystemStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      await Promise.all([loadStats(), loadSystemStats()])
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const response = await api.get('/admin/stats')
      setStats(response.data.data)
    } catch (error) {
      toast.error('Erreur lors du chargement des statistiques')
    }
  }

  const loadSystemStats = async () => {
    try {
      const response = await api.get('/stats/system')
      setSystemStats(response.data.data)
      
      const newAlerts = []
      if (response.data.data?.cpu?.percent > 80) {
        newAlerts.push({ type: 'warning', message: 'CPU élevé (>80%)' })
      }
      if (response.data.data?.memory?.percent > 80) {
        newAlerts.push({ type: 'warning', message: 'Mémoire élevée (>80%)' })
      }
      if (response.data.data?.disk?.percent > 90) {
        newAlerts.push({ type: 'danger', message: 'Disque quasi plein (>90%)' })
      }
      setAlerts(newAlerts)
    } catch (error) {
      console.error('Error loading system stats:', error)
    }
  }

  if (loading) {
    return <PageLoading />
  }

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatUptime = (seconds) => {
    if (!seconds) return 'N/A'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}j ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Vue d'ensemble du système</p>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((alert, index) => (
            <div 
              key={index}
              className={`flex items-center gap-3 p-4 rounded-lg border ${
                alert.type === 'danger' 
                  ? 'bg-danger-900/50 border-danger-700' 
                  : 'bg-warning-900/50 border-warning-700'
              }`}
            >
              <AlertTriangle className={`w-5 h-5 ${
                alert.type === 'danger' ? 'text-danger-500' : 'text-warning-500'
              }`} />
              <span className={alert.type === 'danger' ? 'text-danger-300' : 'text-warning-300'}>
                {alert.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary-900/50 rounded-lg flex items-center justify-center">
              <Cpu className="w-6 h-6 text-primary-400" />
            </div>
            <StatusBadge status={systemStats?.cpu?.percent > 80 ? 'warning' : 'healthy'} />
          </div>
          <p className="stat-value">{systemStats?.cpu?.percent?.toFixed(1) || 0}%</p>
          <p className="stat-label">Utilisation CPU</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-accent-900/50 rounded-lg flex items-center justify-center">
              <MemoryStick className="w-6 h-6 text-accent-400" />
            </div>
            <StatusBadge status={systemStats?.memory?.percent > 80 ? 'warning' : 'healthy'} />
          </div>
          <p className="stat-value">{systemStats?.memory?.percent?.toFixed(1) || 0}%</p>
          <p className="stat-label">
            RAM ({formatBytes(systemStats?.memory?.used)} / {formatBytes(systemStats?.memory?.total)})
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-warning-900/50 rounded-lg flex items-center justify-center">
              <HardDrive className="w-6 h-6 text-warning-400" />
            </div>
            <StatusBadge status={systemStats?.disk?.percent > 90 ? 'danger' : systemStats?.disk?.percent > 80 ? 'warning' : 'healthy'} />
          </div>
          <p className="stat-value">{systemStats?.disk?.percent?.toFixed(1) || 0}%</p>
          <p className="stat-label">
            Disque ({formatBytes(systemStats?.disk?.used)} / {formatBytes(systemStats?.disk?.total)})
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-danger-900/50 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-danger-400" />
            </div>
            <StatusBadge status="online" />
          </div>
          <p className="stat-value">{formatUptime(systemStats?.uptime)}</p>
          <p className="stat-label">Uptime serveur</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link to="/users" className="stat-card hover:border-primary-600 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-value">{stats?.users?.total || 0}</p>
              <p className="stat-label">Utilisateurs</p>
            </div>
            <div className="w-12 h-12 bg-primary-900/50 rounded-lg flex items-center justify-center group-hover:bg-primary-800/50 transition-colors">
              <Users className="w-6 h-6 text-primary-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs">
            <span className="text-accent-400">{stats?.users?.active || 0} actifs</span>
            <span className="text-danger-400">{stats?.users?.blocked || 0} bloqués</span>
          </div>
        </Link>

        <Link to="/sites" className="stat-card hover:border-primary-600 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-value">{stats?.sites?.total || 0}</p>
              <p className="stat-label">Sites</p>
            </div>
            <div className="w-12 h-12 bg-accent-900/50 rounded-lg flex items-center justify-center group-hover:bg-accent-800/50 transition-colors">
              <Globe className="w-6 h-6 text-accent-400" />
            </div>
          </div>
        </Link>

        <Link to="/services" className="stat-card hover:border-primary-600 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-value">{stats?.services?.total || 0}</p>
              <p className="stat-label">Services</p>
            </div>
            <div className="w-12 h-12 bg-warning-900/50 rounded-lg flex items-center justify-center group-hover:bg-warning-800/50 transition-colors">
              <Server className="w-6 h-6 text-warning-400" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs">
            <span className="text-accent-400">{stats?.services?.running || 0} actifs</span>
            <span className="text-danger-400">{stats?.services?.stopped || 0} arrêtés</span>
          </div>
        </Link>

        <Link to="/databases" className="stat-card hover:border-primary-600 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-value">{stats?.databases?.total || 0}</p>
              <p className="stat-label">Bases de données</p>
            </div>
            <div className="w-12 h-12 bg-danger-900/50 rounded-lg flex items-center justify-center group-hover:bg-danger-800/50 transition-colors">
              <Database className="w-6 h-6 text-danger-400" />
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Dernières connexions</h2>
            <Link to="/security" className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1">
              Voir tout <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="card-body p-0">
            {stats?.recentLogins?.length > 0 ? (
              <div className="divide-y divide-admin-700">
                {stats.recentLogins.slice(0, 5).map((login, index) => (
                  <div key={index} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{login.username}</p>
                      <p className="text-xs text-admin-500">{login.lastLoginIP || 'IP inconnue'}</p>
                    </div>
                    <p className="text-xs text-admin-400">
                      {login.lastLoginAt ? new Date(login.lastLoginAt).toLocaleString('fr-FR') : 'N/A'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-8 text-center text-admin-500">
                Aucune connexion récente
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Utilisateurs par rôle</h2>
          </div>
          <div className="card-body">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-admin-300">Administrateurs</span>
                  <span className="text-sm font-medium text-white">{stats?.users?.byRole?.admin || 0}</span>
                </div>
                <div className="h-2 bg-admin-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${((stats?.users?.byRole?.admin || 0) / (stats?.users?.total || 1)) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-admin-300">Utilisateurs</span>
                  <span className="text-sm font-medium text-white">{stats?.users?.byRole?.user || 0}</span>
                </div>
                <div className="h-2 bg-admin-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent-500 rounded-full"
                    style={{ width: `${((stats?.users?.byRole?.user || 0) / (stats?.users?.total || 1)) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-admin-300">Lecture seule</span>
                  <span className="text-sm font-medium text-white">{stats?.users?.byRole?.readonly || 0}</span>
                </div>
                <div className="h-2 bg-admin-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-warning-500 rounded-full"
                    style={{ width: `${((stats?.users?.byRole?.readonly || 0) / (stats?.users?.total || 1)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
