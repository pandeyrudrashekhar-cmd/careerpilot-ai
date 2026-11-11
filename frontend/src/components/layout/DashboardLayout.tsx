import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Briefcase, BarChart2,
  ClipboardList, MessageSquare, BookOpen, Settings,
  ChevronLeft, ChevronRight, Bell, Search,
  ChevronDown, LogOut, User, Menu, X, Zap
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../auth/AuthContext'
import { getUserDisplayName } from '../../auth/user'

const navItems = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Resume', href: '/resume', icon: FileText },
  { label: 'Explore Jobs', href: '/jobs', icon: Briefcase },
  { label: 'Skill Gap', href: '/skill-gap', icon: BarChart2 },
  { label: 'Applications', href: '/applications', icon: ClipboardList },
  { label: 'AI Copilot', href: '/copilot', icon: MessageSquare, badge: 'AI' },
  { label: 'Interview Prep', href: '/interview', icon: BookOpen },
  { label: 'Settings', href: '/settings', icon: Settings },
]

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const currentPage = navItems.find(item => item.href === location.pathname)?.label ?? 'Dashboard'
  const displayName = user ? getUserDisplayName(user) : 'Account'
  const email = user?.email ?? ''

  async function handleSignOut() {
    setLogoutError(null)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to sign out.')
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          'fixed lg:relative inset-y-0 left-0 z-50 flex flex-col bg-navy-900 transition-all duration-300',
          collapsed ? 'w-16' : 'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-navy-800 min-h-[65px]">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-electric-500 flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            {!collapsed && (
              <span className="text-white font-bold text-base tracking-tight">
                Career<span className="text-electric-400">Pilot</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              className="ml-auto text-navy-400 hover:text-white transition-colors lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto scrollbar-hide">
          <ul className="space-y-0.5 px-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = location.pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative',
                      active
                        ? 'bg-electric-500/10 text-electric-400'
                        : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                    {!collapsed && item.badge && (
                      <span className="text-[10px] font-bold bg-electric-500 text-white px-1.5 py-0.5 rounded-md">
                        {item.badge}
                      </span>
                    )}
                    {collapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-navy-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                        {item.label}
                      </div>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Collapse toggle — desktop only */}
        <div className="hidden lg:flex px-3 pb-4">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-2 w-full px-3 py-2 text-navy-400 hover:text-white hover:bg-navy-800 rounded-xl text-sm font-medium transition-all"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-4 px-6 py-4 bg-white border-b border-gray-100 shadow-sm h-16 flex-shrink-0">
          {/* Mobile menu btn */}
          <button
            className="lg:hidden text-gray-500 hover:text-gray-900 p-1"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          {/* Page title */}
          <h1 className="text-base font-semibold text-gray-900 truncate">{currentPage}</h1>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <div className="hidden md:flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 w-56 focus-within:ring-2 focus-within:ring-navy-700/20 focus-within:border-navy-300 transition-all">
            <Search size={15} className="text-gray-400 flex-shrink-0" />
            <input
              type="search"
              placeholder="Search..."
              className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full"
              aria-label="Search"
            />
          </div>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen(o => !o); setProfileOpen(false) }}
              className="relative p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-electric-500 rounded-full" />
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                </div>
                {[
                  { text: 'Google interview scheduled for Nov 8', time: '2h ago', unread: true },
                  { text: 'New job match: Stripe Backend Engineer', time: '1d ago', unread: true },
                  { text: 'Resume score improved to 82', time: '2d ago', unread: false },
                ].map((n, i) => (
                  <div key={i} className={cn('px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50', n.unread && 'bg-blue-50/30')}>
                    <p className="text-sm text-gray-700">{n.text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{n.time}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Profile */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => { setProfileOpen(o => !o); setNotifOpen(false) }}
              className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Profile menu"
            >
              <div className="w-8 h-8 rounded-xl bg-navy-700 flex items-center justify-center text-white text-sm font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-xs font-semibold text-gray-900 leading-none">{displayName}</span>
                <span className="text-[10px] text-gray-500 leading-none mt-0.5">{email}</span>
              </div>
              <ChevronDown size={14} className="text-gray-400 hidden sm:block" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                  <p className="text-xs text-gray-500">{email}</p>
                </div>
                {logoutError && <p role="alert" className="px-4 py-2 text-xs text-red-600">{logoutError}</p>}
                <div className="py-1">
                  <Link to="/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                    <User size={14} /> Profile
                  </Link>
                  <button onClick={() => void handleSignOut()} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
