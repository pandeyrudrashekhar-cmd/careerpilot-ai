import { FileText, Briefcase, TrendingUp, MessageSquare } from 'lucide-react'

export function DashboardPreview() {
  return (
    <div className="relative w-full max-w-2xl">
      {/* Glow */}
      <div className="absolute -inset-4 bg-electric-500/10 rounded-3xl blur-2xl" />
      {/* Mock window chrome */}
      <div className="relative bg-gray-900 rounded-2xl border border-navy-700/60 shadow-2xl overflow-hidden">
        {/* Window bar */}
        <div className="flex items-center gap-1.5 px-4 py-3 bg-gray-800/80 border-b border-gray-700/60">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
          <div className="ml-3 text-xs text-gray-500 font-mono">careerpilot.ai/dashboard</div>
        </div>
        {/* Mock dashboard interior */}
        <div className="flex h-72">
          {/* Mini sidebar */}
          <div className="w-12 bg-navy-950 border-r border-navy-800/60 flex flex-col items-center py-4 gap-4">
            {[FileText, Briefcase, TrendingUp, MessageSquare].map((Icon, i) => (
              <div key={i} className={`p-2 rounded-lg ${i === 0 ? 'bg-electric-500/20 text-electric-400' : 'text-navy-600'}`}>
                <Icon size={14} />
              </div>
            ))}
          </div>
          {/* Content */}
          <div className="flex-1 p-4 bg-gray-950 overflow-hidden">
            <div className="text-xs text-gray-500 mb-3">Your career workspace</div>
            {/* Stat row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Resume Score', value: '82', color: 'text-green-400' },
                { label: 'Job Matches', value: '24', color: 'text-electric-400' },
                { label: 'Applications', value: '4', color: 'text-brand-400' },
              ].map((s, i) => (
                <div key={i} className="bg-gray-800/60 rounded-lg p-2">
                  <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[9px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
            {/* Progress bars */}
            <div className="space-y-2">
              {[
                { skill: 'React', pct: 85, color: 'bg-electric-500' },
                { skill: 'TypeScript', pct: 78, color: 'bg-brand-400' },
                { skill: 'System Design', pct: 42, color: 'bg-amber-500' },
              ].map((s, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
                    <span>{s.skill}</span><span>{s.pct}%</span>
                  </div>
                  <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
