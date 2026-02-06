import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  Link2, 
  Plus, 
  Search, 
  Trash2,
  MoreVertical,
  RefreshCw,
  Shield,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'
import api from '../config/api'
import DataTable from '../components/ui/DataTable'
import StatusBadge from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import { format, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function DomainsPage() {
  const [searchParams] = useSearchParams()
  const siteFilter = searchParams.get('site')
  const [domains, setDomains] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ search: '', siteId: siteFilter || '' })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, domain: null })
  const [createForm, setCreateForm] = useState({
    domain: '',
    siteId: siteFilter || '',
    ssl: true
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadDomains()
    loadSites()
  }, [filters])

  const loadDomains = async () => {
    try {
      setLoading(true)
      const endpoint = filters.siteId 
        ? `/sites/${filters.siteId}/domains`
        : '/admin/domains'
      const response = await api.get(endpoint)
      const data = response.data.data
      setDomains(Array.isArray(data) ? data : data.domains || [])
    } catch (error) {
      toast.error('Erreur lors du chargement des domaines')
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

  const handleCreateDomain = async (e) => {
    e.preventDefault()
    if (!createForm.siteId) {
      toast.error('Veuillez sélectionner un site')
      return
    }
    setCreating(true)
    try {
      await api.post(`/sites/${createForm.siteId}/domains`, createForm)
      toast.success('Domaine ajouté')
      setShowCreateModal(false)
      setCreateForm({ domain: '', siteId: filters.siteId || '', ssl: true })
      loadDomains()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de l\'ajout')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteDomain = async (domain) => {
    try {
      await api.delete(`/sites/${domain.site?._id || domain.site}/domains/${domain._id}`)
      toast.success('Domaine supprimé')
      loadDomains()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setConfirmDialog({ open: false, domain: null })
  }

  const handleRenewCertificate = async (domain) => {
    try {
      await api.post(`/sites/${domain.site?._id || domain.site}/domains/${domain._id}/renew-ssl`)
      toast.success('Certificat renouvelé')
      loadDomains()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors du renouvellement')
    }
    setShowActionMenu(null)
  }

  const getCertificateStatus = (domain) => {
    if (!domain.sslEnabled) return { status: 'inactive', label: 'SSL désactivé' }
    if (!domain.sslExpiresAt) return { status: 'warning', label: 'Non configuré' }
    
    const daysUntilExpiry = differenceInDays(new Date(domain.sslExpiresAt), new Date())
    if (daysUntilExpiry < 0) return { status: 'error', label: 'Expiré' }
    if (daysUntilExpiry < 30) return { status: 'warning', label: `Expire dans ${daysUntilExpiry}j` }
    return { status: 'active', label: 'Valide' }
  }

  const columns = [
    {
      key: 'domain',
      title: 'Domaine',
      render: (_, domain) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
            <Link2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <a 
              href={`https://${domain.domain}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium text-white hover:text-primary-400"
            >
              {domain.domain}
            </a>
            <p className="text-xs text-admin-500">{domain.isPrimary ? 'Principal' : 'Secondaire'}</p>
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
      key: 'ssl',
      title: 'SSL',
      render: (_, domain) => {
        const cert = getCertificateStatus(domain)
        return (
          <div className="flex items-center gap-2">
            {cert.status === 'active' && <CheckCircle className="w-4 h-4 text-accent-400" />}
            {cert.status === 'warning' && <AlertTriangle className="w-4 h-4 text-warning-400" />}
            {cert.status === 'error' && <AlertTriangle className="w-4 h-4 text-danger-400" />}
            {cert.status === 'inactive' && <Shield className="w-4 h-4 text-admin-500" />}
            <span className={`text-sm ${
              cert.status === 'active' ? 'text-accent-400' :
              cert.status === 'warning' ? 'text-warning-400' :
              cert.status === 'error' ? 'text-danger-400' : 'text-admin-500'
            }`}>
              {cert.label}
            </span>
          </div>
        )
      }
    },
    {
      key: 'sslExpiresAt',
      title: 'Expiration',
      render: (date) => (
        <span className="text-admin-400 text-sm">
          {date ? format(new Date(date), 'dd MMM yyyy', { locale: fr }) : '-'}
        </span>
      )
    },
    {
      key: 'actions',
      title: '',
      width: '50px',
      render: (_, domain) => (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowActionMenu(showActionMenu === domain._id ? null : domain._id)
            }}
            className="p-2 text-admin-400 hover:text-white hover:bg-admin-700 rounded-lg"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showActionMenu === domain._id && (
            <div className="absolute right-0 mt-1 w-48 bg-admin-800 border border-admin-700 rounded-lg shadow-lg z-10">
              <button
                onClick={() => handleRenewCertificate(domain)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-admin-300 hover:bg-admin-700 w-full"
              >
                <RefreshCw className="w-4 h-4" /> Renouveler SSL
              </button>
              <button
                onClick={() => {
                  setShowActionMenu(null)
                  setConfirmDialog({ open: true, domain })
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
          <h1 className="page-title">Domaines</h1>
          <p className="page-subtitle">Gérez les domaines et certificats SSL</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Ajouter un domaine
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
                placeholder="Rechercher un domaine..."
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
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={domains}
          loading={loading}
          emptyTitle="Aucun domaine"
          emptyDescription="Ajoutez un domaine pour commencer"
          emptyIcon={Link2}
        />
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Ajouter un domaine"
        size="md"
      >
        <form onSubmit={handleCreateDomain} className="space-y-4">
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
            <label className="label">Domaine *</label>
            <input
              type="text"
              value={createForm.domain}
              onChange={(e) => setCreateForm({ ...createForm, domain: e.target.value.toLowerCase() })}
              className="input"
              placeholder="example.com"
              required
            />
            <p className="text-xs text-admin-500 mt-1">Sans http:// ou https://</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ssl"
              checked={createForm.ssl}
              onChange={(e) => setCreateForm({ ...createForm, ssl: e.target.checked })}
              className="w-4 h-4 rounded border-admin-600 bg-admin-700 text-primary-600"
            />
            <label htmlFor="ssl" className="text-sm text-admin-300">
              Activer SSL (Let's Encrypt)
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
              Annuler
            </button>
            <button type="submit" disabled={creating} className="btn btn-primary">
              {creating ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, domain: null })}
        onConfirm={() => handleDeleteDomain(confirmDialog.domain)}
        title="Supprimer le domaine"
        message={`Êtes-vous sûr de vouloir supprimer ${confirmDialog.domain?.domain} ?`}
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  )
}
