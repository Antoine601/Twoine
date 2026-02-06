import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Activity,
  RefreshCw,
  Clock,
  AlertTriangle,
  Server,
  Globe,
  Users,
  Bell,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Settings,
  Zap
} from 'lucide-react'
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell 
} from 'recharts'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import toast from 'react-hot-toast'

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1']

export default function StatsPage() {
  const [systemStats, setSystemStats] = useState(null)
  const [historicalData, setHistoricalData] = useState([])
  const [platformStats, setPlatformStats] = useState(null)
  const [sitesStats, setSitesStats] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(10)
  const [activeTab, setActiveTab] = useState('overview')
  const [expandedSite, setExpandedSite] = useState(null)
  const [siteServices, setSiteServices] = useState({})
  const wsRef = useRef(null)

  // Chargement des statistiques
  const loadStats = useCallback(async () => {
    try {
      const [serverRes, adminRes, sitesRes, alertsRes] = await Promise.all([
        api.get('/stats/server').catch(() => ({ data: { data: null } })),
        api.get('/admin/stats').catch(() => ({ data: { data: null } })),
        api.get('/stats/sites').catch(() => ({ data: { data: [] } })),
        api.get('/stats/alerts').catch(() => ({ data: { data: [] } })),
      ])
      
      if (serverRes.data.data) {
        setSystemStats(serverRes.data.data)
        setHistoricalData(prev => {
          const newPoint = {
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: serverRes.data.data.cpu?.percent || 0,
            memory: serverRes.data.data.memory?.percent || 0,
            disk: serverRes.data.data.disk?.percent || 0,
          }
          return [...prev, newPoint].slice(-30)
        })
      }
      
      if (adminRes.data.data) {
        setPlatformStats(adminRes.data.data)
      }
      
      setSitesStats(sitesRes.data.data || [])
      setAlerts(alertsRes.data.data || [])
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Charger l'historique au démarrage
  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get('/stats/server/history?hours=1&limit=30')
      if (res.data.data) {
        setHistoricalData(res.data.data.map(s => ({
          time: new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          cpu: s.cpu?.percent || 0,
          memory: s.memory?.percent || 0,
          disk: s.disk?.percent || 0,
        })))
      }
    } catch (error) {
      console.error('Error loading history:', error)
    }
  }, [])

  // Charger les services d'un site
  const loadSiteServices = async (siteId) => {
    if (siteServices[siteId]) return
    try {
      const res = await api.get(`/stats/services/${siteId}`)
      setSiteServices(prev => ({ ...prev, [siteId]: res.data.data || [] }))
    } catch (error) {
      console.error('Error loading site services:', error)
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

  // Résoudre une alerte
  const resolveAlert = async (alertId) => {
    try {
      await api.post(`/stats/alerts/${alertId}/resolve`)
      setAlerts(prev => prev.filter(a => a.id !== alertId))
      toast.success('Alerte résolue')
    } catch (error) {
      toast.error('Erreur lors de la résolution')
    }
  }

  useEffect(() => {
    loadStats()
    loadHistory()
  }, [loadStats, loadHistory])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(loadStats, refreshInterval * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, loadStats])

  // Formatage
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

  const getStatusColor = (percent, type = 'default') => {
    const thresholds = type === 'disk' 
      ? { warning: 70, critical: 90 }
      : { warning: 60, critical: 80 }
    
    if (percent >= thresholds.critical) return 'danger'
    if (percent >= thresholds.warning) return 'warning'
    return 'accent'
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-danger-400 bg-danger-900/50'
      case 'error': return 'text-danger-400 bg-danger-900/50'
      case 'warning': return 'text-warning-400 bg-warning-900/50'
      default: return 'text-primary-400 bg-primary-900/50'
    }
  }

  if (loading) return <PageLoading />

  const activeAlerts = alerts.filter(a => a.status === 'active')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Supervision Serveur</h1>
          <p className="page-subtitle">Monitoring en temps réel du système et des sites</p>
        </div>
        <div className="flex items-center gap-4">
          {activeAlerts.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-danger-900/50 rounded-lg">
              <Bell className="w-4 h-4 text-danger-400 animate-pulse" />
              <span className="text-danger-400 font-medium">{activeAlerts.length} alerte(s)</span>
            </div>
          )}
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="input-field py-1.5 px-3 text-sm w-auto"
          >
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-admin-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded border-admin-600 bg-admin-700 text-primary-600"
            />
            Auto
          </label>
          <button onClick={loadStats} className="btn btn-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-admin-700 pb-2">
        {[
          { id: 'overview', label: 'Vue d\'ensemble', icon: Activity },
          { id: 'sites', label: 'Sites', icon: Globe },
          { id: 'alerts', label: 'Alertes', icon: Bell, count: activeAlerts.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === tab.id 
                ? 'bg-admin-700 text-white' 
                : 'text-admin-400 hover:text-white hover:bg-admin-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-danger-600 rounded-full">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Current Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Cpu}
              label="CPU"
              value={`${systemStats?.cpu?.percent?.toFixed(1) || 0}%`}
              subLabel={`${systemStats?.cpu?.cores || 0} cœurs • Load: ${systemStats?.cpu?.loadAvg?.one?.toFixed(2) || 0}`}
              percent={systemStats?.cpu?.percent || 0}
              colorType="default"
            />
            <StatCard
              icon={MemoryStick}
              label="Mémoire RAM"
              value={`${systemStats?.memory?.percent?.toFixed(1) || 0}%`}
              subLabel={`${formatBytes(systemStats?.memory?.used)} / ${formatBytes(systemStats?.memory?.total)}`}
              percent={systemStats?.memory?.percent || 0}
              colorType="default"
            />
            <StatCard
              icon={HardDrive}
              label="Disque"
              value={`${systemStats?.disk?.percent || 0}%`}
              subLabel={`${formatBytes(systemStats?.disk?.used)} / ${formatBytes(systemStats?.disk?.total)}`}
              percent={systemStats?.disk?.percent || 0}
              colorType="disk"
            />
            <StatCard
              icon={Clock}
              label="Uptime"
              value={formatUptime(systemStats?.uptime)}
              subLabel={systemStats?.system?.hostname || 'Serveur'}
              showPulse
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">CPU & Mémoire (30 dernières minutes)</h2>
                <Zap className="w-5 h-5 text-primary-400" />
              </div>
              <div className="card-body">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historicalData}>
                      <defs>
                        <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d946ef" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#d946ef" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1e293b', 
                          border: '1px solid #334155',
                          borderRadius: '8px'
                        }}
                      />
                      <Area type="monotone" dataKey="cpu" stroke="#d946ef" fill="url(#cpuGradient)" strokeWidth={2} name="CPU %" />
                      <Area type="monotone" dataKey="memory" stroke="#10b981" fill="url(#memGradient)" strokeWidth={2} name="RAM %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Disque</h2>
                <HardDrive className="w-5 h-5 text-warning-400" />
              </div>
              <div className="card-body">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1e293b', 
                          border: '1px solid #334155',
                          borderRadius: '8px'
                        }}
                      />
                      <Line type="monotone" dataKey="disk" stroke="#f59e0b" strokeWidth={2} dot={false} name="Disque %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Platform Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <CountCard
              icon={Users}
              label="Utilisateurs"
              total={platformStats?.users?.total || 0}
              items={[
                { label: 'Actifs', value: platformStats?.users?.active || 0, color: 'accent' },
                { label: 'Bloqués', value: platformStats?.users?.blocked || 0, color: 'danger' },
              ]}
            />
            <CountCard
              icon={Globe}
              label="Sites"
              total={platformStats?.sites?.total || 0}
              items={[
                { label: 'Actifs', value: platformStats?.sites?.active || 0, color: 'accent' },
                { label: 'Inactifs', value: platformStats?.sites?.inactive || 0, color: 'admin' },
              ]}
            />
            <CountCard
              icon={Server}
              label="Services"
              total={systemStats?.totals?.services || 0}
              items={[
                { label: 'Running', value: systemStats?.totals?.servicesRunning || 0, color: 'accent' },
                { label: 'Stopped', value: systemStats?.totals?.servicesStopped || 0, color: 'danger' },
              ]}
            />
            <CountCard
              icon={Bell}
              label="Alertes"
              total={alerts.length}
              items={[
                { label: 'Actives', value: activeAlerts.length, color: 'danger' },
                { label: 'Acquittées', value: alerts.filter(a => a.status === 'acknowledged').length, color: 'warning' },
              ]}
            />
          </div>
        </>
      )}

      {/* Sites Tab */}
      {activeTab === 'sites' && (
        <div className="space-y-4">
          {sitesStats.length === 0 ? (
            <div className="card">
              <div className="card-body text-center py-12 text-admin-400">
                <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Aucun site à afficher</p>
              </div>
            </div>
          ) : (
            sitesStats.map(site => (
              <div key={site.site?.id} className="card">
                <div 
                  className="card-header cursor-pointer hover:bg-admin-700/50 transition-colors"
                  onClick={() => {
                    const siteId = site.site?.id
                    if (expandedSite === siteId) {
                      setExpandedSite(null)
                    } else {
                      setExpandedSite(siteId)
                      loadSiteServices(siteId)
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${
                        site.site?.status === 'active' ? 'bg-accent-500' : 'bg-admin-500'
                      }`} />
                      <div>
                        <h3 className="font-semibold text-white">{site.site?.displayName || site.site?.name}</h3>
                        <p className="text-sm text-admin-400">{site.site?.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-admin-400">CPU</p>
                        <p className="font-medium text-white">{site.cpu?.percent?.toFixed(1) || 0}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-admin-400">RAM</p>
                        <p className="font-medium text-white">{formatBytes(site.memory?.usedBytes)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-admin-400">Disque</p>
                        <p className="font-medium text-white">{formatBytes(site.disk?.usedBytes)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-admin-400">Services</p>
                        <p className="font-medium">
                          <span className="text-accent-400">{site.services?.running || 0}</span>
                          <span className="text-admin-500"> / {site.services?.total || 0}</span>
                        </p>
                      </div>
                      {expandedSite === site.site?.id ? (
                        <ChevronUp className="w-5 h-5 text-admin-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-admin-400" />
                      )}
                    </div>
                  </div>
                </div>
                
                {expandedSite === site.site?.id && (
                  <div className="card-body border-t border-admin-700">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className="bg-admin-800 rounded-lg p-4">
                        <p className="text-sm text-admin-400 mb-1">Domaines</p>
                        <div className="space-y-1">
                          {site.domains?.length > 0 ? site.domains.map((d, i) => (
                            <p key={i} className="text-sm text-white flex items-center gap-2">
                              {d.ssl && <span className="text-accent-400">🔒</span>}
                              {d.domain}
                            </p>
                          )) : <p className="text-admin-500 text-sm">Aucun</p>}
                        </div>
                      </div>
                      <div className="bg-admin-800 rounded-lg p-4">
                        <p className="text-sm text-admin-400 mb-1">Ports</p>
                        <p className="text-white">{site.ports?.start} - {site.ports?.end}</p>
                      </div>
                      <div className="bg-admin-800 rounded-lg p-4">
                        <p className="text-sm text-admin-400 mb-1">Limite RAM</p>
                        <p className="text-white">{site.limits?.memory || 512} MB</p>
                      </div>
                      <div className="bg-admin-800 rounded-lg p-4">
                        <p className="text-sm text-admin-400 mb-1">Limite Disque</p>
                        <p className="text-white">{site.limits?.disk || 1024} MB</p>
                      </div>
                    </div>

                    {/* Services du site */}
                    <h4 className="font-medium text-white mb-3">Services</h4>
                    {siteServices[site.site?.id] ? (
                      <div className="space-y-2">
                        {siteServices[site.site?.id].map(service => (
                          <div key={service.id} className="bg-admin-800 rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`w-2.5 h-2.5 rounded-full ${
                                service.systemd?.running ? 'bg-accent-500' : 'bg-danger-500'
                              }`} />
                              <div>
                                <p className="font-medium text-white">{service.displayName}</p>
                                <p className="text-sm text-admin-400">{service.systemd?.serviceName}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-6 text-sm">
                              <div>
                                <span className="text-admin-400">PID:</span>{' '}
                                <span className="text-white">{service.systemd?.pid || '-'}</span>
                              </div>
                              <div>
                                <span className="text-admin-400">Port:</span>{' '}
                                <span className="text-white">{service.port}</span>
                              </div>
                              <div>
                                <span className="text-admin-400">RAM:</span>{' '}
                                <span className="text-white">{formatBytes(service.systemd?.memory)}</span>
                              </div>
                              <div>
                                <span className="text-admin-400">Uptime:</span>{' '}
                                <span className="text-white">{formatUptime(service.systemd?.uptime)}</span>
                              </div>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                service.systemd?.running 
                                  ? 'bg-accent-900/50 text-accent-400' 
                                  : 'bg-danger-900/50 text-danger-400'
                              }`}>
                                {service.systemd?.active || 'unknown'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-admin-400">Chargement...</div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <div className="card">
              <div className="card-body text-center py-12 text-admin-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-accent-400" />
                <p>Aucune alerte</p>
              </div>
            </div>
          ) : (
            alerts.map(alert => (
              <div key={alert.id} className={`card border-l-4 ${
                alert.severity === 'critical' ? 'border-l-danger-500' :
                alert.severity === 'warning' ? 'border-l-warning-500' : 'border-l-primary-500'
              }`}>
                <div className="card-body">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getSeverityColor(alert.severity)}`}>
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                            {alert.severity}
                          </span>
                          <span className="text-admin-400 text-sm">
                            {alert.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-white font-medium">{alert.message}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-admin-400">
                          <span>{new Date(alert.createdAt).toLocaleString('fr-FR')}</span>
                          {alert.site && <span>Site: {alert.site.displayName || alert.site.name}</span>}
                          {alert.service && <span>Service: {alert.service.displayName || alert.service.name}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {alert.status === 'active' && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="btn btn-secondary text-sm"
                        >
                          Acquitter
                        </button>
                      )}
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="btn btn-primary text-sm"
                      >
                        Résoudre
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Composant StatCard
function StatCard({ icon: Icon, label, value, subLabel, percent, colorType, showPulse }) {
  const getColor = () => {
    if (!percent) return 'accent'
    const thresholds = colorType === 'disk' 
      ? { warning: 70, critical: 90 }
      : { warning: 60, critical: 80 }
    if (percent >= thresholds.critical) return 'danger'
    if (percent >= thresholds.warning) return 'warning'
    return 'accent'
  }
  
  const color = getColor()
  
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 bg-${color}-900/50 rounded-lg flex items-center justify-center`}>
          <Icon className={`w-6 h-6 text-${color}-400`} />
        </div>
        {showPulse ? (
          <Activity className="w-6 h-6 text-accent-400 animate-pulse" />
        ) : (
          <span className={`text-2xl font-bold text-${color}-400`}>{value}</span>
        )}
      </div>
      <p className="text-white font-medium">{label}</p>
      {showPulse && <p className="text-2xl font-bold text-white mt-1">{value}</p>}
      <p className="text-sm text-admin-500 mt-1">{subLabel}</p>
      {percent !== undefined && (
        <div className="mt-3 h-2 bg-admin-700 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all bg-${color}-500`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

// Composant CountCard
function CountCard({ icon: Icon, label, total, items }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-primary-900/50 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <p className="text-sm text-admin-400">{label}</p>
            <p className="text-2xl font-bold text-white">{total}</p>
          </div>
        </div>
        <div className="flex gap-4">
          {items.map((item, i) => (
            <div key={i} className="flex-1">
              <p className={`text-lg font-semibold text-${item.color}-400`}>{item.value}</p>
              <p className="text-xs text-admin-500">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
