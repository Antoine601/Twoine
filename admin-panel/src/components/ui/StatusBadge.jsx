import clsx from 'clsx'

const statusConfig = {
  active: { label: 'Actif', className: 'badge-success' },
  running: { label: 'En cours', className: 'badge-success' },
  online: { label: 'En ligne', className: 'badge-success' },
  healthy: { label: 'OK', className: 'badge-success' },
  
  blocked: { label: 'Bloqué', className: 'badge-danger' },
  stopped: { label: 'Arrêté', className: 'badge-danger' },
  offline: { label: 'Hors ligne', className: 'badge-danger' },
  error: { label: 'Erreur', className: 'badge-danger' },
  failed: { label: 'Échec', className: 'badge-danger' },
  
  pending: { label: 'En attente', className: 'badge-warning' },
  starting: { label: 'Démarrage', className: 'badge-warning' },
  stopping: { label: 'Arrêt', className: 'badge-warning' },
  warning: { label: 'Attention', className: 'badge-warning' },
  
  inactive: { label: 'Inactif', className: 'badge-neutral' },
  unknown: { label: 'Inconnu', className: 'badge-neutral' },
  
  admin: { label: 'Admin', className: 'badge-info' },
  user: { label: 'User', className: 'badge-neutral' },
  readonly: { label: 'Lecture seule', className: 'badge-neutral' },
}

export default function StatusBadge({ status, customLabel }) {
  const config = statusConfig[status] || statusConfig.unknown
  
  return (
    <span className={clsx('badge', config.className)}>
      {customLabel || config.label}
    </span>
  )
}
