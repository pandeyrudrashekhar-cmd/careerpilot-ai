import { Link } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import { Button } from '../components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center text-center px-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-electric-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-md mx-auto space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-navy-900 border border-navy-800 text-electric-400 flex items-center justify-center mx-auto shadow-glow">
          <Compass size={32} />
        </div>

        <div>
          <span className="text-6xl font-black text-navy-600 block mb-2 font-mono">404</span>
          <h1 className="text-2xl font-bold text-white tracking-tight">Destination Not Found</h1>
          <p className="text-sm text-navy-300 mt-2">
            The page you are looking for has been moved or does not exist in our route index.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link to="/dashboard" className="w-full sm:w-auto">
            <Button variant="secondary" size="md" className="w-full">
              Go to Dashboard
            </Button>
          </Link>
          <Link to="/" className="w-full sm:w-auto">
            <Button variant="outline" size="md" className="w-full bg-navy-900 text-navy-200 border-navy-700 hover:bg-navy-800 hover:text-white">
              <ArrowLeft size={16} className="mr-1.5" /> Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
