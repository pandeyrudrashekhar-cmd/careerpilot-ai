import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, CheckCircle2, Play, Plus, Sparkles, Video } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { apiRequest } from '../lib/api'
import { useResumes } from '../hooks/useResumes'

type InterviewType = 'TECHNICAL' | 'BEHAVIORAL' | 'SYSTEM_DESIGN' | 'HR' | 'MIXED' | 'OTHER'
type InterviewStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'

interface InterviewSession {
  id: string
  targetRole: string
  type: InterviewType
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  status: InterviewStatus
  createdAt: string
  _count?: { questions: number }
}

interface InterviewQuestion {
  id: string
  order: number
  prompt: string
  type: string
  answer: { id: string; answeredAt: string } | null
}

interface InterviewFeedback {
  questions: Array<{
    id: string
    order: number
    prompt: string
    answer: {
      content: string
      score: number | null
      evaluation: unknown
    } | null
  }>
}

interface InterviewList {
  sessions: InterviewSession[]
}

type CreatedInterview = InterviewSession

const interviewTypes: InterviewType[] = ['TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'HR', 'MIXED', 'OTHER']
const interviewDifficulties: InterviewSession['difficulty'][] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']

function isEvaluation(value: unknown): value is {
  overallScore: number
  strengths: string[]
  areasForImprovement: string[]
  suggestedImprovedAnswer: string
} {
  if (typeof value !== 'object' || value === null) return false
  const evaluation = value as Record<string, unknown>
  return typeof evaluation.overallScore === 'number'
    && Array.isArray(evaluation.strengths)
    && evaluation.strengths.every((item) => typeof item === 'string')
    && Array.isArray(evaluation.areasForImprovement)
    && evaluation.areasForImprovement.every((item) => typeof item === 'string')
    && typeof evaluation.suggestedImprovedAnswer === 'string'
}

export function InterviewPage() {
  const { session, user } = useAuth()
  const { resumes } = useResumes()
  const queryClient = useQueryClient()
  const [targetRole, setTargetRole] = useState('')
  const [type, setType] = useState<InterviewType>('TECHNICAL')
  const [difficulty, setDifficulty] = useState<InterviewSession['difficulty']>('INTERMEDIATE')
  const [selectedId, setSelectedId] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [manualPrompt, setManualPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const sessionsQuery = useQuery({
    queryKey: ['interviews', user?.id ?? ''],
    queryFn: () => apiRequest<InterviewList>('/interviews?page=1&pageSize=50', session!.access_token),
    enabled: Boolean(session && user),
  })
  const questionsQuery = useQuery({
    queryKey: ['interview-questions', user?.id ?? '', selectedId],
    queryFn: () => apiRequest<InterviewQuestion[]>(`/interviews/${encodeURIComponent(selectedId)}/questions`, session!.access_token),
    enabled: Boolean(session && user && selectedId),
  })
  const feedbackQuery = useQuery({
    queryKey: ['interview-feedback', user?.id ?? '', selectedId],
    queryFn: () => apiRequest<InterviewFeedback>(`/interviews/${encodeURIComponent(selectedId)}/feedback`, session!.access_token),
    enabled: Boolean(session && user && selectedId),
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['interviews', user?.id ?? ''] })
    void queryClient.invalidateQueries({ queryKey: ['interview-questions', user?.id ?? '', selectedId] })
    void queryClient.invalidateQueries({ queryKey: ['interview-feedback', user?.id ?? '', selectedId] })
  }
  const createMutation = useMutation({
    mutationFn: (input: { targetRole: string; type: InterviewType; difficulty: InterviewSession['difficulty']; resumeId?: string }) =>
      apiRequest<CreatedInterview>('/interviews', session!.access_token, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (created) => {
      setError(null)
      setSelectedId(created.id)
      void queryClient.invalidateQueries({ queryKey: ['interviews', user?.id ?? ''] })
    },
    onError: (cause: Error) => setError(cause.message),
  })
  const generateMutation = useMutation({
    mutationFn: () => apiRequest(`/interviews/${encodeURIComponent(selectedId)}/questions`, session!.access_token, {
      method: 'POST',
      body: JSON.stringify({ count: 5 }),
    }),
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (cause: Error) => setError(cause.message),
  })
  const manualQuestionMutation = useMutation({
    mutationFn: (prompt: string) => apiRequest(`/interviews/${encodeURIComponent(selectedId)}/questions/manual`, session!.access_token, {
      method: 'POST',
      body: JSON.stringify({ prompt, type: 'OTHER' }),
    }),
    onSuccess: () => {
      setManualPrompt('')
      setError(null)
      refresh()
    },
    onError: (cause: Error) => setError(cause.message),
  })
  const answerMutation = useMutation({
    mutationFn: ({ questionId, content }: { questionId: string; content: string }) =>
      apiRequest(`/interviews/${encodeURIComponent(selectedId)}/answers`, session!.access_token, {
        method: 'POST',
        body: JSON.stringify({ questionId, content }),
      }),
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (cause: Error) => setError(cause.message),
  })
  const evaluateMutation = useMutation({
    mutationFn: (questionId: string) => apiRequest(
      `/interviews/${encodeURIComponent(selectedId)}/answers/${encodeURIComponent(questionId)}/evaluate`,
      session!.access_token,
      { method: 'POST' },
    ),
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (cause: Error) => setError(cause.message),
  })
  const completeMutation = useMutation({
    mutationFn: () => apiRequest(`/interviews/${encodeURIComponent(selectedId)}/complete`, session!.access_token, {
      method: 'POST',
    }),
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (cause: Error) => setError(cause.message),
  })

  function createSession(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const activeResume = resumes.find((resume) => resume.isActive)
    createMutation.mutate({
      targetRole: targetRole.trim(),
      type,
      difficulty,
      ...(activeResume ? { resumeId: activeResume.id } : {}),
    })
  }

  const sessions = sessionsQuery.data?.sessions ?? []
  const selectedSession = sessions.find((item) => item.id === selectedId)
  const feedbackByQuestionId = new Map((feedbackQuery.data?.questions ?? []).map((item) => [item.id, item]))
  const activeError = error
    ?? (sessionsQuery.error instanceof Error ? sessionsQuery.error.message : null)
    ?? (questionsQuery.error instanceof Error ? questionsQuery.error.message : null)
    ?? (feedbackQuery.error instanceof Error ? feedbackQuery.error.message : null)

  return (
    <DashboardLayout>
      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Interview Preparation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create persisted practice sessions, generate questions with the configured AI provider, and review saved answer feedback.
          </p>
        </div>

        <Card padding="lg">
          <form onSubmit={createSession} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <label className="text-sm font-medium text-gray-700">
              Target role
              <input
                required
                maxLength={200}
                value={targetRole}
                onChange={(event) => setTargetRole(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2"
                placeholder="e.g. Backend Engineer"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Interview type
              <select value={type} onChange={(event) => {
                const nextType = interviewTypes.find((value) => value === event.target.value)
                if (nextType) setType(nextType)
              }} className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2">
                <option value="TECHNICAL">Technical</option>
                <option value="BEHAVIORAL">Behavioral</option>
                <option value="SYSTEM_DESIGN">System design</option>
                <option value="MIXED">Mixed</option>
                <option value="HR">HR</option>
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Difficulty
              <select value={difficulty} onChange={(event) => {
                const nextDifficulty = interviewDifficulties.find((value) => value === event.target.value)
                if (nextDifficulty) setDifficulty(nextDifficulty)
              }} className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2">
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </select>
            </label>
            <Button type="submit" variant="primary" size="sm" loading={createMutation.isPending}>
              <Plus size={15} /> Create session
            </Button>
          </form>
          <p className="mt-2 text-xs text-gray-500">
            {resumes.some((resume) => resume.isActive)
              ? 'The active resume will be used as optional interview context.'
              : 'No active resume selected; the session will use role context only.'}
          </p>
        </Card>

        {activeError && <p role="alert" className="text-sm text-red-700">{activeError}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Award size={17} /> Your sessions</h2>
            {sessionsQuery.isPending ? (
              <p role="status" className="text-sm text-gray-500">Loading sessions...</p>
            ) : sessions.length === 0 ? (
              <EmptyState icon={<Video size={26} />} title="No practice sessions" description="Create a session to begin interview practice." />
            ) : sessions.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-2xl border p-4 text-left ${selectedId === item.id ? 'border-navy-700 bg-navy-50' : 'border-gray-100 bg-white'}`}
              >
                <span className="block text-sm font-bold text-gray-900">{item.targetRole}</span>
                <span className="mt-1 block text-xs text-gray-500">{item.type.replaceAll('_', ' ')} · {item.difficulty.toLowerCase()}</span>
                <span className="mt-2 block"><Badge variant={item.status === 'COMPLETED' ? 'success' : 'default'}>{item.status.replaceAll('_', ' ')}</Badge></span>
              </button>
            ))}
          </section>

          <section className="space-y-4">
            {!selectedSession ? (
              <EmptyState icon={<Sparkles size={26} />} title="Select a session" description="Choose a session to generate questions, submit answers, and review feedback." />
            ) : (
              <>
                <Card padding="lg">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">{selectedSession.targetRole}</h2>
                      <p className="text-xs text-gray-500">{selectedSession.type.replaceAll('_', ' ')} · {selectedSession.difficulty.toLowerCase()}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={selectedSession.status !== 'IN_PROGRESS'}
                        loading={generateMutation.isPending}
                        onClick={() => { setError(null); generateMutation.mutate() }}
                      >
                        <Sparkles size={14} /> Generate 5 questions
                      </Button>
                      {selectedSession.status === 'IN_PROGRESS' && (
                        <Button variant="outline" size="sm" loading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
                          Complete session
                        </Button>
                      )}
                    </div>
                  </div>
                  {selectedSession.status === 'IN_PROGRESS' && (
                    <form
                      className="mt-4 flex flex-col sm:flex-row gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (manualPrompt.trim()) manualQuestionMutation.mutate(manualPrompt.trim())
                      }}
                    >
                      <input
                        aria-label="Manual interview question"
                        minLength={5}
                        maxLength={5000}
                        value={manualPrompt}
                        onChange={(event) => setManualPrompt(event.target.value)}
                        placeholder="Or add your own question"
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      />
                      <Button type="submit" variant="outline" size="sm" loading={manualQuestionMutation.isPending}>
                        Add manual question
                      </Button>
                    </form>
                  )}
                </Card>

                {questionsQuery.isPending ? (
                  <p role="status" className="text-sm text-gray-500">Loading questions...</p>
                ) : (questionsQuery.data ?? []).length === 0 ? (
                  <EmptyState icon={<Play size={26} />} title="No questions yet" description="Generate questions with AI or add your own. Provider errors are shown directly; no demo questions are substituted." />
                ) : (questionsQuery.data ?? []).map((question) => {
                  const feedback = feedbackByQuestionId.get(question.id)
                  const evaluation = isEvaluation(feedback?.answer?.evaluation) ? feedback.answer.evaluation : null
                  return (
                    <Card key={question.id} padding="lg" className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-bold text-gray-900">{question.order}. {question.prompt}</h3>
                        <Badge variant="outline">{question.type.replaceAll('_', ' ')}</Badge>
                      </div>
                      {selectedSession.status === 'IN_PROGRESS' && (
                        <>
                          <textarea
                            aria-label={`Answer question ${question.order}`}
                            rows={4}
                            maxLength={20_000}
                            value={answers[question.id] ?? feedback?.answer?.content ?? ''}
                            onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Write your answer..."
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!(answers[question.id] ?? feedback?.answer?.content ?? '').trim()}
                              loading={answerMutation.isPending}
                              onClick={() => answerMutation.mutate({
                                questionId: question.id,
                                content: (answers[question.id] ?? feedback?.answer?.content ?? '').trim(),
                              })}
                            >
                              Save answer
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!feedback?.answer?.content}
                              loading={evaluateMutation.isPending && evaluateMutation.variables === question.id}
                              onClick={() => evaluateMutation.mutate(question.id)}
                            >
                              Evaluate answer
                            </Button>
                          </div>
                        </>
                      )}
                      {evaluation && (
                        <div className="space-y-2 border-t border-gray-100 pt-3 text-sm">
                          <Badge variant="success"><CheckCircle2 size={12} /> Score {evaluation.overallScore}/100</Badge>
                          <p><strong>Strengths:</strong> {evaluation.strengths.join('; ') || 'None recorded'}</p>
                          <p><strong>Areas to improve:</strong> {evaluation.areasForImprovement.join('; ') || 'None recorded'}</p>
                          <p><strong>Suggested answer:</strong> {evaluation.suggestedImprovedAnswer}</p>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  )
}
