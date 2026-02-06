import { useState } from 'react'
import { 
  User, 
  Mail, 
  Key, 
  Save,
  Eye,
  EyeOff,
  Shield,
  Clock
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import api from '../config/api'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function ProfilePage() {
  const { user, fetchUser, changePassword } = useAuth()
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })
  const [saving, setSaving] = useState(false)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères')
      return
    }

    setSaving(true)
    try {
      await changePassword(passwordData.currentPassword, passwordData.newPassword)
      toast.success('Mot de passe modifié. Veuillez vous reconnecter.')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors du changement de mot de passe')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="page-header">
        <h1 className="page-title">Mon Profil</h1>
        <p className="page-subtitle">Gérez vos informations personnelles</p>
      </div>

      {/* Profile Card */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white text-3xl font-bold">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{user?.username}</h2>
              <p className="text-admin-400">{user?.email}</p>
              <div className="flex items-center gap-4 mt-3">
                <span className="badge badge-info flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Administrateur
                </span>
                <span className="badge badge-success flex items-center gap-1">
                  Actif
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="card mb-6">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-white">Informations du compte</h2>
        </div>
        <div className="card-body space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-4 p-4 bg-admin-700/50 rounded-lg">
              <User className="w-5 h-5 text-admin-400" />
              <div>
                <p className="text-xs text-admin-500">Nom d'utilisateur</p>
                <p className="text-white font-medium">{user?.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-admin-700/50 rounded-lg">
              <Mail className="w-5 h-5 text-admin-400" />
              <div>
                <p className="text-xs text-admin-500">Email</p>
                <p className="text-white font-medium">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-admin-700/50 rounded-lg">
              <Shield className="w-5 h-5 text-admin-400" />
              <div>
                <p className="text-xs text-admin-500">Rôle</p>
                <p className="text-white font-medium capitalize">{user?.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-admin-700/50 rounded-lg">
              <Clock className="w-5 h-5 text-admin-400" />
              <div>
                <p className="text-xs text-admin-500">Dernière connexion</p>
                <p className="text-white font-medium">
                  {user?.lastLoginAt 
                    ? format(new Date(user.lastLoginAt), 'dd/MM/yyyy HH:mm', { locale: fr })
                    : 'N/A'
                  }
                </p>
              </div>
            </div>
          </div>
          {user?.profile?.firstName || user?.profile?.lastName ? (
            <div className="flex items-center gap-4 p-4 bg-admin-700/50 rounded-lg">
              <User className="w-5 h-5 text-admin-400" />
              <div>
                <p className="text-xs text-admin-500">Nom complet</p>
                <p className="text-white font-medium">
                  {[user?.profile?.firstName, user?.profile?.lastName].filter(Boolean).join(' ')}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Password Change */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Sécurité</h2>
          {!showPasswordForm && (
            <button 
              onClick={() => setShowPasswordForm(true)}
              className="btn btn-secondary btn-sm"
            >
              <Key className="w-4 h-4" /> Changer le mot de passe
            </button>
          )}
        </div>
        <div className="card-body">
          {showPasswordForm ? (
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <div>
                <label className="label">Mot de passe actuel</label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    className="input pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-admin-400 hover:text-white"
                  >
                    {showPasswords.current ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="input pr-12"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-admin-400 hover:text-white"
                  >
                    {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-admin-500 mt-1">Minimum 8 caractères</p>
              </div>
              <div>
                <label className="label">Confirmer le mot de passe</label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="input pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-admin-400 hover:text-white"
                  >
                    {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn btn-primary">
                  <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowPasswordForm(false)
                    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
                  }}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-admin-700/50 rounded-lg">
              <Key className="w-5 h-5 text-admin-400" />
              <div>
                <p className="text-white font-medium">Mot de passe</p>
                <p className="text-sm text-admin-500">••••••••••••</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
