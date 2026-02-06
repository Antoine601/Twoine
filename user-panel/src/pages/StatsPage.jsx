import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { 
  Cpu, HardDrive, Clock, Activity, RefreshCw, Server, 
  Globe, AlertTriangle, Play, Square, RotateCcw, Bell,
  CheckCircle
} from 'lucide-react'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'

function StatCard({ icon: Icon, label, value, subValue, color = 'primary', percent }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  }

  const barColors = {
    primary: 'bg-primary-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    red: 'bg-red-500',
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-4">
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center', colors[color])}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {subValue && <p className="text-xs text-gray-400">{subValue}</p>}
        </div>
      </div>
      {percent !== undefined && (
        <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={clsx('h-full rounded-full transition-all', barColors[color])}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default function StatsPage() {
  const { siteId } = useParams()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [siteStats, setSiteStats] = useState(null)
  const [services, setServices] = useState([])
  const [historicalData, setHistoricalData] = useState([])
  const [alerts, setAlerts] = useState([])

  const fetchStats = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const [statsRes, servicesRes, historyRes, alertsRes] = await Promise.all([
        api.get(`/stats/site/${siteId}`),
        api.get(`/stats/services/${siteId}`),
        api.get(`/stats/site/${siteId}/history?hours=1&limit=30`).catch(() => ({ data: { data: [] } })),
        api.get('/stats/alerts').catch(() => ({ data: { data: [] } })),
      ])

      setSiteStats(statsRes.data.data)
      setServices(servicesRes.data.data || [])
      setAlerts(alertsRes.data.data?.filter(a => a.site?.id === siteId) || [])
      
      if (historyRes.data.data?.length > 0) {
        setHistoricalData(historyRes.data.data.map(s => ({
          time: new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          cpu: s.cpu?.percent || 0,
          memory: s.memory?.percent || 0,
        })))
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [siteId])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => fetchStats(), 15000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchStats])

  // Actions sur les services
  const handleServiceAction = async (serviceId, action) => {
    try {
      await api.post(`/services/${serviceId}/${action}`)
      toast.success(`Service ${action === 'start' ? 'démarré' : action === 'stop' ? 'arrêté' : 'redémarré'}`)
      fetchStats(true)
    } catch (error) {
      toast.error(`Échec de l'action: ${error.response?.data?.error || error.message}`)
    }
  }

  // Acquitter une alerte
  const acknowledgeAlert = async (alertId) => {
    try {
      await api.post(`/stats/alerts/${alertId}/acknowledge`)
      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, status: 'acknowledged' } : a
      ))
      toast.success('Alerte acquittée')
    } catch (error) {
      toast.error('Erreur lors de l\'acquittement')
    }
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
    if (days > 0) return `${days}j ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  if (loading) {
    return <PageLoading />
  }

  const runningServices = services.filter(s => s.systemd?.running).length
  const site = siteStats?.site
  const memoryPercent = siteStats?.memory?.percent || 0
  const diskPercent = siteStats?.disk?.percent || 0
  const cpuPercent = siteStats?.cpu?.percent || 0
  const activeAlerts = alerts.filter(a => a.status === 'active')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques</h1>
          <p className="text-gray-500 mt-1">
            Monitoring de {site?.displayName || site?.name || 'ce site'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeAlerts.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg">
              <Bell className="w-4 h-4 text-red-500" />
              <span className="text-red-600 font-medium text-sm">{activeAlerts.length} alerte(s)</span>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600"
            />
            Auto (15s)
          </label>
          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            className="btn btn-secondary"
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Alertes actives */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map(alert => (
            <div 
              key={alert.id} 
              className={clsx(
                'p-4 rounded-lg flex items-center justify-between',
                alert.severity === 'critical' ? 'bg-red-50 border border-red-200' :
                alert.severity === 'warning' ? 'bg-yellow-50 border border-yellow-200' : 
                'bg-blue-50 border border-blue-200'
              )}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className={clsx(
                  'w-5 h-5',
                  alert.severity === 'critical' ? 'text-red-500' :
                  alert.severity === 'warning' ? 'text-yellow-500' : 'text-blue-500'
                )} />
                <div>
                  <p className="font-medium text-gray-900">{alert.message}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(alert.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => acknowledgeAlert(alert.id)}
                className="btn btn-secondary text-sm"
              >
                Acquitter
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Server}
          label="Services"
          value={`${runningServices}/${services.length}`}
          subValue="en cours d'exécution"
          color={runningServices === services.length ? 'green' : 'yellow'}
        />
        <StatCard
          icon={Cpu}
          label="CPU"
          value={`${cpuPercent.toFixed(1)}%`}
          subValue={`Limite: ${siteStats?.limits?.cpu || 100}%`}
          color={cpuPercent > 80 ? 'red' : cpuPercent > 60 ? 'yellow' : 'primary'}
          percent={cpuPercent}
        />
        <StatCard
          icon={Activity}
          label="Mémoire RAM"
          value={formatBytes(siteStats?.memory?.usedBytes)}
          subValue={`Limite: ${siteStats?.limits?.memory || 512} MB`}
          color={memoryPercent > 80 ? 'red' : memoryPercent > 60 ? 'yellow' : 'green'}
          percent={memoryPercent}
        />
        <StatCard
          icon={HardDrive}
          label="Disque"
          value={formatBytes(siteStats?.disk?.usedBytes)}
          subValue={`Limite: ${siteStats?.limits?.disk || 1024} MB`}
          color={diskPercent > 80 ? 'red' : diskPercent > 60 ? 'yellow' : 'yellow'}
          percent={diskPercent}
        />
      </div>

      {/* Informations du site */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-500" />
            Domaines
          </h3>
          <div className="space-y-2">
            {siteStats?.domains?.length > 0 ? (
              siteStats.domains.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {d.ssl && <span className="text-green-500">🔒</span>}
                  <span className="text-gray-700">{d.domain}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-sm">Aucun domaine configuré</p>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Ports</h3>
          <p className="text-2xl font-bold text-primary-600">
            {siteStats?.ports?.start} - {siteStats?.ports?.end}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {(siteStats?.ports?.end - siteStats?.ports?.start + 1) || 10} ports disponibles
          </p>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Fichiers</h3>
          <p className="text-2xl font-bold text-purple-600">
            {siteStats?.disk?.fileCount || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">fichiers dans le répertoire</p>
        </div>
      </div>

      {/* Graphique d'utilisation */}
      {historicalData.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">Utilisation des ressources (1h)</h2>
          </div>
          <div className="card-body">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historicalData}>
                  <defs>
                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={11} />
                  <YAxis stroke="#9ca3af" fontSize={11} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    stroke="#3b82f6"
                    fill="url(#cpuGrad)"
                    strokeWidth={2}
                    name="CPU %"
                  />
                  <Area
                    type="monotone"
                    dataKey="memory"
                    stroke="#22c55e"
                    fill="url(#memGrad)"
                    strokeWidth={2}
                    name="RAM %"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Services Status */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Services</h2>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              {runningServices} actif(s)
            </span>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {services.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              <Server className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Aucun service configuré</p>
            </div>
          ) : (
            services.map((service) => (
              <div key={service.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'w-3 h-3 rounded-full',
                      service.systemd?.running ? 'bg-green-500' : 'bg-gray-300'
                    )} />
                    <div>
                      <p className="font-medium text-gray-900">{service.displayName}</p>
                      <p className="text-sm text-gray-500">{service.systemd?.serviceName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <p className="text-gray-500">Port: <span className="text-gray-900">{service.port}</span></p>
                      {service.systemd?.memory && (
                        <p className="text-gray-500">RAM: <span className="text-gray-900">{formatBytes(service.systemd.memory)}</span></p>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      {service.systemd?.pid && (
                        <p className="text-gray-500">PID: <span className="text-gray-900">{service.systemd.pid}</span></p>
                      )}
                      {service.systemd?.uptime && (
                        <p className="text-gray-500">Uptime: <span className="text-gray-900">{formatUptime(service.systemd.uptime)}</span></p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!service.systemd?.running ? (
                        <button
                          onClick={() => handleServiceAction(service.id, 'start')}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Démarrer"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleServiceAction(service.id, 'restart')}
                            className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                            title="Redémarrer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleServiceAction(service.id, 'stop')}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Arrêter"
                          >
                            <Square className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                    <span className={clsx(
                      'px-2 py-1 rounded text-xs font-medium',
                      service.systemd?.running 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    )}>
                      {service.systemd?.active || 'unknown'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
