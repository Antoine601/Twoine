import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Server, Database, HardDrive, AlertTriangle, ExternalLink } from 'lucide-react'
import api from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { PageLoading } from '../components/ui/Loading'
import StatusBadge from '../components/ui/StatusBadge'

function StatCard({ icon: Icon, label, value, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    sites: [],
    stats: {
      totalSites: 0,
      runningSites: 0,
      totalServices: 0,
      runningServices: 0,
      totalDatabases: 0,
    },
    alerts: [],
  })

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const [sitesRes, dbRes] = await Promise.all([
        api.get('/sites'),
        api.get('/me/databases').catch(() => ({ data: { databases: [] } })),
      ])

      const sites = sitesRes.data.data || []
      const databases = dbRes.data.databases || []

      let totalServices = 0
      let runningServices = 0
      const alerts = []

      for (const site of sites) {
        try {
          const servicesRes = await api.get(`/sites/${site._id}/services`)
          const services = servicesRes.data.data || []
          totalServices += services.length

          for (const service of services) {
            if (service.systemdStatus?.running) {
              runningServices++
            } else if (service.status?.current === 'failed') {
              alerts.push({
                type: 'error',
                message: `Service "${service.displayName}" on ${site.displayName} has failed`,
                siteId: site._id,
              })
            }
          }
        } catch {}
      }

      const runningSites = sites.filter(s => s.status === 'active').length

      setData({
        sites,
        stats: {
          totalSites: sites.length,
          runningSites,
          totalServices,
          runningServices,
          totalDatabases: databases.length,
        },
        alerts,
      })
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.profile?.firstName || user?.username}!
        </h1>
        <p className="text-gray-500 mt-1">
          Here's an overview of your sites and services.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Globe}
          label="Total Sites"
          value={data.stats.totalSites}
          color="primary"
        />
        <StatCard
          icon={Server}
          label="Running Services"
          value={`${data.stats.runningServices}/${data.stats.totalServices}`}
          color="green"
        />
        <StatCard
          icon={Database}
          label="Databases"
          value={data.stats.totalDatabases}
          color="yellow"
        />
        <StatCard
          icon={HardDrive}
          label="Active Sites"
          value={`${data.stats.runningSites}/${data.stats.totalSites}`}
          color="primary"
        />
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="card border-red-200 bg-red-50">
          <div className="card-header border-red-200">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="font-semibold">Alerts</h2>
            </div>
          </div>
          <div className="divide-y divide-red-200">
            {data.alerts.map((alert, index) => (
              <div key={index} className="px-6 py-3 flex items-center justify-between">
                <p className="text-sm text-red-700">{alert.message}</p>
                <Link
                  to={`/sites/${alert.siteId}/services`}
                  className="text-sm text-red-600 hover:text-red-800 font-medium"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sites List */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">My Sites</h2>
          <Link to="/sites" className="text-sm text-primary-600 hover:text-primary-700">
            View all
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {data.sites.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No sites assigned to your account.
            </div>
          ) : (
            data.sites.slice(0, 5).map((site) => (
              <Link
                key={site._id}
                to={`/sites/${site._id}`}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <Globe className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{site.displayName}</p>
                    <p className="text-sm text-gray-500">{site.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={site.status} />
                  {site.domains?.[0] && (
                    <a
                      href={`https://${site.domains[0].domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-gray-400 hover:text-primary-600"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
