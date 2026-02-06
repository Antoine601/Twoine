import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { 
  FolderOpen, File, FileText, Image, Code, Archive,
  ChevronRight, Upload, FolderPlus, Trash2, Edit3, 
  Download, RefreshCw, Home, ArrowLeft
} from 'lucide-react'
import api from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { PageLoading } from '../components/ui/Loading'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'

const FILE_ICONS = {
  directory: FolderOpen,
  text: FileText,
  image: Image,
  code: Code,
  archive: Archive,
  default: File,
}

function getFileIcon(item) {
  if (item.isDirectory) return FILE_ICONS.directory
  
  const ext = item.name.split('.').pop()?.toLowerCase()
  
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
    return FILE_ICONS.image
  }
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'php', 'rb', 'go', 'rs', 'java', 'css', 'html', 'json', 'yaml', 'yml', 'sh', 'bash'].includes(ext)) {
    return FILE_ICONS.code
  }
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) {
    return FILE_ICONS.archive
  }
  if (['txt', 'md', 'log', 'csv'].includes(ext)) {
    return FILE_ICONS.text
  }
  
  return FILE_ICONS.default
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function FilesPage() {
  const { siteId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { canWrite } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState([])
  const [currentPath, setCurrentPath] = useState('/')
  const [site, setSite] = useState(null)
  const [selected, setSelected] = useState(null)
  
  const [editModal, setEditModal] = useState({ open: false, file: null, content: '' })
  const [createFolderModal, setCreateFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, item: null })
  const [actionLoading, setActionLoading] = useState(false)

  const getPathFromUrl = useCallback(() => {
    const pathMatch = location.pathname.match(/\/sites\/[^/]+\/files(.*)/)
    return pathMatch ? decodeURIComponent(pathMatch[1]) || '/' : '/'
  }, [location.pathname])

  useEffect(() => {
    const urlPath = getPathFromUrl()
    setCurrentPath(urlPath)
  }, [getPathFromUrl])

  useEffect(() => {
    fetchFiles()
  }, [siteId, currentPath])

  const fetchFiles = async () => {
    setLoading(true)
    try {
      const [siteRes, filesRes] = await Promise.all([
        api.get(`/sites/${siteId}`),
        api.get(`/sites/${siteId}/files`, { params: { path: currentPath } }),
      ])
      setSite(siteRes.data.data?.site || siteRes.data.data)
      setFiles(filesRes.data.data?.items || [])
    } catch (error) {
      console.error('Failed to fetch files:', error)
      toast.error('Failed to load files')
    } finally {
      setLoading(false)
    }
  }

  const navigateToPath = (path) => {
    const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/')
    navigate(`/sites/${siteId}/files${encodedPath}`)
  }

  const handleItemClick = (item) => {
    if (item.isDirectory) {
      const newPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
      navigateToPath(newPath)
    } else {
      setSelected(item)
    }
  }

  const handleGoUp = () => {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    navigateToPath(parts.length === 0 ? '/' : '/' + parts.join('/'))
  }

  const handleDownload = async (item) => {
    try {
      const filePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
      window.open(`/api/sites/${siteId}/files/download?path=${encodeURIComponent(filePath)}`, '_blank')
    } catch (error) {
      toast.error('Failed to download file')
    }
  }

  const handleEdit = async (item) => {
    if (!canWrite) return
    try {
      const filePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
      const response = await api.get(`/sites/${siteId}/files/read`, { params: { path: filePath } })
      setEditModal({ open: true, file: item, content: response.data.data?.content || '' })
    } catch (error) {
      toast.error('Failed to read file')
    }
  }

  const handleSaveEdit = async () => {
    if (!canWrite) return
    setActionLoading(true)
    try {
      const filePath = currentPath === '/' ? `/${editModal.file.name}` : `${currentPath}/${editModal.file.name}`
      await api.post(`/sites/${siteId}/files/write`, { path: filePath, content: editModal.content })
      toast.success('File saved')
      setEditModal({ open: false, file: null, content: '' })
      fetchFiles()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save file')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!canWrite || !deleteConfirm.item) return
    setActionLoading(true)
    try {
      const itemPath = currentPath === '/' ? `/${deleteConfirm.item.name}` : `${currentPath}/${deleteConfirm.item.name}`
      await api.delete(`/sites/${siteId}/files`, { 
        params: { path: itemPath, recursive: deleteConfirm.item.isDirectory ? 'true' : 'false' } 
      })
      toast.success('Item deleted')
      setDeleteConfirm({ open: false, item: null })
      setSelected(null)
      fetchFiles()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateFolder = async () => {
    if (!canWrite || !newFolderName.trim()) return
    setActionLoading(true)
    try {
      const folderPath = currentPath === '/' ? `/${newFolderName}` : `${currentPath}/${newFolderName}`
      await api.post(`/sites/${siteId}/files/mkdir`, { path: folderPath })
      toast.success('Folder created')
      setCreateFolderModal(false)
      setNewFolderName('')
      fetchFiles()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create folder')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpload = async (e) => {
    if (!canWrite) return
    const files = e.target.files
    if (!files || files.length === 0) return

    const formData = new FormData()
    formData.append('targetPath', currentPath)
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }

    setActionLoading(true)
    try {
      await api.post(`/sites/${siteId}/files/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Files uploaded')
      fetchFiles()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to upload')
    } finally {
      setActionLoading(false)
      e.target.value = ''
    }
  }

  const pathParts = currentPath.split('/').filter(Boolean)

  if (loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">File Manager</h1>
          <p className="text-gray-500 mt-1">{site?.displayName}</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreateFolderModal(true)}
              className="btn btn-secondary"
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              New Folder
            </button>
            <label className="btn btn-primary cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              Upload
              <input
                type="file"
                multiple
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm bg-white rounded-lg px-4 py-3 border border-gray-200">
        <button
          onClick={() => navigateToPath('/')}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <Home className="w-4 h-4 text-gray-500" />
        </button>
        {pathParts.map((part, index) => (
          <div key={index} className="flex items-center">
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <button
              onClick={() => navigateToPath('/' + pathParts.slice(0, index + 1).join('/'))}
              className="px-2 py-1 hover:bg-gray-100 rounded text-gray-700"
            >
              {part}
            </button>
          </div>
        ))}
        {currentPath !== '/' && (
          <button
            onClick={handleGoUp}
            className="ml-auto p-1 hover:bg-gray-100 rounded text-gray-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* File List */}
      <div className="card">
        {files.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Empty folder"
            description="This folder is empty."
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {files.map((item) => {
              const Icon = getFileIcon(item)
              return (
                <div
                  key={item.name}
                  onClick={() => handleItemClick(item)}
                  className={clsx(
                    'flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors',
                    selected?.name === item.name && 'bg-primary-50'
                  )}
                >
                  <Icon className={clsx(
                    'w-5 h-5',
                    item.isDirectory ? 'text-yellow-500' : 'text-gray-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.name}</p>
                    {item.modifiedAt && (
                      <p className="text-xs text-gray-500">
                        Modified {formatDistanceToNow(new Date(item.modifiedAt), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {item.isDirectory ? `${item.itemCount || 0} items` : formatFileSize(item.size || 0)}
                  </div>
                  {!item.isDirectory && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDownload(item)}
                        className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {canWrite && (
                        <>
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ open: true, item })}
                            className="p-1.5 hover:bg-red-100 rounded text-gray-500 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {item.isDirectory && canWrite && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirm({ open: true, item })
                      }}
                      className="p-1.5 hover:bg-red-100 rounded text-gray-500 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={editModal.open}
        onClose={() => setEditModal({ open: false, file: null, content: '' })}
        title={`Edit: ${editModal.file?.name}`}
        size="xl"
      >
        <textarea
          value={editModal.content}
          onChange={(e) => setEditModal({ ...editModal, content: e.target.value })}
          className="w-full h-96 font-mono text-sm p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setEditModal({ open: false, file: null, content: '' })} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={handleSaveEdit} disabled={actionLoading} className="btn btn-primary">
            {actionLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Modal>

      {/* Create Folder Modal */}
      <Modal
        isOpen={createFolderModal}
        onClose={() => { setCreateFolderModal(false); setNewFolderName('') }}
        title="Create New Folder"
        size="sm"
      >
        <input
          type="text"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="Folder name"
          className="input"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => { setCreateFolderModal(false); setNewFolderName('') }} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={handleCreateFolder} disabled={actionLoading || !newFolderName.trim()} className="btn btn-primary">
            {actionLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, item: null })}
        onConfirm={handleDelete}
        title="Delete Item"
        message={`Are you sure you want to delete "${deleteConfirm.item?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        loading={actionLoading}
      />
    </div>
  )
}
