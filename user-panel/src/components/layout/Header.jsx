import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { User, LogOut, Key, ChevronDown, Eye, Bell } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import clsx from 'clsx'

export default function Header() {
  const { user, logout, isReadonly } = useAuth()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const getRoleBadge = () => {
    if (isReadonly) {
      return (
        <span className="badge badge-warning flex items-center gap-1">
          <Eye className="w-3 h-3" />
          Readonly
        </span>
      )
    }
    return <span className="badge badge-info">User</span>
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {isReadonly && (
          <div className="px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
            You are in readonly mode. Modifications are disabled.
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
            {user?.profile?.avatar ? (
              <img
                src={user.profile.avatar}
                alt={user.username}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-primary-600" />
            )}
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-sm font-medium text-gray-900">
              {user?.profile?.firstName || user?.username}
            </p>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
          <ChevronDown className={clsx(
            'w-4 h-4 text-gray-400 transition-transform',
            dropdownOpen && 'rotate-180'
          )} />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">{user?.username}</p>
              <div className="mt-1">{getRoleBadge()}</div>
            </div>

            <Link
              to="/profile"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <User className="w-4 h-4" />
              Profile
            </Link>

            <Link
              to="/notifications"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Bell className="w-4 h-4" />
              Notifications
            </Link>

            <Link
              to="/change-password"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Key className="w-4 h-4" />
              Change Password
            </Link>

            <div className="border-t border-gray-100 mt-2 pt-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
