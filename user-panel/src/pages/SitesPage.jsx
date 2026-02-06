import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Globe, ExternalLink, Search } from 'lucide-react'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'

export default function SitesPage() {
  const [loading, setLoading] = useState(true)
  const [sites, setSites] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchSites()
  }, [])

  const fetchSites = async () => {
    try {
      const response = await api.get('/sites')
      setSites(response.data.data || [])
    } catch (error) {
      console.error('Failed to fetch sites:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredSites = sites.filter(site =>
    site.name.toLowerCase().includes(search.toLowerCase()) ||
    site.displayName.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Sites</h1>
          <p className="text-gray-500 mt-1">
            Manage your hosted sites and services
          </p>
        </div>
      </div>

      {/* Search */}
      {sites.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search sites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
      )}

      {/* Sites Grid */}
      {filteredSites.length === 0 ? (
        sites.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No sites yet"
            description="You don't have any sites assigned to your account. Contact an administrator to get access."
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No results"
            description="No sites match your search criteria."
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSites.map((site) => (
            <Link
              key={site._id}
              to={`/sites/${site._id}`}
              className="card p-6 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                  <Globe className="w-6 h-6 text-primary-600" />
                </div>
                <StatusBadge status={site.status} />
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">
                {site.displayName}
              </h3>
              <p className="text-sm text-gray-500 mb-3">{site.name}</p>

              {site.description && (
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {site.description}
                </p>
              )}

              {/* Domain */}
              {site.domains?.[0] && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Domain:</span>
                  <a
                    href={`https://${site.domains[0].domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
                  >
                    {site.domains[0].domain}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Port Range */}
              <div className="flex items-center gap-2 text-sm mt-2">
                <span className="text-gray-500">Ports:</span>
                <span className="text-gray-700">
                  {site.portRange?.start} - {site.portRange?.end}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
