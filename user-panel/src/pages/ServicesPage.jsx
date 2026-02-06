import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  Server, Play, Square, RotateCcw, RefreshCw, 
  Terminal, Clock, Cpu, ChevronDown, ChevronUp
} from 'lucide-react'
import api from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { PageLoading } from '../components/ui/Loading'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function ServiceCard({ service, onAction, canWrite, actionLoading }) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = service.systemdStatus?.running

  return (
    <div className="card">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              isRunning ? 'bg-green-100' : 'bg-gray-100'
            )}>
              <Server className={clsx('w-5 h-5', isRunning ? 'text-green-600' : 'text-gray-500')} />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{service.displayName}</h3>
              <p className="text-sm text-gray-500">{service.name}</p>
            </div>
          </div>
          <StatusBadge status={isRunning ? 'running' : 'stopped'} />
        </div>

        {/* Quick Info */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Terminal className="w-4 h-4" />
            <span>Type: {service.type}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <span>Port: {service.port}</span>
          </div>
          {service.systemdStatus?.uptime && (
            <div className="flex items-center gap-1.5 text-gray-500">
              <Clock className="w-4 h-4" />
              <span>{service.systemdStatus.uptime}</span>
            </div>
          )}
          {service.systemdStatus?.memory && (
            <div className="flex items-center gap-1.5 text-gray-500">
              <Cpu className="w-4 h-4" />
              <span>{service.systemdStatus.memory}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {canWrite && (
              <>
                <button
                  onClick={() => onAction(service._id, 'start')}
                  disabled={actionLoading === service._id || isRunning}
                  className="btn btn-success btn-sm"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onAction(service._id, 'stop')}
                  disabled={actionLoading === service._id || !isRunning}
                  className="btn btn-secondary btn-sm"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onAction(service._id, 'restart')}
                  disabled={actionLoading === service._id}
                  className="btn btn-warning btn-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            {expanded ? (
              <>Hide details <ChevronUp className="w-4 h-4" /></>
            ) : (
              <>Show details <ChevronDown className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 mt-2">
          <div className="space-y-3">
            {service.description && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Description</p>
                <p className="text-sm text-gray-700">{service.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Start Command</p>
              <code className="block mt-1 p-2 bg-gray-50 rounded text-xs font-mono text-gray-700 break-all">
                {service.commands?.start || 'N/A'}
              </code>
            </div>
            {service.commands?.install && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Install Command</p>
                <code className="block mt-1 p-2 bg-gray-50 rounded text-xs font-mono text-gray-700 break-all">
                  {service.commands.install}
                </code>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Auto Start</p>
                <p className="text-gray-700">{service.autoStart ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Systemd Service</p>
                <p className="text-gray-700 font-mono text-xs">{service.systemd?.serviceName}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ServicesPage() {
  const { siteId } = useParams()
  const { canWrite } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [services, setServices] = useState([])
  const [site, setSite] = useState(null)

  useEffect(() => {
    fetchServices()
  }, [siteId])

  const fetchServices = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const [siteRes, servicesRes] = await Promise.all([
        api.get(`/sites/${siteId}`),
        api.get(`/sites/${siteId}/services`),
      ])
      setSite(siteRes.data.data?.site || siteRes.data.data)
      setServices(servicesRes.data.data || [])
    } catch (error) {
      console.error('Failed to fetch services:', error)
      toast.error('Failed to load services')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleServiceAction = async (serviceId, action) => {
    if (!canWrite) return

    setActionLoading(serviceId)
    try {
      await api.post(`/services/${serviceId}/${action}`)
      toast.success(`Service ${action} command sent`)
      await fetchServices()
    } catch (error) {
      toast.error(error.response?.data?.error || `Failed to ${action} service`)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Services</h1>
          <p className="text-gray-500 mt-1">
            Manage services for {site?.displayName || 'this site'}
          </p>
        </div>
        <button
          onClick={() => fetchServices(true)}
          disabled={refreshing}
          className="btn btn-secondary"
        >
          <RefreshCw className={clsx('w-4 h-4 mr-2', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Services List */}
      {services.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No services"
          description="This site doesn't have any services configured yet."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {services.map((service) => (
            <ServiceCard
              key={service._id}
              service={service}
              onAction={handleServiceAction}
              canWrite={canWrite}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </div>
  )
}
