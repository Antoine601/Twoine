import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { 
  Users, 
  Plus, 
  Search, 
  Filter,
  MoreVertical,
  UserPlus,
  Lock,
  Unlock,
  Key,
  UserCheck,
  Trash2,
  Eye
} from 'lucide-react'
import api from '../config/api'
import DataTable from '../components/ui/DataTable'
import StatusBadge from '../components/ui/StatusBadge'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function UsersPage() {
  const navigate = useNavigate()
  const { impersonateUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [filters, setFilters] = useState({ search: '', role: '', status: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, user: null, action: null })
  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user',
    firstName: '',
    lastName: '',
    mustChangePassword: true
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [pagination.page, filters])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...(filters.search && { search: filters.search }),
        ...(filters.role && { role: filters.role }),
        ...(filters.status && { status: filters.status }),
      })
      const response = await api.get(`/admin/users?${params}`)
      setUsers(response.data.data.users)
      setPagination(prev => ({
        ...prev,
        total: response.data.data.pagination.total,
        pages: response.data.data.pagination.pages
      }))
    } catch (error) {
      toast.error('Erreur lors du chargement des utilisateurs')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      await api.post('/admin/users', createForm)
      toast.success('Utilisateur créé avec succès')
      setShowCreateModal(false)
      setCreateForm({
        username: '',
        email: '',
        password: '',
        role: 'user',
        firstName: '',
        lastName: '',
        mustChangePassword: true
      })
      loadUsers()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la création')
    } finally {
      setCreating(false)
    }
  }

  const handleBlockUser = async (user) => {
    try {
      await api.post(`/admin/users/${user._id}/block`, { reason: 'Bloqué par administrateur' })
      toast.success(`${user.username} a été bloqué`)
      loadUsers()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors du blocage')
    }
    setConfirmDialog({ open: false, user: null, action: null })
  }

  const handleUnblockUser = async (user) => {
    try {
      await api.post(`/admin/users/${user._id}/unblock`)
      toast.success(`${user.username} a été débloqué`)
      loadUsers()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors du déblocage')
    }
    setConfirmDialog({ open: false, user: null, action: null })
  }

  const handleDeleteUser = async (user) => {
    try {
      await api.delete(`/admin/users/${user._id}`)
      toast.success(`${user.username} a été supprimé`)
      loadUsers()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression')
    }
    setConfirmDialog({ open: false, user: null, action: null })
  }

  const handleResetPassword = async (user) => {
    try {
      const response = await api.post(`/admin/users/${user._id}/reset-password`, {
        mustChangePassword: true
      })
      toast.success(`Nouveau mot de passe: ${response.data.data.temporaryPassword}`, { duration: 10000 })
      loadUsers()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors du reset')
    }
    setShowActionMenu(null)
  }

  const handleImpersonate = async (user) => {
    try {
      await impersonateUser(user._id)
      navigate('/')
    } catch (error) {
      console.error('Impersonate error:', error)
    }
    setShowActionMenu(null)
  }

  const columns = [
    {
      key: 'username',
      title: 'Utilisateur',
      render: (_, user) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white font-medium">
            {user.username?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-white">{user.username}</p>
            <p className="text-xs text-admin-500">{user.email}</p>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      title: 'Rôle',
      render: (role) => <StatusBadge status={role} />
    },
    {
      key: 'status',
      title: 'État',
      render: (status) => <StatusBadge status={status} />
    },
    {
      key: 'sites',
      title: 'Sites',
      render: (sites) => (
        <span className="text-admin-300">{sites?.length || 0} sites</span>
      )
    },
    {
      key: 'lastLoginAt',
      title: 'Dernière connexion',
      render: (date) => (
        <span className="text-admin-400 text-sm">
          {date ? format(new Date(date), 'dd MMM yyyy HH:mm', { locale: fr }) : 'Jamais'}
        </span>
      )
    },
    {
      key: 'actions',
      title: '',
      width: '50px',
      render: (_, user) => (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowActionMenu(showActionMenu === user._id ? null : user._id)
            }}
            className="p-2 text-admin-400 hover:text-white hover:bg-admin-700 rounded-lg"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showActionMenu === user._id && (
            <div className="absolute right-0 mt-1 w-48 bg-admin-800 border border-admin-700 rounded-lg shadow-lg z-10">
              <Link
                to={`/users/${user._id}`}
                className="flex items-center gap-2 px-4 py-2 text-sm text-admin-300 hover:text-white hover:bg-admin-700"
              >
                <Eye className="w-4 h-4" /> Voir détails
              </Link>
              {user.role !== 'admin' && (
                <button
                  onClick={() => handleImpersonate(user)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-admin-300 hover:text-white hover:bg-admin-700 w-full"
                >
                  <UserCheck className="w-4 h-4" /> Se connecter en tant que
                </button>
              )}
              <button
                onClick={() => handleResetPassword(user)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-admin-300 hover:text-white hover:bg-admin-700 w-full"
              >
                <Key className="w-4 h-4" /> Reset mot de passe
              </button>
              {user.status === 'blocked' ? (
                <button
                  onClick={() => setConfirmDialog({ open: true, user, action: 'unblock' })}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-accent-400 hover:text-accent-300 hover:bg-admin-700 w-full"
                >
                  <Unlock className="w-4 h-4" /> Débloquer
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDialog({ open: true, user, action: 'block' })}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-warning-400 hover:text-warning-300 hover:bg-admin-700 w-full"
                >
                  <Lock className="w-4 h-4" /> Bloquer
                </button>
              )}
              <button
                onClick={() => setConfirmDialog({ open: true, user, action: 'delete' })}
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
          <h1 className="page-title">Utilisateurs</h1>
          <p className="page-subtitle">Gérez les utilisateurs de la plateforme</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          <UserPlus className="w-4 h-4" /> Créer un utilisateur
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
                placeholder="Rechercher un utilisateur..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="input pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filters.role}
                onChange={(e) => setFilters({ ...filters, role: e.target.value })}
                className="input w-40"
              >
                <option value="">Tous les rôles</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
                <option value="readonly">Readonly</option>
              </select>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="input w-40"
              >
                <option value="">Tous les états</option>
                <option value="active">Actif</option>
                <option value="blocked">Bloqué</option>
                <option value="pending">En attente</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={users}
          loading={loading}
          emptyTitle="Aucun utilisateur"
          emptyDescription="Créez votre premier utilisateur pour commencer"
          emptyIcon={Users}
          pagination={pagination}
          onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
          onRowClick={(user) => navigate(`/users/${user._id}`)}
        />
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Créer un utilisateur"
        size="md"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Prénom</label>
              <input
                type="text"
                value={createForm.firstName}
                onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Nom</label>
              <input
                type="text"
                value={createForm.lastName}
                onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="label">Nom d'utilisateur *</label>
            <input
              type="text"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">Mot de passe *</label>
            <input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              className="input"
              required
              minLength={8}
            />
            <p className="text-xs text-admin-500 mt-1">Minimum 8 caractères</p>
          </div>
          <div>
            <label className="label">Rôle</label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              className="input"
            >
              <option value="user">User</option>
              <option value="readonly">Readonly</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="mustChangePassword"
              checked={createForm.mustChangePassword}
              onChange={(e) => setCreateForm({ ...createForm, mustChangePassword: e.target.checked })}
              className="w-4 h-4 rounded border-admin-600 bg-admin-700 text-primary-600"
            />
            <label htmlFor="mustChangePassword" className="text-sm text-admin-300">
              Forcer le changement de mot de passe à la première connexion
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

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={confirmDialog.open && confirmDialog.action === 'delete'}
        onClose={() => setConfirmDialog({ open: false, user: null, action: null })}
        onConfirm={() => handleDeleteUser(confirmDialog.user)}
        title="Supprimer l'utilisateur"
        message={`Êtes-vous sûr de vouloir supprimer ${confirmDialog.user?.username} ? Cette action est irréversible.`}
        confirmText="Supprimer"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={confirmDialog.open && confirmDialog.action === 'block'}
        onClose={() => setConfirmDialog({ open: false, user: null, action: null })}
        onConfirm={() => handleBlockUser(confirmDialog.user)}
        title="Bloquer l'utilisateur"
        message={`Êtes-vous sûr de vouloir bloquer ${confirmDialog.user?.username} ? Il ne pourra plus se connecter.`}
        confirmText="Bloquer"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={confirmDialog.open && confirmDialog.action === 'unblock'}
        onClose={() => setConfirmDialog({ open: false, user: null, action: null })}
        onConfirm={() => handleUnblockUser(confirmDialog.user)}
        title="Débloquer l'utilisateur"
        message={`Êtes-vous sûr de vouloir débloquer ${confirmDialog.user?.username} ?`}
        confirmText="Débloquer"
        variant="success"
      />
    </div>
  )
}
