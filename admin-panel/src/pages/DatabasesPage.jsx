import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  Database, 
  Plus, 
  Search, 
  Trash2,
  MoreVertical,
  Link2,
  Eye,
  Copy
} from 'lucide-react'
import api from '../config/api'
import DataTable from '../components/ui/DataTable'
import StatusBadge from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function DatabasesPage() {
  const [searchParams] = useSearchParams()
  const siteFilter = searchParams.get('site')
  const [databases, setDatabases] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ search: '', siteId: siteFilter || '', type: '' })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, database: null })
  const [selectedDb, setSelectedDb] = useState(null)
  const [createForm, setCreateForm] = useState({
    name: '',
    siteId: siteFilter || '',
    type: 'mongodb'
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadDatabases()
    loadSites()
  }, [filters])

  const loadDatabases = async () => {
    try {
      setLoading(true)
      const endpoint = filters.siteId 
        ? `/sites/${filters.siteId}/databases`
        : '/databases'
      const response = await api.get(endpoint)
      const data = response.data.data
      setDatabases(Array.isArray(data) ? data : data.databases || [])
    } catch (error) {
      toast.error('Erreur lors du chargement des bases de données')
    } finally {
      setLoading(false)
    }
  }

  const loadSites = async () => {
    try {
      const response = await api.get('/sites')
      setSites(response.data.data.sites || response.data.data || [])
    } catch (error) {
      console.error('Error loading sites:', error)
    }
  }

  const handleCreateDatabase = async (e) => {
    e.preventDefault()
    if (!createForm.siteId) {
      toast.error('Veuillez sélectionner un site')
      return
    }
    setCreating(true)
    try {
      await api.post(`/sites/${createForm.siteId}/databases`, createForm)
      toast.success('Base de données créée')
      setShowCreateModal(false)
      setCreateForm({ name: '', siteId: filters.siteId || '', type: 'mongodb' })
      loadDatabases()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteDatabase = async (database) => {
    try {
      await api.delete(`/sites/${database.site?._id || database.site}/databases/${database._id}`)
      toast.success('Base de données supprimée')
      loadDatabases()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setConfirmDialog({ open: false, database: null })
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copié dans le presse-papier')
  }

  const columns = [
    {
      key: 'name',
      title: 'Base de données',
      render: (_, db) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-danger-500 to-danger-700 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-medium text-white">{db.name}</p>
            <p className="text-xs text-admin-500 capitalize">{db.type}</p>
          </div>
        </div>
      )
    },
    {
      key: 'site',
      title: 'Site',
      render: (site) => (
        <span className="text-admin-300">{site?.displayName || site?.name || 'N/A'}</span>
      )
    },
    {
      key: 'status',
      title: 'État',
      render: (status) => <StatusBadge status={status || 'active'} />
    },
    {
      key: 'createdAt',
      title: 'Créée le',
      render: (date) => (
        <span className="text-admin-400 text-sm">
          {date ? format(new Date(date), 'dd MMM yyyy', { locale: fr }) : 'N/A'}
        </span>
      )
    },
    {
      key: 'actions',
      title: '',
      width: '50px',
      render: (_, db) => (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowActionMenu(showActionMenu === db._id ? null : db._id)
            }}
            className="p-2 text-admin-400 hover:text-white hover:bg-admin-700 rounded-lg"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showActionMenu === db._id && (
            <div className="absolute right-0 mt-1 w-48 bg-admin-800 border border-admin-700 rounded-lg shadow-lg z-10">
              <button
                onClick={() => {
                  setSelectedDb(db)
                  setShowDetailsModal(true)
                  setShowActionMenu(null)
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-admin-300 hover:bg-admin-700 w-full"
              >
                <Eye className="w-4 h-4" /> Voir détails
              </button>
              <button
                onClick={() => {
                  setShowActionMenu(null)
                  setConfirmDialog({ open: true, database: db })
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-danger-400 hover:bg-admin-700 w-full"
              >
                <Trash2 className="w-4 h-4" /> Supprimer
              </button>
            </div>
          )}
        </div>
      )
    }
  ]

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Bases de données</h1>
          <p className="page-subtitle">Gérez les bases de données de tous les sites</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Créer une base
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-admin-500" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="input pl-10"
              />
            </div>
            <select
              value={filters.siteId}
              onChange={(e) => setFilters({ ...filters, siteId: e.target.value })}
              className="input w-48"
            >
              <option value="">Tous les sites</option>
              {sites.map((site) => (
                <option key={site._id} value={site._id}>{site.displayName || site.name}</option>
              ))}
            </select>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="input w-40"
            >
              <option value="">Tous les types</option>
              <option value="mongodb">MongoDB</option>
              <option value="mysql">MySQL</option>
              <option value="postgresql">PostgreSQL</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={databases}
          loading={loading}
          emptyTitle="Aucune base de données"
          emptyDescription="Créez votre première base de données"
          emptyIcon={Database}
        />
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Créer une base de données"
        size="md"
      >
        <form onSubmit={handleCreateDatabase} className="space-y-4">
          <div>
            <label className="label">Site *</label>
            <select
              value={createForm.siteId}
              onChange={(e) => setCreateForm({ ...createForm, siteId: e.target.value })}
              className="input"
              required
            >
              <option value="">Sélectionner un site</option>
              {sites.map((site) => (
                <option key={site._id} value={site._id}>{site.displayName || site.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Nom de la base *</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
              className="input"
              placeholder="ma_base"
              required
              pattern="[a-z0-9_]+"
            />
            <p className="text-xs text-admin-500 mt-1">Lettres minuscules, chiffres et underscores uniquement</p>
          </div>
          <div>
            <label className="label">Type</label>
            <select
              value={createForm.type}
              onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })}
              className="input"
            >
              <option value="mongodb">MongoDB</option>
              <option value="mysql">MySQL</option>
              <option value="postgresql">PostgreSQL</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
              Annuler
            </button>
            <button type="submit" disabled={creating} className="btn btn-primary">
              {creating ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={`Base de données: ${selectedDb?.name}`}
        size="md"
      >
        {selectedDb && (
          <div className="space-y-4">
            <div className="p-4 bg-admin-700/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-admin-400">Type</span>
                <span className="text-white capitalize">{selectedDb.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-admin-400">Nom</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono">{selectedDb.name}</span>
                  <button onClick={() => copyToClipboard(selectedDb.name)} className="p-1 text-admin-400 hover:text-white">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {selectedDb.host && (
                <div className="flex items-center justify-between">
                  <span className="text-admin-400">Hôte</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono">{selectedDb.host}</span>
                    <button onClick={() => copyToClipboard(selectedDb.host)} className="p-1 text-admin-400 hover:text-white">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              {selectedDb.port && (
                <div className="flex items-center justify-between">
                  <span className="text-admin-400">Port</span>
                  <span className="text-white font-mono">{selectedDb.port}</span>
                </div>
              )}
              {selectedDb.username && (
                <div className="flex items-center justify-between">
                  <span className="text-admin-400">Utilisateur</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono">{selectedDb.username}</span>
                    <button onClick={() => copyToClipboard(selectedDb.username)} className="p-1 text-admin-400 hover:text-white">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              {selectedDb.connectionString && (
                <div>
                  <span className="text-admin-400 block mb-2">Chaîne de connexion</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-accent-400 bg-admin-800 px-2 py-1 rounded flex-1 overflow-x-auto">
                      {selectedDb.connectionString}
                    </code>
                    <button onClick={() => copyToClipboard(selectedDb.connectionString)} className="p-1 text-admin-400 hover:text-white shrink-0">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowDetailsModal(false)} className="btn btn-secondary">
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, database: null })}
        onConfirm={() => handleDeleteDatabase(confirmDialog.database)}
        title="Supprimer la base de données"
        message={`Êtes-vous sûr de vouloir supprimer ${confirmDialog.database?.name} ? Toutes les données seront perdues.`}
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  )
}
