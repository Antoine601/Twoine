import { useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Mail, Calendar, Shield, Key, Save, Building, Phone, MapPin, Globe, Briefcase, Clock3, FileText } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function ProfilePage() {
  const { user, updateProfile, isReadonly } = useAuth()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstName: user?.profile?.firstName || '',
    lastName: user?.profile?.lastName || '',
    avatar: user?.profile?.avatar || '',
    phone: user?.profile?.phone || '',
    company: user?.profile?.company || '',
    jobTitle: user?.profile?.jobTitle || '',
    location: user?.profile?.location || '',
    timezone: user?.profile?.timezone || '',
    website: user?.profile?.website || '',
    bio: user?.profile?.bio || '',
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await updateProfile(formData)
      toast.success('Profil mis à jour avec succès')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Échec de la mise à jour du profil')
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadge = () => {
    if (isReadonly) {
      return <span className="badge badge-warning">Readonly</span>
    }
    return <span className="badge badge-info">User</span>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon profil</h1>
        <p className="text-gray-500 mt-1">Gérez vos informations de compte et vos informations personnelles.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900">Informations du compte</h2>
        </div>
        <div className="card-body">
          <div className="flex items-center gap-6 mb-6">
            <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center">
              {user?.profile?.avatar ? <img src={user.profile.avatar} alt={user.username} className="w-20 h-20 rounded-full object-cover" /> : <User className="w-10 h-10 text-primary-600" />}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{user?.username}</h3>
              <div className="flex items-center gap-2 mt-1">
                {getRoleBadge()}
                <span className={`badge ${user?.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{user?.status}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Mail className="w-5 h-5 text-gray-400" /><div><p className="text-gray-500">Email</p><p className="font-medium text-gray-900">{user?.email}</p></div></div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Shield className="w-5 h-5 text-gray-400" /><div><p className="text-gray-500">Rôle</p><p className="font-medium text-gray-900 capitalize">{user?.role}</p></div></div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Calendar className="w-5 h-5 text-gray-400" /><div><p className="text-gray-500">Membre depuis</p><p className="font-medium text-gray-900">{user?.createdAt ? format(new Date(user.createdAt), 'dd/MM/yyyy') : 'N/A'}</p></div></div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Calendar className="w-5 h-5 text-gray-400" /><div><p className="text-gray-500">Dernière connexion</p><p className="font-medium text-gray-900">{user?.lastLoginAt ? format(new Date(user.lastLoginAt), 'dd/MM/yyyy HH:mm') : 'N/A'}</p></div></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Éditer le profil</h2></div>
        <div className="card-body">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field icon={User} label="Prénom" id="firstName" value={formData.firstName} onChange={(v) => setFormData({ ...formData, firstName: v })} placeholder="Jean" />
              <Field icon={User} label="Nom" id="lastName" value={formData.lastName} onChange={(v) => setFormData({ ...formData, lastName: v })} placeholder="Dupont" />
              <Field icon={Globe} label="Avatar (URL)" id="avatar" value={formData.avatar} onChange={(v) => setFormData({ ...formData, avatar: v })} placeholder="https://..." />
              <Field icon={Phone} label="Téléphone" id="phone" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} placeholder="+33 ..." />
              <Field icon={Building} label="Entreprise" id="company" value={formData.company} onChange={(v) => setFormData({ ...formData, company: v })} placeholder="Twoine" />
              <Field icon={Briefcase} label="Poste" id="jobTitle" value={formData.jobTitle} onChange={(v) => setFormData({ ...formData, jobTitle: v })} placeholder="DevOps Engineer" />
              <Field icon={MapPin} label="Localisation" id="location" value={formData.location} onChange={(v) => setFormData({ ...formData, location: v })} placeholder="Paris" />
              <Field icon={Clock3} label="Fuseau horaire" id="timezone" value={formData.timezone} onChange={(v) => setFormData({ ...formData, timezone: v })} placeholder="Europe/Paris" />
              <Field icon={Globe} label="Site web" id="website" value={formData.website} onChange={(v) => setFormData({ ...formData, website: v })} placeholder="https://..." />
            </div>

            <div>
              <label htmlFor="bio" className="label flex items-center gap-2"><FileText className="w-4 h-4" />Bio</label>
              <textarea id="bio" value={formData.bio} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} rows={4} className="input" placeholder="Quelques mots sur votre activité..." />
            </div>

            <div className="flex justify-end"><button type="submit" disabled={loading} className="btn btn-primary"><Save className="w-4 h-4 mr-2" />{loading ? 'Enregistrement...' : 'Enregistrer les changements'}</button></div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Sécurité</h2></div>
        <div className="card-body">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><Key className="w-5 h-5 text-gray-600" /></div><div><p className="font-medium text-gray-900">Mot de passe</p><p className="text-sm text-gray-500">Modifiez votre mot de passe de connexion</p></div></div>
            <Link to="/change-password" className="btn btn-secondary">Changer le mot de passe</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ icon: Icon, label, id, value, onChange, placeholder }) {
  return (
    <div>
      <label htmlFor={id} className="label flex items-center gap-2"><Icon className="w-4 h-4" />{label}</label>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} className="input" placeholder={placeholder} />
    </div>
  )
}
