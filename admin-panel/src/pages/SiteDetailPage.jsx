import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  Save, 
  Play, 
  Square, 
  RefreshCw, 
  Trash2,
  Globe,
  Server,
  Database,
  FolderOpen,
  Link2,
  BarChart3,
  Settings
} from 'lucide-react'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import StatusBadge from '../components/ui/StatusBadge'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function SiteDetailPage() {
  const { siteId } = useParams()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({})
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null })

  useEffect(() => {
    loadSite()
  }, [siteId])

  const loadSite = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/sites/${siteId}`)
      setSite(response.data.data)
      setFormData({
        displayName: response.data.data.displayName || '',
        description: response.data.data.description || '',
      })
    } catch (error) {
      toast.error('Site non trouvé')
      navigate('/sites')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/sites/${siteId}`, formData)
      toast.success('Site mis à jour')
      loadSite()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleServiceAction = async (action) => {
    try {
      await api.post(`/sites/${siteId}/services/${action}`)
      toast.success(`Services ${action === 'start' ? 'démarrés' : action === 'stop' ? 'arrêtés' : 'redémarrés'}`)
      loadSite()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/sites/${siteId}`)
      toast.success('Site supprimé')
      navigate('/sites')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setConfirmDialog({ open: false, action: null })
  }

  if (loading) return <PageLoading />

  const quickLinks = [
    { icon: FolderOpen, label: 'Fichiers', href: `/files/${siteId}`, color: 'primary' },
    { icon: Server, label: 'Services', href: `/services?site=${siteId}`, color: 'warning' },
    { icon: Database, label: 'Bases de données', href: `/databases?site=${siteId}`, color: 'accent' },
    { icon: Link2, label: 'Domaines', href: `/domains?site=${siteId}`, color: 'danger' },
    { icon: BarChart3, label: 'Statistiques', href: `/stats?site=${siteId}`, color: 'primary' },
  ]

  return (
    <div>
      <div className="page-header">
        <Link to="/sites" className="inline-flex items-center gap-2 text-admin-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Retour aux sites
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-accent-500 to-accent-700 rounded-xl flex items-center justify-center">
              <Globe className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="page-title flex items-center gap-3">
                {site?.displayName || site?.name}
                <StatusBadge status={site?.status || 'inactive'} />
              </h1>
              <p className="page-subtitle">{site?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleServiceAction('start')} className="btn btn-success">
              <Play className="w-4 h-4" /> Démarrer
            </button>
            <button onClick={() => handleServiceAction('stop')} className="btn btn-warning">
              <Square className="w-4 h-4" /> Arrêter
            </button>
            <button onClick={() => handleServiceAction('restart')} className="btn btn-secondary">
              <RefreshCw className="w-4 h-4" /> Redémarrer
            </button>
            <button onClick={() => setConfirmDialog({ open: true, action: 'delete' })} className="btn btn-danger">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {quickLinks.map((link) => (
          <Link 
            key={link.label}
            to={link.href} 
            className="card p-4 hover:border-primary-600 transition-colors group text-center"
          >
            <link.icon className={`w-8 h-8 mx-auto mb-2 text-${link.color}-400`} />
            <span className="text-sm text-admin-300 group-hover:text-white">{link.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Edit Form */}
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-white">Informations</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="label">Nom technique</label>
              <input
                type="text"
                value={site?.name || ''}
                className="input bg-admin-700"
                disabled
              />
            </div>
            <div>
              <label className="label">Nom d'affichage</label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="input"
                rows={3}
              />
            </div>
            <div className="flex justify-end pt-4">
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>

        {/* Info Cards */}
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-white">Configuration</h2>
            </div>
            <div className="card-body space-y-3">
              <div className="flex justify-between">
                <span className="text-admin-400">Type serveur</span>
                <span className="text-white capitalize">{site?.serverType || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-admin-400">Base de données</span>
                <span className="text-white capitalize">{site?.dbType || 'Aucune'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-admin-400">Port</span>
                <span className="text-white">{site?.port || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-admin-400">User Linux</span>
                <span className="text-white font-mono text-sm">{site?.linuxUser || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-admin-400">Répertoire</span>
                <span className="text-white font-mono text-sm truncate max-w-[150px]" title={site?.rootPath}>
                  {site?.rootPath || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-white">Domaines</h2>
            </div>
            <div className="card-body">
              {site?.domains?.length > 0 ? (
                <div className="space-y-2">
                  {site.domains.map((domain, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-admin-700/50 rounded-lg">
                      <Link2 className="w-4 h-4 text-admin-400" />
                      <span className="text-white text-sm">{domain.domain || domain}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-admin-500 text-center py-4">Aucun domaine configuré</p>
              )}
              <Link to={`/domains?site=${siteId}`} className="btn btn-secondary w-full mt-4">
                Gérer les domaines
              </Link>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-white">Métadonnées</h2>
            </div>
            <div className="card-body space-y-3">
              <div className="flex justify-between">
                <span className="text-admin-400">Créé le</span>
                <span className="text-white">
                  {site?.createdAt ? format(new Date(site.createdAt), 'dd/MM/yyyy', { locale: fr }) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-admin-400">Propriétaire</span>
                <span className="text-white">{site?.owner?.username || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, action: null })}
        onConfirm={handleDelete}
        title="Supprimer le site"
        message="Cette action est irréversible. Tous les fichiers, bases de données et services seront supprimés."
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  )
}
