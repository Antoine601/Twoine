import { Bell } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

export default function NotificationsPage() {
  const { user } = useAuth()
  const notifications = user?.notifications || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <p className="text-gray-500 mt-1">Messages envoyés par l’administration de la plateforme.</p>
      </div>

      <div className="card">
        <div className="card-body">
          {notifications.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune notification pour le moment.</p>
          ) : (
            <ul className="space-y-3">
              {notifications.map((notification) => (
                <li key={notification._id} className="p-4 rounded-lg border border-gray-100 bg-gray-50">
                  <div className="flex items-start gap-3">
                    <Bell className="w-4 h-4 text-primary-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-900">{notification.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {notification.sentAt ? format(new Date(notification.sentAt), 'dd/MM/yyyy HH:mm') : 'Date inconnue'}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
