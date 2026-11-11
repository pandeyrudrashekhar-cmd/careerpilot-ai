import { cn } from '../../lib/utils'
import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  icon: ReactNode
  iconColor?: string
  className?: string
}

export function StatCard({ label, value, change, trend = 'neutral', icon, iconColor = 'bg-navy-50', className }: StatCardProps) {
  const trendColors = { up: 'text-green-600', down: 'text-red-600', neutral: 'text-gray-500' }
  const trendPrefix = { up: '↑', down: '↓', neutral: '' }
  return (
    <div className={cn('bg-white rounded-2xl border border-gray-100 shadow-card p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change && (
            <p className={cn('text-xs mt-1 font-medium', trendColors[trend])}>
              {trendPrefix[trend]} {change}
            </p>
          )}
        </div>
        <div className={cn('p-2.5 rounded-xl', iconColor)}>
          {icon}
        </div>
      </div>
    </div>
  )
}
