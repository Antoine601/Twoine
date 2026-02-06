import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { 
  Database, RefreshCw, Eye, EyeOff, Copy, 
  CheckCircle, TestTube, Key, Trash2 
} from 'lucide-react'
import api from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { PageLoading } from '../components/ui/Loading'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const DB_COLORS = {
  mongodb: 'bg-green-100 text-green-700',
  mysql: 'bg-blue-100 text-blue-700',
  postgresql: 'bg-indigo-100 text-indigo-700',
}

function ConnectionString({ value, label }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied to clipboard')
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 p-2 bg-gray-50 rounded text-xs font-mono text-gray-700 break-all">
          {visible ? value : '••••••••••••••••••••••••••••••'}
        </code>
        <button
          onClick={() => setVisible(!visible)}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
          title={visible ? 'Hide' : 'Show'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          onClick={handleCopy}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
          title="Copy"
        >
          {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

function DatabaseCard({ database, onTest, onResetPassword, onDelete, canWrite, actionLoading }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              DB_COLORS[database.type] || 'bg-gray-100 text-gray-700'
            )}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{database.displayName || database.name}</h3>
              <p className="text-sm text-gray-500">{database.typeDisplayName || database.type}</p>
            </div>
          </div>
          <StatusBadge status={database.status} />
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <ConnectionString
            label="Connection URL"
            value={database.connectionUrl}
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTest(database.id)}
              disabled={actionLoading === database.id}
              className="btn btn-secondary btn-sm"
            >
              <TestTube className="w-3.5 h-3.5 mr-1" />
              Test
            </button>
            {canWrite && (
              <>
                <button
                  onClick={() => onResetPassword(database.id)}
                  disabled={actionLoading === database.id}
                  className="btn btn-warning btn-sm"
                >
                  <Key className="w-3.5 h-3.5 mr-1" />
                  Reset Password
                </button>
                <button
                  onClick={() => onDelete(database)}
                  disabled={actionLoading === database.id}
                  className="btn btn-danger btn-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DatabasesPage() {
  const { siteId } = useParams()
  const { canWrite } = useAuth()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [databases, setDatabases] = useState([])
  const [site, setSite] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, db: null })
  const [credentialsModal, setCredentialsModal] = useState({ open: false, credentials: null })

  useEffect(() => {
    fetchDatabases()
  }, [siteId])

  const fetchDatabases = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const [siteRes, dbRes] = await Promise.all([
        api.get(`/sites/${siteId}`),
        api.get(`/sites/${siteId}/databases`),
      ])
      setSite(siteRes.data.data?.site || siteRes.data.data)
      setDatabases(dbRes.data.databases || [])
    } catch (error) {
      console.error('Failed to fetch databases:', error)
      toast.error('Failed to load databases')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleTest = async (dbId) => {
    setActionLoading(dbId)
    try {
      const response = await api.post(`/sites/${siteId}/databases/${dbId}/test`)
      if (response.data.connected) {
        toast.success('Connection successful!')
      } else {
        toast.error('Connection failed')
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Connection test failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleResetPassword = async (dbId) => {
    if (!canWrite) return
    setActionLoading(dbId)
    try {
      const response = await api.post(`/sites/${siteId}/databases/${dbId}/reset-password`)
      setCredentialsModal({ open: true, credentials: response.data.credentials })
      toast.success('Password reset successfully')
      fetchDatabases()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reset password')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!canWrite || !deleteConfirm.db) return
    setActionLoading(deleteConfirm.db.id)
    try {
      await api.delete(`/sites/${siteId}/databases/${deleteConfirm.db.id}`)
      toast.success('Database deleted')
      setDeleteConfirm({ open: false, db: null })
      fetchDatabases()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete database')
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
          <h1 className="text-2xl font-bold text-gray-900">Databases</h1>
          <p className="text-gray-500 mt-1">
            Manage databases for {site?.displayName || 'this site'}
          </p>
        </div>
        <button
          onClick={() => fetchDatabases(true)}
          disabled={refreshing}
          className="btn btn-secondary"
        >
          <RefreshCw className={clsx('w-4 h-4 mr-2', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Databases List */}
      {databases.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No databases"
          description="This site doesn't have any databases configured yet."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {databases.map((db) => (
            <DatabaseCard
              key={db.id}
              database={db}
              onTest={handleTest}
              onResetPassword={handleResetPassword}
              onDelete={(db) => setDeleteConfirm({ open: true, db })}
              canWrite={canWrite}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, db: null })}
        onConfirm={handleDelete}
        title="Delete Database"
        message={`Are you sure you want to delete "${deleteConfirm.db?.name}"? This will permanently delete all data.`}
        confirmText="Delete"
        loading={actionLoading === deleteConfirm.db?.id}
      />

      {/* Credentials Modal */}
      <Modal
        isOpen={credentialsModal.open}
        onClose={() => setCredentialsModal({ open: false, credentials: null })}
        title="New Database Credentials"
        size="md"
      >
        {credentialsModal.credentials && (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Save these credentials securely. The password will not be shown again.
              </p>
            </div>
            <ConnectionString
              label="Username"
              value={credentialsModal.credentials.username}
            />
            <ConnectionString
              label="Password"
              value={credentialsModal.credentials.password}
            />
            <ConnectionString
              label="Connection URL"
              value={credentialsModal.credentials.connectionUrl}
            />
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button
            onClick={() => setCredentialsModal({ open: false, credentials: null })}
            className="btn btn-primary"
          >
            Done
          </button>
        </div>
      </Modal>
    </div>
  )
}
