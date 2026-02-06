import { Inbox } from 'lucide-react'
import clsx from 'clsx'

export default function EmptyState({ 
  icon: Icon = Inbox, 
  title, 
  description, 
  action,
  className 
}) {
  return (
    <div className={clsx('text-center py-12', className)}>
      <div className="w-16 h-16 bg-admin-700 rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon className="w-8 h-8 text-admin-400" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      {description && (
        <p className="text-admin-400 max-w-md mx-auto mb-6">{description}</p>
      )}
      {action}
    </div>
  )
}
