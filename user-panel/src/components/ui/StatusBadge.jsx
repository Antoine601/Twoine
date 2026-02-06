import clsx from 'clsx'
import { CheckCircle, XCircle, Clock, AlertTriangle, Circle } from 'lucide-react'

const statusConfig = {
  running: {
    label: 'Running',
    className: 'badge-success',
    icon: CheckCircle,
  },
  active: {
    label: 'Active',
    className: 'badge-success',
    icon: CheckCircle,
  },
  stopped: {
    label: 'Stopped',
    className: 'badge-gray',
    icon: Circle,
  },
  failed: {
    label: 'Failed',
    className: 'badge-danger',
    icon: XCircle,
  },
  error: {
    label: 'Error',
    className: 'badge-danger',
    icon: XCircle,
  },
  pending: {
    label: 'Pending',
    className: 'badge-warning',
    icon: Clock,
  },
  creating: {
    label: 'Creating',
    className: 'badge-info',
    icon: Clock,
  },
  warning: {
    label: 'Warning',
    className: 'badge-warning',
    icon: AlertTriangle,
  },
  unknown: {
    label: 'Unknown',
    className: 'badge-gray',
    icon: Circle,
  },
}

export default function StatusBadge({ status, showIcon = true, className = '' }) {
  const config = statusConfig[status] || statusConfig.unknown
  const Icon = config.icon

  return (
    <span className={clsx('badge', config.className, className)}>
      {showIcon && <Icon className="w-3 h-3 mr-1" />}
      {config.label}
    </span>
  )
}
