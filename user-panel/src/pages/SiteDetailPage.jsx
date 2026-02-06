import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  Globe, Server, FolderOpen, Database, Link2, BarChart3,
  Play, Square, RotateCcw, ExternalLink, Info
} from 'lucide-react'
import api from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { PageLoading } from '../components/ui/Loading'
import StatusBadge from '../components/ui/StatusBadge'
import toast from 'react-hot-toast'

function QuickActionCard({ icon: Icon, label, to, count, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-600 group-hover:bg-primary-100',
    green: 'bg-green-50 text-green-600 group-hover:bg-green-100',
    yellow: 'bg-yellow-50 text-yellow-600 group-hover:bg-yellow-100',
    purple: 'bg-purple-50 text-purple-600 group-hover:bg-purple-100',
  }

  return (
    <Link
      to={to}
      className="card p-4 flex items-center gap-4 hover:shadow-md transition-all group"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{label}</p>
        {count !== undefined && (
          <p className="text-sm text-gray-500">{count} items</p>
        )}
      </div>
    </Link>
  )
}

export default function SiteDetailPage() {
  const { siteId } = useParams()
  const { canWrite } = useAuth()
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [site, setSite] = useState(null)
  const [services, setServices] = useState([])
  const [databases, setDatabases] = useState([])

  useEffect(() => {
    fetchSiteData()
  }, [siteId])

  const fetchSiteData = async () => {
    try {
      const [siteRes, servicesRes, dbRes] = await Promise.all([
        api.get(`/sites/${siteId}`),
        api.get(`/sites/${siteId}/services`).catch(() => ({ data: { data: [] } })),
        api.get(`/sites/${siteId}/databases`).catch(() => ({ data: { databases: [] } })),
      ])

      setSite(siteRes.data.data?.site || siteRes.data.data)
      setServices(servicesRes.data.data || [])
      setDatabases(dbRes.data.databases || [])
    } catch (error) {
      console.error('Failed to fetch site data:', error)
      toast.error('Failed to load site data')
    } finally {
      setLoading(false)
    }
  }

  const handleSiteAction = async (action) => {
    if (!canWrite) return

    setActionLoading(action)
    try {
      await api.post(`/sites/${siteId}/${action}`)
      toast.success(`Site ${action} command sent`)
      await fetchSiteData()
    } catch (error) {
      toast.error(error.response?.data?.error || `Failed to ${action} site`)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <PageLoading />
  }

  if (!site) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Site not found</h2>
        <p className="text-gray-500 mt-2">The site you're looking for doesn't exist or you don't have access.</p>
        <Link to="/sites" className="btn btn-primary mt-4">
          Back to Sites
        </Link>
      </div>
    )
  }

  const runningServices = services.filter(s => s.systemdStatus?.running).length
  const primaryDomain = site.domains?.find(d => d.isPrimary) || site.domains?.[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center">
            <Globe className="w-7 h-7 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{site.displayName}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-gray-500">{site.name}</span>
              <StatusBadge status={site.status} />
            </div>
          </div>
        </div>

        {/* Actions */}
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSiteAction('start')}
              disabled={actionLoading !== null}
              className="btn btn-success btn-sm"
            >
              <Play className="w-4 h-4 mr-1" />
              {actionLoading === 'start' ? 'Starting...' : 'Start'}
            </button>
            <button
              onClick={() => handleSiteAction('stop')}
              disabled={actionLoading !== null}
              className="btn btn-secondary btn-sm"
            >
              <Square className="w-4 h-4 mr-1" />
              {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
            </button>
            <button
              onClick={() => handleSiteAction('restart')}
              disabled={actionLoading !== null}
              className="btn btn-warning btn-sm"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              {actionLoading === 'restart' ? 'Restarting...' : 'Restart'}
            </button>
          </div>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Site Info */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Site Information
            </h2>
          </div>
          <div className="card-body space-y-3">
            {site.description && (
              <div>
                <p className="text-sm text-gray-500">Description</p>
                <p className="text-gray-900">{site.description}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Linux User</p>
              <p className="text-gray-900 font-mono text-sm">{site.linuxUser?.username}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Port Range</p>
              <p className="text-gray-900">{site.portRange?.start} - {site.portRange?.end}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Path</p>
              <p className="text-gray-900 font-mono text-sm">{site.paths?.root}</p>
            </div>
          </div>
        </div>

        {/* Domain Info */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Domains
            </h2>
          </div>
          <div className="card-body">
            {site.domains?.length > 0 ? (
              <div className="space-y-2">
                {site.domains.map((domain, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://${domain.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
                      >
                        {domain.domain}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      {domain.isPrimary && (
                        <span className="badge badge-info">Primary</span>
                      )}
                    </div>
                    {domain.sslEnabled ? (
                      <span className="badge badge-success">SSL</span>
                    ) : (
                      <span className="badge badge-gray">No SSL</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No domains configured</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-4">Quick Access</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickActionCard
            icon={Server}
            label="Services"
            to={`/sites/${siteId}/services`}
            count={services.length}
            color="green"
          />
          <QuickActionCard
            icon={FolderOpen}
            label="File Manager"
            to={`/sites/${siteId}/files`}
            color="primary"
          />
          <QuickActionCard
            icon={Database}
            label="Databases"
            to={`/sites/${siteId}/databases`}
            count={databases.length}
            color="yellow"
          />
          <QuickActionCard
            icon={BarChart3}
            label="Statistics"
            to={`/sites/${siteId}/stats`}
            color="purple"
          />
        </div>
      </div>

      {/* Services Overview */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Services Overview</h2>
          <Link
            to={`/sites/${siteId}/services`}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Manage
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {services.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No services configured for this site.
            </div>
          ) : (
            services.slice(0, 5).map((service) => (
              <div key={service._id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Server className="w-4 h-4 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{service.displayName}</p>
                    <p className="text-sm text-gray-500">Port: {service.port}</p>
                  </div>
                </div>
                <StatusBadge status={service.systemdStatus?.running ? 'running' : 'stopped'} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
