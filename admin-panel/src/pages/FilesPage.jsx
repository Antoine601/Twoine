import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { 
  FolderOpen, 
  File, 
  Folder, 
  ChevronRight, 
  Upload, 
  Plus, 
  Trash2, 
  Edit3,
  Download,
  Home,
  RefreshCw,
  MoreVertical,
  FileText,
  Image,
  Code,
  Archive
} from 'lucide-react'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import Editor from '@monaco-editor/react'

const getFileIcon = (name, isDirectory) => {
  if (isDirectory) return Folder
  const ext = name.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return Image
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'php', 'rb', 'go', 'rs'].includes(ext)) return Code
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return Archive
  if (['txt', 'md', 'json', 'yml', 'yaml', 'xml', 'html', 'css'].includes(ext)) return FileText
  return File
}

const formatBytes = (bytes) => {
  if (!bytes) return '-'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function FilesPage() {
  const { siteId } = useParams()
  const [searchParams] = useSearchParams()
  const [sites, setSites] = useState([])
  const [selectedSite, setSelectedSite] = useState(siteId || '')
  const [files, setFiles] = useState([])
  const [currentPath, setCurrentPath] = useState('/')
  const [loading, setLoading] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(null)
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, file: null })
  const [newFolderName, setNewFolderName] = useState('')
  const [editFile, setEditFile] = useState({ name: '', content: '', language: 'plaintext' })

  useEffect(() => {
    loadSites()
  }, [])

  useEffect(() => {
    if (selectedSite) {
      loadFiles()
    }
  }, [selectedSite, currentPath])

  const loadSites = async () => {
    try {
      const response = await api.get('/sites')
      const sitesData = response.data.data.sites || response.data.data || []
      setSites(sitesData)
      if (siteId) {
        setSelectedSite(siteId)
      } else if (sitesData.length > 0 && !selectedSite) {
        setSelectedSite(sitesData[0]._id)
      }
    } catch (error) {
      toast.error('Erreur lors du chargement des sites')
    }
  }

  const loadFiles = async () => {
    if (!selectedSite) return
    try {
      setLoading(true)
      const response = await api.get(`/sites/${selectedSite}/files`, {
        params: { path: currentPath }
      })
      setFiles(response.data.data || [])
    } catch (error) {
      toast.error('Erreur lors du chargement des fichiers')
    } finally {
      setLoading(false)
    }
  }

  const navigateTo = (path) => {
    setCurrentPath(path)
  }

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    setCurrentPath('/' + parts.join('/'))
  }

  const handleFileClick = async (file) => {
    if (file.isDirectory) {
      navigateTo(currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`)
    } else {
      await openFileEditor(file)
    }
  }

  const openFileEditor = async (file) => {
    try {
      const response = await api.get(`/sites/${selectedSite}/files/content`, {
        params: { path: currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}` }
      })
      const ext = file.name.split('.').pop()?.toLowerCase()
      const langMap = {
        js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
        py: 'python', php: 'php', rb: 'ruby', go: 'go', rs: 'rust',
        html: 'html', css: 'css', scss: 'scss', json: 'json',
        yml: 'yaml', yaml: 'yaml', xml: 'xml', md: 'markdown'
      }
      setEditFile({
        name: file.name,
        path: currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`,
        content: response.data.data.content || '',
        language: langMap[ext] || 'plaintext'
      })
      setShowEditModal(true)
    } catch (error) {
      toast.error('Impossible de lire ce fichier')
    }
  }

  const handleSaveFile = async () => {
    try {
      await api.put(`/sites/${selectedSite}/files/content`, {
        path: editFile.path,
        content: editFile.content
      })
      toast.success('Fichier enregistré')
      setShowEditModal(false)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de la sauvegarde')
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await api.post(`/sites/${selectedSite}/files/directory`, {
        path: currentPath === '/' ? `/${newFolderName}` : `${currentPath}/${newFolderName}`
      })
      toast.success('Dossier créé')
      setShowCreateFolderModal(false)
      setNewFolderName('')
      loadFiles()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
  }

  const handleDeleteFile = async (file) => {
    try {
      await api.delete(`/sites/${selectedSite}/files`, {
        params: { path: currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}` }
      })
      toast.success('Fichier supprimé')
      loadFiles()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur')
    }
    setConfirmDialog({ open: false, file: null })
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', currentPath)

    try {
      await api.post(`/sites/${selectedSite}/files/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('Fichier uploadé')
      loadFiles()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de l\'upload')
    }
    e.target.value = ''
  }

  const breadcrumbs = currentPath.split('/').filter(Boolean)

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Fichiers</h1>
          <p className="page-subtitle">Explorez et gérez les fichiers de tous les sites</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="btn btn-secondary cursor-pointer">
            <Upload className="w-4 h-4" /> Upload
            <input type="file" className="hidden" onChange={handleUpload} />
          </label>
          <button onClick={() => setShowCreateFolderModal(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" /> Nouveau dossier
          </button>
        </div>
      </div>

      {/* Site Selector & Breadcrumbs */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex items-center gap-4">
            <select
              value={selectedSite}
              onChange={(e) => {
                setSelectedSite(e.target.value)
                setCurrentPath('/')
              }}
              className="input w-64"
            >
              <option value="">Sélectionner un site</option>
              {sites.map((site) => (
                <option key={site._id} value={site._id}>{site.displayName || site.name}</option>
              ))}
            </select>
            
            <div className="flex items-center gap-1 flex-1 overflow-x-auto">
              <button
                onClick={() => setCurrentPath('/')}
                className="p-2 text-admin-400 hover:text-white hover:bg-admin-700 rounded-lg"
              >
                <Home className="w-4 h-4" />
              </button>
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center">
                  <ChevronRight className="w-4 h-4 text-admin-600" />
                  <button
                    onClick={() => navigateTo('/' + breadcrumbs.slice(0, index + 1).join('/'))}
                    className="px-2 py-1 text-sm text-admin-300 hover:text-white rounded"
                  >
                    {crumb}
                  </button>
                </div>
              ))}
            </div>

            <button onClick={loadFiles} className="btn btn-ghost btn-sm">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Files List */}
      <div className="card">
        {loading ? (
          <PageLoading />
        ) : !selectedSite ? (
          <div className="p-12 text-center text-admin-500">
            Sélectionnez un site pour voir ses fichiers
          </div>
        ) : files.length === 0 ? (
          <div className="p-12 text-center text-admin-500">
            <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
            Dossier vide
          </div>
        ) : (
          <div className="divide-y divide-admin-700">
            {currentPath !== '/' && (
              <button
                onClick={navigateUp}
                className="flex items-center gap-4 w-full px-6 py-3 hover:bg-admin-700/50 transition-colors"
              >
                <Folder className="w-5 h-5 text-admin-400" />
                <span className="text-admin-300">..</span>
              </button>
            )}
            {files
              .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : b.isDirectory - a.isDirectory))
              .map((file) => {
                const FileIcon = getFileIcon(file.name, file.isDirectory)
                return (
                  <div
                    key={file.name}
                    className="flex items-center justify-between px-6 py-3 hover:bg-admin-700/50 transition-colors group"
                  >
                    <button
                      onClick={() => handleFileClick(file)}
                      className="flex items-center gap-4 flex-1 text-left"
                    >
                      <FileIcon className={`w-5 h-5 ${file.isDirectory ? 'text-warning-400' : 'text-admin-400'}`} />
                      <div>
                        <p className="text-white">{file.name}</p>
                        {!file.isDirectory && (
                          <p className="text-xs text-admin-500">{formatBytes(file.size)}</p>
                        )}
                      </div>
                    </button>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowActionMenu(showActionMenu === file.name ? null : file.name)
                        }}
                        className="p-2 text-admin-400 hover:text-white hover:bg-admin-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {showActionMenu === file.name && (
                        <div className="absolute right-0 mt-1 w-40 bg-admin-800 border border-admin-700 rounded-lg shadow-lg z-10">
                          {!file.isDirectory && (
                            <button
                              onClick={() => {
                                setShowActionMenu(null)
                                openFileEditor(file)
                              }}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-admin-300 hover:bg-admin-700 w-full"
                            >
                              <Edit3 className="w-4 h-4" /> Éditer
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setShowActionMenu(null)
                              setConfirmDialog({ open: true, file })
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-danger-400 hover:bg-admin-700 w-full"
                          >
                            <Trash2 className="w-4 h-4" /> Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* Create Folder Modal */}
      <Modal
        isOpen={showCreateFolderModal}
        onClose={() => setShowCreateFolderModal(false)}
        title="Nouveau dossier"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nom du dossier</label>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="input"
              placeholder="nouveau-dossier"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCreateFolderModal(false)} className="btn btn-secondary">
              Annuler
            </button>
            <button onClick={handleCreateFolder} className="btn btn-primary">
              Créer
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit File Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Éditer: ${editFile.name}`}
        size="full"
      >
        <div className="h-[60vh]">
          <Editor
            height="100%"
            language={editFile.language}
            value={editFile.content}
            onChange={(value) => setEditFile({ ...editFile, content: value || '' })}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
            }}
          />
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setShowEditModal(false)} className="btn btn-secondary">
            Annuler
          </button>
          <button onClick={handleSaveFile} className="btn btn-primary">
            Enregistrer
          </button>
        </div>
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, file: null })}
        onConfirm={() => handleDeleteFile(confirmDialog.file)}
        title="Supprimer"
        message={`Êtes-vous sûr de vouloir supprimer ${confirmDialog.file?.name} ?`}
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  )
}
