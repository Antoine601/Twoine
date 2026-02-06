import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Bell, 
  User, 
  LogOut, 
  Settings, 
  ChevronDown,
  AlertTriangle,
  UserX
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import clsx from 'clsx'

export default function Header() {
  const { user, logout, isImpersonating, stopImpersonation } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const userMenuRef = useRef(null)
  const notificationsRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await logout()
  }

  const handleStopImpersonation = async () => {
    await stopImpersonation()
  }

  return (
    <header className="h-16 bg-admin-800 border-b border-admin-700 px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {isImpersonating && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-warning-900/50 border border-warning-700 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-warning-400" />
            <span className="text-sm text-warning-400">Mode impersonation</span>
            <button 
              onClick={handleStopImpersonation}
              className="ml-2 text-xs text-warning-300 hover:text-white underline"
            >
              Quitter
            </button>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-admin-400 hover:text-white hover:bg-admin-700 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-danger-500 rounded-full" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-admin-800 border border-admin-700 rounded-xl shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-admin-700">
                <h3 className="font-semibold text-white">Notifications</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <div className="px-4 py-8 text-center text-admin-500">
                  Aucune notification
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
              showUserMenu ? 'bg-admin-700' : 'hover:bg-admin-700'
            )}
          >
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-white">{user?.username}</p>
              <p className="text-xs text-admin-500">{user?.email}</p>
            </div>
            <ChevronDown className={clsx(
              'w-4 h-4 text-admin-400 transition-transform',
              showUserMenu && 'rotate-180'
            )} />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-admin-800 border border-admin-700 rounded-xl shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-admin-700">
                <p className="text-sm font-medium text-white">{user?.username}</p>
                <p className="text-xs text-admin-500">{user?.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-primary-900/50 text-primary-400 border border-primary-700 rounded-full">
                  Admin
                </span>
              </div>
              <div className="py-2">
                <Link
                  to="/profile"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-admin-300 hover:text-white hover:bg-admin-700 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Profil
                </Link>
                {isImpersonating && (
                  <button
                    onClick={handleStopImpersonation}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-warning-400 hover:text-warning-300 hover:bg-admin-700 transition-colors w-full"
                  >
                    <UserX className="w-4 h-4" />
                    Arrêter impersonation
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-danger-400 hover:text-danger-300 hover:bg-admin-700 transition-colors w-full"
                >
                  <LogOut className="w-4 h-4" />
                  Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
