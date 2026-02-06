import { useState, useEffect } from 'react'
import { 
  Settings, 
  Save, 
  Server, 
  HardDrive, 
  Network,
  Shield,
  RefreshCw,
  AlertTriangle,
  Info
} from 'lucide-react'
import api from '../config/api'
import { PageLoading } from '../components/ui/Loading'
import toast from 'react-hot-toast'

export default function ConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    server: {
      port: 3000,
      host: 'localhost',
      environment: 'production',
      logLevel: 'info'
    },
    sites: {
      rootDirectory: '/var/www',
      portRange: { min: 3001, max: 3999 },
      maxSitesPerUser: 10,
      defaultServerType: 'nodejs'
    },
    security: {
      jwtExpiration: '24h',
      refreshTokenExpiration: '7d',
      maxLoginAttempts: 5,
      lockoutDuration: 15,
      sessionTimeout: 60
    },
    sftp: {
      port: 22,
      enabled: true,
      chrootDirectory: '/var/www'
    }
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await api.get('/admin/config').catch(() => ({ data: { data: config } }))
      if (response.data.data) {
        setConfig(prev => ({ ...prev, ...response.data.data }))
      }
    } catch (error) {
      console.error('Error loading config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/admin/config', config)
      toast.success('Configuration enregistrée')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoading />

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Configuration Système</h1>
          <p className="page-subtitle">Paramètres globaux de la plateforme</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 bg-warning-900/30 border border-warning-700 rounded-lg mb-6">
        <AlertTriangle className="w-5 h-5 text-warning-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-warning-300 font-medium">Attention</p>
          <p className="text-sm text-warning-400">
            Modifier ces paramètres peut affecter le fonctionnement de la plateforme. 
            Certains changements nécessitent un redémarrage du serveur.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Server Configuration */}
        <div className="card">
          <div className="card-header flex items-center gap-3">
            <Server className="w-5 h-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-white">Serveur</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="label">Port de l'API</label>
              <input
                type="number"
                value={config.server.port}
                onChange={(e) => setConfig({
                  ...config,
                  server: { ...config.server, port: parseInt(e.target.value) }
                })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Hôte</label>
              <input
                type="text"
                value={config.server.host}
                onChange={(e) => setConfig({
                  ...config,
                  server: { ...config.server, host: e.target.value }
                })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Environnement</label>
              <select
                value={config.server.environment}
                onChange={(e) => setConfig({
                  ...config,
                  server: { ...config.server, environment: e.target.value }
                })}
                className="input"
              >
                <option value="development">Development</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div>
              <label className="label">Niveau de logs</label>
              <select
                value={config.server.logLevel}
                onChange={(e) => setConfig({
                  ...config,
                  server: { ...config.server, logLevel: e.target.value }
                })}
                className="input"
              >
                <option value="error">Error</option>
                <option value="warn">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sites Configuration */}
        <div className="card">
          <div className="card-header flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-accent-400" />
            <h2 className="text-lg font-semibold text-white">Sites</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="label">Répertoire racine</label>
              <input
                type="text"
                value={config.sites.rootDirectory}
                onChange={(e) => setConfig({
                  ...config,
                  sites: { ...config.sites, rootDirectory: e.target.value }
                })}
                className="input font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Port min</label>
                <input
                  type="number"
                  value={config.sites.portRange.min}
                  onChange={(e) => setConfig({
                    ...config,
                    sites: { 
                      ...config.sites, 
                      portRange: { ...config.sites.portRange, min: parseInt(e.target.value) }
                    }
                  })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Port max</label>
                <input
                  type="number"
                  value={config.sites.portRange.max}
                  onChange={(e) => setConfig({
                    ...config,
                    sites: { 
                      ...config.sites, 
                      portRange: { ...config.sites.portRange, max: parseInt(e.target.value) }
                    }
                  })}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">Max sites par utilisateur</label>
              <input
                type="number"
                value={config.sites.maxSitesPerUser}
                onChange={(e) => setConfig({
                  ...config,
                  sites: { ...config.sites, maxSitesPerUser: parseInt(e.target.value) }
                })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Type de serveur par défaut</label>
              <select
                value={config.sites.defaultServerType}
                onChange={(e) => setConfig({
                  ...config,
                  sites: { ...config.sites, defaultServerType: e.target.value }
                })}
                className="input"
              >
                <option value="nodejs">Node.js</option>
                <option value="python">Python</option>
                <option value="php">PHP</option>
                <option value="static">Static</option>
              </select>
            </div>
          </div>
        </div>

        {/* Security Configuration */}
        <div className="card">
          <div className="card-header flex items-center gap-3">
            <Shield className="w-5 h-5 text-warning-400" />
            <h2 className="text-lg font-semibold text-white">Sécurité</h2>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="label">Expiration JWT</label>
              <input
                type="text"
                value={config.security.jwtExpiration}
                onChange={(e) => setConfig({
                  ...config,
                  security: { ...config.security, jwtExpiration: e.target.value }
                })}
                className="input"
                placeholder="24h, 7d, etc."
              />
            </div>
            <div>
              <label className="label">Expiration Refresh Token</label>
              <input
                type="text"
                value={config.security.refreshTokenExpiration}
                onChange={(e) => setConfig({
                  ...config,
                  security: { ...config.security, refreshTokenExpiration: e.target.value }
                })}
                className="input"
                placeholder="7d, 30d, etc."
              />
            </div>
            <div>
              <label className="label">Tentatives de connexion max</label>
              <input
                type="number"
                value={config.security.maxLoginAttempts}
                onChange={(e) => setConfig({
                  ...config,
                  security: { ...config.security, maxLoginAttempts: parseInt(e.target.value) }
                })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Durée de blocage (minutes)</label>
              <input
                type="number"
                value={config.security.lockoutDuration}
                onChange={(e) => setConfig({
                  ...config,
                  security: { ...config.security, lockoutDuration: parseInt(e.target.value) }
                })}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* SFTP Configuration */}
        <div className="card">
          <div className="card-header flex items-center gap-3">
            <Network className="w-5 h-5 text-danger-400" />
            <h2 className="text-lg font-semibold text-white">SFTP</h2>
          </div>
          <div className="card-body space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="sftpEnabled"
                checked={config.sftp.enabled}
                onChange={(e) => setConfig({
                  ...config,
                  sftp: { ...config.sftp, enabled: e.target.checked }
                })}
                className="w-4 h-4 rounded border-admin-600 bg-admin-700 text-primary-600"
              />
              <label htmlFor="sftpEnabled" className="text-admin-300">
                Activer l'accès SFTP
              </label>
            </div>
            <div>
              <label className="label">Port SFTP</label>
              <input
                type="number"
                value={config.sftp.port}
                onChange={(e) => setConfig({
                  ...config,
                  sftp: { ...config.sftp, port: parseInt(e.target.value) }
                })}
                className="input"
                disabled={!config.sftp.enabled}
              />
            </div>
            <div>
              <label className="label">Répertoire Chroot</label>
              <input
                type="text"
                value={config.sftp.chrootDirectory}
                onChange={(e) => setConfig({
                  ...config,
                  sftp: { ...config.sftp, chrootDirectory: e.target.value }
                })}
                className="input font-mono"
                disabled={!config.sftp.enabled}
              />
            </div>
            <div className="flex items-start gap-2 p-3 bg-admin-700/50 rounded-lg">
              <Info className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />
              <p className="text-xs text-admin-400">
                Les utilisateurs sont automatiquement isolés dans leur répertoire de site via chroot.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="card mt-6">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-white">Informations Système</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-admin-500 text-sm">Version Twoine</p>
              <p className="text-white font-medium">1.0.0</p>
            </div>
            <div>
              <p className="text-admin-500 text-sm">Node.js</p>
              <p className="text-white font-medium">{process.env.NODE_VERSION || '18.x'}</p>
            </div>
            <div>
              <p className="text-admin-500 text-sm">Système</p>
              <p className="text-white font-medium">Ubuntu 22.04</p>
            </div>
            <div>
              <p className="text-admin-500 text-sm">Base de données</p>
              <p className="text-white font-medium">MongoDB</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
