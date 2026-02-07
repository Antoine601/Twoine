import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { 
  Globe, 
  Plus, 
  Search, 
  MoreVertical,
  Play,
  Square,
  RefreshCw,
  Trash2,
  Eye,
  FolderOpen,
  Database,
  Server
} from 'lucide-react'
import api from '../config/api'
import DataTable from '../components/ui/DataTable'
import StatusBadge from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function SitesPage() {
  const navigate = useNavigate()
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [filters, setFilters] = useState({ search: '', type: '', status: '' })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, site: null })
  const [createForm, setCreateForm] = useState({
    name: '',
    displayName: '',
    description: '',
    serverType: 'nodejs',
    dbType: 'none'
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadSites()
  }, [pagination.page, filters])

  const loadSites = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...(filters.search && { search: filters.search }),
        ...(filters.type && { type: filters.type }),
        ...(filters.status && { status: filters.status }),
      })
      const response = await api.get(`/sites?${params}`)
      const data = response.data.data
      setSites(data.sites || data || [])
      if (data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: data.pagination.total,
          pages: data.pagination.pages
        }))
      }
    } catch (error) {
      toast.error('Erreur lors du chargement des sites')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSite = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await api.post('/sites', createForm)
      toast.success('Site créé avec succès')
      setShowCreateModal(false)
      setCreateForm({
        name: '',
        displayName: '',
        description: '',
        serverType: 'nodejs',
        dbType: 'none'
      })
      loadSites()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteSite = async (site) => {
    try {
      await api.delete(`/sites/${site._id}`)
      toast.success('Site supprimé')
      loadSites()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression')
    }
    setConfirmDialog({ open: false, site: null })
  }

  const handleServiceAction = async (site, action) => {
    try {
      await api.post(`/sites/${site._id}/services/${action}`)
      toast.success(`Services ${action === 'start' ? 'démarrés' : action === 'stop' ? 'arrêtés' : 'redémarrés'}`)
      loadSites()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setShowActionMenu(null)
  }

  const columns = [
    {
      key: 'name',
      title: 'Site',
      render: (_, site) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-accent-500 to-accent-700 rounded-lg flex items-center justify-center">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-medium text-white">{site.displayName || site.name}</p>
            <p className="text-xs text-admin-500">{site.name}</p>
          </div>
        </div>
      )
    },
    {
      key: 'serverType',
      title: 'Type',
      render: (type) => (
        <span className="text-admin-300 capitalize">{type || 'N/A'}</span>
      )
    },
    {
      key: 'status',
      title: 'État',
      render: (status) => <StatusBadge status={status || 'inactive'} />
    },
    {
      key: 'domains',
      title: 'Domaines',
      render: (domains) => (
        <span className="text-admin-300">{domains?.length || 0}</span>
      )
    },
    {
      key: 'owner',
      title: 'Propriétaire',
      render: (_, site) => (
        <span className="text-admin-300">{site.owner?.username || 'N/A'}</span>
      )
    },
    {
      key: 'createdAt',
      title: 'Créé le',
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
      render: (_, site) => (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowActionMenu(showActionMenu === site._id ? null : site._id)
            }}
            className="p-2 text-admin-400 hover:text-white hover:bg-admin-700 rounded-lg"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showActionMenu === site._id && (
            <div className="absolute right-0 mt-1 w-48 bg-admin-800 border border-admin-700 rounded-lg shadow-lg z-10">
              <Link
                to={`/sites/${site._id}`}
                className="flex items-center gap-2 px-4 py-2 text-sm text-admin-300 hover:text-white hover:bg-admin-700"
              >
                <Eye className="w-4 h-4" /> Voir détails
              </Link>
              <Link
                to={`/files/${site._id}`}
                className="flex items-center gap-2 px-4 py-2 text-sm text-admin-300 hover:text-white hover:bg-admin-700"
              >
                <FolderOpen className="w-4 h-4" /> Fichiers
              </Link>
              <button
                onClick={() => handleServiceAction(site, 'start')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-accent-400 hover:text-accent-300 hover:bg-admin-700 w-full"
              >
                <Play className="w-4 h-4" /> Démarrer
              </button>
              <button
                onClick={() => handleServiceAction(site, 'stop')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-warning-400 hover:text-warning-300 hover:bg-admin-700 w-full"
              >
                <Square className="w-4 h-4" /> Arrêter
              </button>
              <button
                onClick={() => handleServiceAction(site, 'restart')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-primary-400 hover:text-primary-300 hover:bg-admin-700 w-full"
              >
                <RefreshCw className="w-4 h-4" /> Redémarrer
              </button>
              <button
                onClick={() => {
                  setShowActionMenu(null)
                  setConfirmDialog({ open: true, site })
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-danger-400 hover:text-danger-300 hover:bg-admin-700 w-full"
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
          <h1 className="page-title">Sites</h1>
          <p className="page-subtitle">Gérez tous les sites de la plateforme</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Créer un site
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
                placeholder="Rechercher un site..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="input pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="input w-40"
              >
                <option value="">Tous les types</option>
                <option value="nodejs">Node.js</option>
                <option value="python">Python</option>
                <option value="php">PHP</option>
                <option value="static">Static</option>
              </select>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="input w-40"
              >
                <option value="">Tous les états</option>
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
                <option value="error">Erreur</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={sites}
          loading={loading}
          emptyTitle="Aucun site"
          emptyDescription="Créez votre premier site pour commencer"
          emptyIcon={Globe}
          pagination={pagination}
          onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
          onRowClick={(site) => navigate(`/sites/${site._id}`)}
        />
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Créer un site"
        size="md"
      >
        <form onSubmit={handleCreateSite} className="space-y-4">
          <div>
            <label className="label">Nom technique *</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              className="input"
              placeholder="mon-site"
              required
              pattern="[-a-z0-9]+"
            />
            <p className="text-xs text-admin-500 mt-1">Lettres minuscules, chiffres et tirets uniquement</p>
          </div>
          <div>
            <label className="label">Nom d'affichage</label>
            <input
              type="text"
              value={createForm.displayName}
              onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
              className="input"
              placeholder="Mon Site"
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="input"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type de serveur</label>
              <select
                value={createForm.serverType}
                onChange={(e) => setCreateForm({ ...createForm, serverType: e.target.value })}
                className="input"
              >
                <option value="nodejs">Node.js</option>
                <option value="python">Python</option>
                <option value="php">PHP</option>
                <option value="static">Static</option>
              </select>
            </div>
            <div>
              <label className="label">Base de données</label>
              <select
                value={createForm.dbType}
                onChange={(e) => setCreateForm({ ...createForm, dbType: e.target.value })}
                className="input"
              >
                <option value="none">Aucune</option>
                <option value="mongodb">MongoDB</option>
                <option value="mysql">MySQL</option>
                <option value="postgresql">PostgreSQL</option>
              </select>
            </div>
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

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, site: null })}
        onConfirm={() => handleDeleteSite(confirmDialog.site)}
        title="Supprimer le site"
        message={`Êtes-vous sûr de vouloir supprimer ${confirmDialog.site?.displayName || confirmDialog.site?.name} ? Cette action supprimera tous les fichiers, bases de données et services associés.`}
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  )
}
