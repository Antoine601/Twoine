import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  Lock, 
  Unlock, 
  Key, 
  UserCheck,
  Globe,
  Plus,
  X
} from 'lucide-react'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import StatusBadge from '../components/ui/StatusBadge'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Modal from '../components/ui/Modal'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function UserDetailPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { impersonateUser } = useAuth()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({})
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null })
  const [showAssignSiteModal, setShowAssignSiteModal] = useState(false)
  const [availableSites, setAvailableSites] = useState([])
  const [selectedSite, setSelectedSite] = useState({ siteId: '', accessLevel: 'collaborator' })

  useEffect(() => {
    loadUser()
  }, [userId])

  const loadUser = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/admin/users/${userId}`)
      setUser(response.data.data)
      setFormData({
        email: response.data.data.email,
        role: response.data.data.role,
        firstName: response.data.data.profile?.firstName || '',
        lastName: response.data.data.profile?.lastName || '',
        status: response.data.data.status,
      })
    } catch (error) {
      toast.error('Utilisateur non trouvé')
      navigate('/users')
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableSites = async () => {
    try {
      const response = await api.get('/sites')
      setAvailableSites(response.data.data.sites || response.data.data || [])
    } catch (error) {
      console.error('Error loading sites:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/admin/users/${userId}`, formData)
      toast.success('Utilisateur mis à jour')
      loadUser()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la mise à jour')
    } finally {
      setSaving(false)
    }
  }

  const handleBlock = async () => {
    try {
      await api.post(`/admin/users/${userId}/block`, { reason: 'Bloqué par administrateur' })
      toast.success('Utilisateur bloqué')
      loadUser()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setConfirmDialog({ open: false, action: null })
  }

  const handleUnblock = async () => {
    try {
      await api.post(`/admin/users/${userId}/unblock`)
      toast.success('Utilisateur débloqué')
      loadUser()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setConfirmDialog({ open: false, action: null })
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/users/${userId}`)
      toast.success('Utilisateur supprimé')
      navigate('/users')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setConfirmDialog({ open: false, action: null })
  }

  const handleResetPassword = async () => {
    try {
      const response = await api.post(`/admin/users/${userId}/reset-password`, {
        mustChangePassword: true
      })
      toast.success(`Nouveau mot de passe: ${response.data.data.temporaryPassword}`, { duration: 10000 })
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
  }

  const handleImpersonate = async () => {
    try {
      await impersonateUser(userId)
      navigate('/')
    } catch (error) {
      console.error('Impersonate error:', error)
    }
  }

  const handleAssignSite = async () => {
    if (!selectedSite.siteId) return
    try {
      await api.post(`/admin/users/${userId}/sites`, selectedSite)
      toast.success('Site assigné')
      setShowAssignSiteModal(false)
      setSelectedSite({ siteId: '', accessLevel: 'collaborator' })
      loadUser()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
  }

  const handleRemoveSite = async (siteId) => {
    try {
      await api.delete(`/admin/users/${userId}/sites/${siteId}`)
      toast.success('Accès retiré')
      loadUser()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
  }

  if (loading) return <PageLoading />

  return (
    <div>
      <div className="page-header">
        <Link to="/users" className="inline-flex items-center gap-2 text-admin-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Retour aux utilisateurs
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="page-title flex items-center gap-3">
                {user?.username}
                <StatusBadge status={user?.role} />
                <StatusBadge status={user?.status} />
              </h1>
              <p className="page-subtitle">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.role !== 'admin' && (
              <button onClick={handleImpersonate} className="btn btn-secondary">
                <UserCheck className="w-4 h-4" /> Impersonner
              </button>
            )}
            <button onClick={handleResetPassword} className="btn btn-secondary">
              <Key className="w-4 h-4" /> Reset MDP
            </button>
            {user?.status === 'blocked' ? (
              <button onClick={() => setConfirmDialog({ open: true, action: 'unblock' })} className="btn btn-success">
                <Unlock className="w-4 h-4" /> Débloquer
              </button>
            ) : (
              <button onClick={() => setConfirmDialog({ open: true, action: 'block' })} className="btn btn-warning">
                <Lock className="w-4 h-4" /> Bloquer
              </button>
            )}
            <button onClick={() => setConfirmDialog({ open: true, action: 'delete' })} className="btn btn-danger">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Edit Form */}
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-white">Informations</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Prénom</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Nom</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Rôle</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="input"
                >
                  <option value="user">User</option>
                  <option value="readonly">Readonly</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="label">État</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="input"
                >
                  <option value="active">Actif</option>
                  <option value="blocked">Bloqué</option>
                  <option value="pending">En attente</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-white">Détails</h2>
            </div>
            <div className="card-body space-y-3">
              <div className="flex justify-between">
                <span className="text-admin-400">Créé le</span>
                <span className="text-white">
                  {user?.createdAt ? format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: fr }) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-admin-400">Dernière connexion</span>
                <span className="text-white">
                  {user?.lastLoginAt ? format(new Date(user.lastLoginAt), 'dd/MM/yyyy HH:mm', { locale: fr }) : 'Jamais'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-admin-400">Dernière IP</span>
                <span className="text-white">{user?.lastLoginIP || 'N/A'}</span>
              </div>
              {user?.blockedAt && (
                <>
                  <div className="flex justify-between">
                    <span className="text-admin-400">Bloqué le</span>
                    <span className="text-danger-400">
                      {format(new Date(user.blockedAt), 'dd/MM/yyyy', { locale: fr })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-admin-400">Raison</span>
                    <span className="text-danger-400">{user.blockedReason || 'Non spécifiée'}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sites */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Sites assignés</h2>
              <button 
                onClick={() => {
                  loadAvailableSites()
                  setShowAssignSiteModal(true)
                }}
                className="btn btn-sm btn-secondary"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="card-body">
              {user?.sites?.length > 0 ? (
                <div className="space-y-2">
                  {user.sites.map((siteAccess) => (
                    <div key={siteAccess.site?._id || siteAccess.site} className="flex items-center justify-between p-3 bg-admin-700/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Globe className="w-4 h-4 text-admin-400" />
                        <div>
                          <p className="text-white text-sm">{siteAccess.site?.displayName || siteAccess.site?.name || 'Site'}</p>
                          <p className="text-xs text-admin-500">{siteAccess.accessLevel}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveSite(siteAccess.site?._id || siteAccess.site)}
                        className="p-1 text-admin-400 hover:text-danger-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-admin-500 text-center py-4">Aucun site assigné</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assign Site Modal */}
      <Modal
        isOpen={showAssignSiteModal}
        onClose={() => setShowAssignSiteModal(false)}
        title="Assigner un site"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Site</label>
            <select
              value={selectedSite.siteId}
              onChange={(e) => setSelectedSite({ ...selectedSite, siteId: e.target.value })}
              className="input"
            >
              <option value="">Sélectionner un site</option>
              {availableSites.map((site) => (
                <option key={site._id} value={site._id}>{site.displayName || site.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Niveau d'accès</label>
            <select
              value={selectedSite.accessLevel}
              onChange={(e) => setSelectedSite({ ...selectedSite, accessLevel: e.target.value })}
              className="input"
            >
              <option value="owner">Owner</option>
              <option value="collaborator">Collaborator</option>
              <option value="readonly">Readonly</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setShowAssignSiteModal(false)} className="btn btn-secondary">
              Annuler
            </button>
            <button onClick={handleAssignSite} className="btn btn-primary">
              Assigner
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={confirmDialog.open && confirmDialog.action === 'delete'}
        onClose={() => setConfirmDialog({ open: false, action: null })}
        onConfirm={handleDelete}
        title="Supprimer l'utilisateur"
        message="Cette action est irréversible. Toutes les données seront perdues."
        confirmText="Supprimer"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={confirmDialog.open && confirmDialog.action === 'block'}
        onClose={() => setConfirmDialog({ open: false, action: null })}
        onConfirm={handleBlock}
        title="Bloquer l'utilisateur"
        message="L'utilisateur ne pourra plus se connecter."
        confirmText="Bloquer"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={confirmDialog.open && confirmDialog.action === 'unblock'}
        onClose={() => setConfirmDialog({ open: false, action: null })}
        onConfirm={handleUnblock}
        title="Débloquer l'utilisateur"
        message="L'utilisateur pourra à nouveau se connecter."
        confirmText="Débloquer"
        variant="success"
      />
    </div>
  )
}
