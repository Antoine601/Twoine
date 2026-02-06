import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Link2, ExternalLink, Shield, ShieldOff, CheckCircle, XCircle, Clock } from 'lucide-react'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import EmptyState from '../components/ui/EmptyState'
import clsx from 'clsx'
import { format } from 'date-fns'

export default function DomainsPage() {
  const { siteId } = useParams()
  const [loading, setLoading] = useState(true)
  const [site, setSite] = useState(null)

  useEffect(() => {
    fetchSite()
  }, [siteId])

  const fetchSite = async () => {
    try {
      const response = await api.get(`/sites/${siteId}`)
      setSite(response.data.data?.site || response.data.data)
    } catch (error) {
      console.error('Failed to fetch site:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoading />
  }

  const domains = site?.domains || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Domains</h1>
        <p className="text-gray-500 mt-1">
          View domains configured for {site?.displayName || 'this site'}
        </p>
      </div>

      {/* Info Banner */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-700">
          Domain management is handled by administrators. Contact your admin to add or modify domains.
        </p>
      </div>

      {/* Domains List */}
      {domains.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No domains"
          description="No domains have been configured for this site yet."
        />
      ) : (
        <div className="space-y-4">
          {domains.map((domain, index) => (
            <div key={index} className="card p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={clsx(
                    'w-12 h-12 rounded-xl flex items-center justify-center',
                    domain.sslEnabled ? 'bg-green-100' : 'bg-gray-100'
                  )}>
                    {domain.sslEnabled ? (
                      <Shield className="w-6 h-6 text-green-600" />
                    ) : (
                      <ShieldOff className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://${domain.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1"
                      >
                        {domain.domain}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {domain.isPrimary && (
                        <span className="badge badge-info">Primary</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {domain.sslEnabled ? 'SSL/TLS Enabled' : 'No SSL'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Domain Details */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Verification Status */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Verification</p>
                  <div className="flex items-center gap-2">
                    {domain.verified ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-green-700 font-medium">Verified</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-5 h-5 text-yellow-500" />
                        <span className="text-yellow-700 font-medium">Pending</span>
                      </>
                    )}
                  </div>
                  {domain.verifiedAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(domain.verifiedAt), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>

                {/* SSL Status */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">SSL Certificate</p>
                  {domain.sslEnabled ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-green-700 font-medium capitalize">
                          {domain.sslType || 'Active'}
                        </span>
                      </div>
                      {domain.sslExpiresAt && (
                        <p className="text-xs text-gray-500 mt-1">
                          Expires: {format(new Date(domain.sslExpiresAt), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-gray-400" />
                      <span className="text-gray-600">Not configured</span>
                    </div>
                  )}
                </div>

                {/* Port Mapping */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-2">Port Range</p>
                  <p className="text-gray-900 font-mono">
                    {site?.portRange?.start} - {site?.portRange?.end}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
