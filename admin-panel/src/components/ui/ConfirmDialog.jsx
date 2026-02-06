import { AlertTriangle, Info, CheckCircle } from 'lucide-react'
import Modal from './Modal'
import clsx from 'clsx'

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  variant = 'danger',
  loading = false,
}) {
  const variants = {
    danger: {
      icon: AlertTriangle,
      iconColor: 'text-danger-500',
      iconBg: 'bg-danger-900/50',
      buttonClass: 'btn-danger',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-warning-500',
      iconBg: 'bg-warning-900/50',
      buttonClass: 'btn-warning',
    },
    info: {
      icon: Info,
      iconColor: 'text-primary-500',
      iconBg: 'bg-primary-900/50',
      buttonClass: 'btn-primary',
    },
    success: {
      icon: CheckCircle,
      iconColor: 'text-accent-500',
      iconBg: 'bg-accent-900/50',
      buttonClass: 'btn-success',
    },
  }

  const config = variants[variant]
  const Icon = config.icon

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="text-center">
        <div className={clsx(
          'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4',
          config.iconBg
        )}>
          <Icon className={clsx('w-8 h-8', config.iconColor)} />
        </div>
        <p className="text-admin-300 mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn btn-secondary"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={clsx('btn', config.buttonClass)}
          >
            {loading ? 'Chargement...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
