import { cn } from '../../lib/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', children, loading, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none'
  const variants = {
    primary: 'bg-navy-700 text-white hover:bg-navy-800 focus-visible:ring-navy-700 shadow-sm',
    secondary: 'bg-electric-500 text-white hover:bg-electric-600 focus-visible:ring-electric-500 shadow-sm',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus-visible:ring-gray-400',
    outline: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-400 shadow-sm',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 shadow-sm',
  }
  const sizes = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  }
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : null}
      {children}
    </button>
  )
}
