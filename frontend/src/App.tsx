import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'

// ─── Query Client ────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

// ─── Placeholder Pages ───────────────────────────────────────────────────────
function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex flex-col items-center justify-center px-4">
      {/* Hero */}
      <div className="text-center max-w-2xl">
        <div className="inline-flex items-center gap-2 bg-brand-100 text-brand-700 text-sm font-medium px-3 py-1 rounded-full mb-6">
          🚀 Phase 0 — Project Initialized
        </div>
        <h1 className="text-5xl font-bold text-gray-900 tracking-tight mb-4">
          Career<span className="text-brand-400">Pilot</span> AI
        </h1>
        <p className="text-xl text-gray-500 mb-8">
          Premium AI-powered career guidance for software engineering placements.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <span className="bg-white border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg shadow-sm">
            React 19 + Vite
          </span>
          <span className="bg-white border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg shadow-sm">
            Tailwind CSS v3
          </span>
          <span className="bg-white border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg shadow-sm">
            React Router v7
          </span>
          <span className="bg-white border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg shadow-sm">
            TanStack Query v5
          </span>
          <span className="bg-white border border-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg shadow-sm">
            TypeScript
          </span>
        </div>
      </div>

      {/* Status Cards */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        <StatusCard
          title="Frontend"
          status="ready"
          description="React + Vite + Tailwind"
        />
        <StatusCard
          title="Backend"
          status="pending"
          description="Express + Prisma"
        />
        <StatusCard
          title="AI Service"
          status="pending"
          description="FastAPI + Gemini"
        />
      </div>
    </div>
  )
}

interface StatusCardProps {
  title: string
  status: 'ready' | 'pending' | 'wip'
  description: string
}

function StatusCard({ title, status, description }: StatusCardProps) {
  const statusStyles = {
    ready: 'bg-green-50 border-green-200 text-green-700',
    pending: 'bg-gray-50 border-gray-200 text-gray-500',
    wip: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  }
  const statusLabel = {
    ready: '✅ Ready',
    pending: '⏳ Pending',
    wip: '🔧 In Progress',
  }

  return (
    <div className={`border rounded-xl p-4 ${statusStyles[status]}`}>
      <div className="font-semibold text-base">{title}</div>
      <div className="text-xs mt-1 opacity-70">{description}</div>
      <div className="text-xs mt-2 font-medium">{statusLabel[status]}</div>
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-6xl font-bold text-gray-200 mb-4">404</h1>
      <p className="text-gray-500 mb-6">Page not found.</p>
      <a href="/" className="text-brand-400 underline">
        Return home
      </a>
    </div>
  )
}

// ─── App Root ────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
