import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Sparkles,
  FileCheck,
  BarChart3,
  Briefcase,
  Bot,
  Video,
  ListTodo,
  CheckCircle2,
  Compass,
  Cpu,
  Target
} from 'lucide-react'
import { LandingNav } from '../components/landing/LandingNav'
import { DashboardPreview } from '../components/landing/DashboardPreview'

export function LandingPage() {
  const valueProps = [
    {
      icon: Target,
      title: 'Targeted Strategy',
      desc: 'Precision guidance mapped directly against current hiring bars for software engineering internships and graduate roles.',
    },
    {
      icon: Cpu,
      title: 'Deep Resume Diagnostics',
      desc: 'Algorithmic parsing checks your technical keywords, quantified impact bullets, and ATS readability against elite standards.',
    },
    {
      icon: Compass,
      title: 'Actionable Career Roadmap',
      desc: 'Clear, prioritized milestones identify the exact missing skills between your current profile and your dream company.',
    },
  ]

  const features = [
    {
      icon: FileCheck,
      title: 'ATS Resume Scoring',
      desc: 'Get granular feedback on technical phrasing, readability, and recruiter signals before applying.',
    },
    {
      icon: BarChart3,
      title: 'Skill Gap Heatmaps',
      desc: 'Compare your stack against live job descriptions to know precisely what tools to learn next.',
    },
    {
      icon: Briefcase,
      title: 'Algorithmic Job Match',
      desc: 'Discover vetted software developer opportunities filtered by match probability and tech stack.',
    },
    {
      icon: Bot,
      title: 'Dedicated AI Copilot',
      desc: 'Get instant answers for resume tailoring, cover letters, and salary benchmark questions anytime.',
    },
    {
      icon: Video,
      title: 'Mock Interview Simulator',
      desc: 'Practice real technical and behavioral interview questions with structured, immediate critique.',
    },
    {
      icon: ListTodo,
      title: 'Unified Application Tracker',
      desc: 'Keep every stage organized from initial application to screening, interview, and final offer.',
    },
  ]

  const steps = [
    {
      step: '01',
      title: 'Upload Profile & Resume',
      desc: 'Our AI parses your technical experiences, projects, and coursework in seconds to build your digital candidate baseline.',
    },
    {
      step: '02',
      title: 'Discover Matches & Gaps',
      desc: 'Review your personalized match matrix across top employers and pinpoint exact skills to sharpen before interview day.',
    },
    {
      step: '03',
      title: 'Prepare & Land Offers',
      desc: 'Simulate high-stakes coding interviews, refine answers with the AI Copilot, and track applications smoothly to offer acceptance.',
    },
  ]

  return (
    <div className="min-h-screen bg-navy-950 text-white selection:bg-electric-500 selection:text-white">
      <LandingNav />

      {/* ── Hero Section ── */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
        {/* Glow & Grid backdrop */}
        <div className="absolute inset-0 bg-grid-white pointer-events-none opacity-40" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-electric-500/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 w-[350px] h-[250px] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-navy-900 border border-navy-700/80 text-electric-400 text-xs font-semibold mb-8 shadow-sm">
              <Sparkles size={14} className="text-electric-400" />
              <span>AI-Powered Career Co-Pilot for Aspiring Engineers</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-display font-extrabold tracking-tight leading-[1.08] text-balance mb-6">
              Launch your software career with{' '}
              <span className="bg-gradient-to-r from-white via-navy-100 to-electric-400 bg-clip-text text-transparent">
                intelligent precision
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-navy-200 max-w-2xl font-normal text-balance mb-10 leading-relaxed">
              From automated resume diagnostics and real-time skill gap analysis to high-yield job matching and technical interview rehearsal.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mb-16">
              <Link
                to="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-electric-500 hover:bg-electric-600 text-white font-semibold shadow-glow transition-all duration-150 group"
              >
                <span>Launch Your Dashboard</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#features"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-navy-900/80 hover:bg-navy-800 text-navy-200 hover:text-white border border-navy-700 font-semibold transition-all duration-150"
              >
                Explore Features
              </a>
            </div>

            {/* Mock Dashboard Preview */}
            <div className="w-full flex justify-center">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Value Props Section ── */}
      <section id="for-students" className="py-20 border-t border-navy-800/80 bg-navy-900/40 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs uppercase font-bold tracking-widest text-electric-400 mb-2">Designed For Developers</h2>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Built to overcome traditional job search noise</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {valueProps.map((item, idx) => {
              const Icon = item.icon
              return (
                <div
                  key={idx}
                  className="bg-navy-900/60 border border-navy-800 p-8 rounded-2xl relative group hover:border-navy-700 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-electric-500/10 border border-electric-500/20 text-electric-400 flex items-center justify-center mb-6">
                    <Icon size={22} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-navy-300 leading-relaxed">{item.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section id="features" className="py-24 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-electric-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs uppercase font-bold tracking-widest text-electric-400 mb-2">Comprehensive Suite</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
              Everything required to land your next technical role
            </p>
            <p className="text-navy-300 text-sm sm:text-base leading-relaxed">
              Every tool within CareerPilot AI is tuned specifically for technology hiring pipelines, evaluating code skills, resume keyword density, and technical interview benchmarks.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feat, idx) => {
              const Icon = feat.icon
              return (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-navy-900/50 border border-navy-800 hover:border-electric-500/40 hover:bg-navy-900/80 transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-xl bg-navy-800 text-electric-400 flex items-center justify-center mb-5">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2">{feat.title}</h3>
                  <p className="text-sm text-navy-300 leading-relaxed">{feat.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 border-t border-navy-800/80 bg-navy-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs uppercase font-bold tracking-widest text-electric-400 mb-2">Simple 3-Step Process</h2>
            <p className="text-3xl font-extrabold text-white tracking-tight">How CareerPilot accelerates your success</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {steps.map((st, idx) => (
              <div key={idx} className="relative bg-navy-900/40 border border-navy-800/80 p-8 rounded-2xl">
                <span className="text-3xl font-black text-electric-400/30 mb-4 block font-mono">{st.step}</span>
                <h3 className="text-lg font-bold text-white mb-2">{st.title}</h3>
                <p className="text-sm text-navy-300 leading-relaxed">{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-20 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl bg-gradient-to-b from-navy-900 to-navy-950 border border-navy-700/80 p-8 sm:p-14 text-center overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-electric-500/10 blur-2xl pointer-events-none" />
            <div className="relative z-10 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                Ready to accelerate your engineering career?
              </h2>
              <p className="text-sm sm:text-base text-navy-200 mb-8 leading-relaxed">
                Unlock instant resume scoring, skill-gap recommendations, and full interview simulation today.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/dashboard"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-electric-500 hover:bg-electric-600 text-white font-semibold shadow-glow transition-all"
                >
                  <span>Get Started for Free</span>
                  <ArrowRight size={16} />
                </Link>
                <div className="flex items-center gap-2 text-xs text-navy-400">
                  <CheckCircle2 size={15} className="text-green-400" />
                  <span>No credit card required</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-navy-900 py-12 bg-navy-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-electric-500 flex items-center justify-center text-white text-xs font-bold">
              CP
            </div>
            <span className="text-sm font-semibold text-white">CareerPilot AI</span>
            <span className="text-xs text-navy-500 ml-2">© 2026 CareerPilot Inc. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-navy-400">
            <Link to="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
            <Link to="/resume" className="hover:text-white transition-colors">Resume Analysis</Link>
            <Link to="/jobs" className="hover:text-white transition-colors">Job Matches</Link>
            <Link to="/copilot" className="hover:text-white transition-colors">AI Copilot</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
