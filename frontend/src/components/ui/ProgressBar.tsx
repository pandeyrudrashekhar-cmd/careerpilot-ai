import { cn } from '../../lib/utils'

interface ProgressBarProps {
  value: number
  max?: number
  color?: 'navy' | 'electric' | 'brand' | 'green' | 'amber' | 'red'
  size?: 'sm' | 'md'
  className?: string
  showLabel?: boolean
}

export function ProgressBar({ value, max = 100, color = 'navy', size = 'md', className, showLabel = false }: ProgressBarProps) {
  const pct = Math.round((value / max) * 100)
  const colors = {
    navy: 'bg-navy-700',
    electric: 'bg-electric-500',
    brand: 'bg-brand-400',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }
  const heights = { sm: 'h-1.5', md: 'h-2' }
  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{value}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div className={cn('w-full bg-gray-100 rounded-full overflow-hidden', heights[size])}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', colors[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
