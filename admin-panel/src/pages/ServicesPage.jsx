import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { 
  Server, 
  Plus, 
  Search, 
  Play, 
  Square, 
  RefreshCw, 
  Trash2,
  MoreVertical,
  Settings
} from 'lucide-react'
import api from '../config/api'
import DataTable from '../components/ui/DataTable'
import StatusBadge from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

export default function ServicesPage() {
  const [searchParams] = useSearchParams()
  const siteFilter = searchParams.get('site')
  const [services, setServices] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ search: '', siteId: siteFilter || '', status: '' })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, service: null })
  const [createForm, setCreateForm] = useState({
    name: '',
    siteId: siteFilter || '',
    command: '',
    workingDirectory: '',
    autoStart: true
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadServices()
    loadSites()
  }, [filters])

  const loadServices = async () => {
    try {
      setLoading(true)
      const endpoint = filters.siteId 
        ? `/sites/${filters.siteId}/services`
        : '/admin/services'
      const response = await api.get(endpoint)
      const data = response.data.data
      setServices(Array.isArray(data) ? data : data.services || [])
    } catch (error) {
      toast.error('Erreur lors du chargement des services')
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

  const handleCreateService = async (e) => {
    e.preventDefault()
    if (!createForm.siteId) {
      toast.error('Veuillez sélectionner un site')
      return
    }
    setCreating(true)
    try {
      await api.post(`/sites/${createForm.siteId}/services`, createForm)
      toast.success('Service créé')
      setShowCreateModal(false)
      setCreateForm({ name: '', siteId: filters.siteId || '', command: '', workingDirectory: '', autoStart: true })
      loadServices()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  const handleServiceAction = async (service, action) => {
    try {
      await api.post(`/sites/${service.site?._id || service.site}/services/${service._id}/${action}`)
      toast.success(`Service ${action === 'start' ? 'démarré' : action === 'stop' ? 'arrêté' : 'redémarré'}`)
      loadServices()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setShowActionMenu(null)
  }

  const handleDeleteService = async (service) => {
    try {
      await api.delete(`/sites/${service.site?._id || service.site}/services/${service._id}`)
      toast.success('Service supprimé')
      loadServices()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setConfirmDialog({ open: false, service: null })
  }

  const columns = [
    {
      key: 'name',
      title: 'Service',
      render: (_, service) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-warning-500 to-warning-700 rounded-lg flex items-center justify-center">
            <Server className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-medium text-white">{service.name}</p>
            <p className="text-xs text-admin-500 font-mono">{service.command?.substring(0, 40)}...</p>
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
      render: (status) => <StatusBadge status={status || 'stopped'} />
    },
    {
      key: 'autoStart',
      title: 'Auto-start',
      render: (autoStart) => (
        <span className={autoStart ? 'text-accent-400' : 'text-admin-500'}>
          {autoStart ? 'Oui' : 'Non'}
        </span>
      )
    },
    {
      key: 'actions',
      title: '',
      width: '50px',
      render: (_, service) => (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowActionMenu(showActionMenu === service._id ? null : service._id)
            }}
            className="p-2 text-admin-400 hover:text-white hover:bg-admin-700 rounded-lg"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showActionMenu === service._id && (
            <div className="absolute right-0 mt-1 w-40 bg-admin-800 border border-admin-700 rounded-lg shadow-lg z-10">
              <button
                onClick={() => handleServiceAction(service, 'start')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-accent-400 hover:bg-admin-700 w-full"
              >
                <Play className="w-4 h-4" /> Démarrer
              </button>
              <button
                onClick={() => handleServiceAction(service, 'stop')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-warning-400 hover:bg-admin-700 w-full"
              >
                <Square className="w-4 h-4" /> Arrêter
              </button>
              <button
                onClick={() => handleServiceAction(service, 'restart')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-primary-400 hover:bg-admin-700 w-full"
              >
                <RefreshCw className="w-4 h-4" /> Redémarrer
              </button>
              <button
                onClick={() => {
                  setShowActionMenu(null)
                  setConfirmDialog({ open: true, service })
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
          <h1 className="page-title">Services</h1>
          <p className="page-subtitle">Gérez les services de tous les sites</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Créer un service
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
                placeholder="Rechercher un service..."
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
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="input w-40"
            >
              <option value="">Tous les états</option>
              <option value="running">En cours</option>
              <option value="stopped">Arrêté</option>
              <option value="error">Erreur</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={services}
          loading={loading}
          emptyTitle="Aucun service"
          emptyDescription="Créez votre premier service pour commencer"
          emptyIcon={Server}
        />
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Créer un service"
        size="md"
      >
        <form onSubmit={handleCreateService} className="space-y-4">
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
            <label className="label">Nom du service *</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              className="input"
              placeholder="app-server"
              required
            />
          </div>
          <div>
            <label className="label">Commande de démarrage *</label>
            <input
              type="text"
              value={createForm.command}
              onChange={(e) => setCreateForm({ ...createForm, command: e.target.value })}
              className="input font-mono"
              placeholder="npm start"
              required
            />
          </div>
          <div>
            <label className="label">Répertoire de travail</label>
            <input
              type="text"
              value={createForm.workingDirectory}
              onChange={(e) => setCreateForm({ ...createForm, workingDirectory: e.target.value })}
              className="input font-mono"
              placeholder="/var/www/site"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoStart"
              checked={createForm.autoStart}
              onChange={(e) => setCreateForm({ ...createForm, autoStart: e.target.checked })}
              className="w-4 h-4 rounded border-admin-600 bg-admin-700 text-primary-600"
            />
            <label htmlFor="autoStart" className="text-sm text-admin-300">
              Démarrer automatiquement au boot
            </label>
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
        onClose={() => setConfirmDialog({ open: false, service: null })}
        onConfirm={() => handleDeleteService(confirmDialog.service)}
        title="Supprimer le service"
        message={`Êtes-vous sûr de vouloir supprimer le service ${confirmDialog.service?.name} ?`}
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  )
}
