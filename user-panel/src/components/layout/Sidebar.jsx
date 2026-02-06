import { NavLink, useParams } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Globe, 
  Server, 
  FolderOpen, 
  Database, 
  Link2, 
  BarChart3,
  ChevronLeft,
  Info,
  GraduationCap,
  Package,
  Bell
} from 'lucide-react'
import clsx from 'clsx'

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/sites', icon: Globe, label: 'My Sites' },
  { to: '/a-propos', icon: Info, label: 'À propos' },
  { to: '/formations', icon: GraduationCap, label: 'Formations' },
  { to: '/produits', icon: Package, label: 'Produits' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
]

const siteNavItems = [
  { to: '', icon: Globe, label: 'Overview', exact: true },
  { to: '/services', icon: Server, label: 'Services' },
  { to: '/files', icon: FolderOpen, label: 'Files' },
  { to: '/databases', icon: Database, label: 'Databases' },
  { to: '/domains', icon: Link2, label: 'Domains' },
  { to: '/stats', icon: BarChart3, label: 'Statistics' },
]

function NavItem({ to, icon: Icon, label, exact = false }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary-50 text-primary-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )
      }
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  const { siteId } = useParams()

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <span className="font-semibold text-gray-900">Twoine</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin">
        {siteId ? (
          <>
            {/* Back to sites */}
            <NavLink
              to="/sites"
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Sites</span>
            </NavLink>

            {/* Site navigation */}
            <div className="space-y-1">
              {siteNavItems.map((item) => (
                <NavItem
                  key={item.to}
                  to={`/sites/${siteId}${item.to}`}
                  icon={item.icon}
                  label={item.label}
                  exact={item.exact}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Main navigation */}
            {mainNavItems.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                exact={item.exact}
              />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Twoine User Panel v1.0
        </p>
      </div>
    </aside>
  )
}
