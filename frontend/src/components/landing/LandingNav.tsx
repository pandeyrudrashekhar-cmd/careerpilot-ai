import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X, Zap } from 'lucide-react'
import { cn } from '../../lib/utils'

const links = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'For students', href: '#for-students' },
]

export function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={cn(
      'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
      scrolled ? 'bg-navy-950/95 backdrop-blur-md border-b border-navy-800/60 shadow-lg' : 'bg-transparent'
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-electric-500 flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">
              Career<span className="text-electric-400">Pilot</span> AI
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
            {links.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-navy-300 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-navy-300 hover:text-white transition-colors px-4 py-2"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold bg-electric-500 text-white px-4 py-2 rounded-xl hover:bg-electric-600 transition-colors shadow-sm"
            >
              Get started
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden text-white p-2"
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-navy-950/98 backdrop-blur-md border-t border-navy-800/60">
          <div className="px-4 py-4 space-y-1">
            {links.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block py-2.5 text-sm font-medium text-navy-300 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 flex flex-col gap-2 border-t border-navy-800 mt-3">
              <Link to="/login" onClick={() => setMobileOpen(false)} className="py-2.5 text-center text-sm font-medium text-navy-300">Sign in</Link>
              <Link to="/signup" onClick={() => setMobileOpen(false)} className="py-2.5 text-center text-sm font-semibold bg-electric-500 text-white rounded-xl">Get started free</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
