import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  Globe, 
  Server, 
  FolderOpen, 
  Database, 
  Link2, 
  BarChart3, 
  Shield, 
  Settings,
  Hexagon
} from 'lucide-react'
import clsx from 'clsx'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Utilisateurs', href: '/users', icon: Users },
  { name: 'Sites', href: '/sites', icon: Globe },
  { name: 'Services', href: '/services', icon: Server },
  { name: 'Fichiers', href: '/files', icon: FolderOpen },
  { name: 'Bases de données', href: '/databases', icon: Database },
  { name: 'Domaines', href: '/domains', icon: Link2 },
  { name: 'Statistiques', href: '/stats', icon: BarChart3 },
  { name: 'Sécurité', href: '/security', icon: Shield },
  { name: 'Configuration', href: '/config', icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-admin-800 border-r border-admin-700 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-admin-700">
        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
          <Hexagon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Twoine</h1>
          <p className="text-xs text-admin-500">Admin Panel</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {navigation.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  clsx(
                    'sidebar-link',
                    isActive && 'active'
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-admin-700">
        <p className="text-xs text-admin-500 text-center">
          Twoine v1.0.0
        </p>
      </div>
    </aside>
  )
}
