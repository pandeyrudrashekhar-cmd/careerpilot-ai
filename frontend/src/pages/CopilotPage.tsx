import { useEffect, useState } from 'react'
import {
  Bot,
  Lightbulb,
  Plus,
  RefreshCw,
  Send,
  User,
} from 'lucide-react'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../auth/AuthContext'
import { getUserDisplayName } from '../auth/user'
import { apiRequest } from '../lib/api'

interface Conversation {
  id: string
  title: string | null
  status: 'ACTIVE' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
}

interface ConversationListResponse {
  conversations: Conversation[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

interface SourceReference {
  id: string
  sourceType: string
  sourceId: string
  title: string
  chunkIndex: number
  similarity?: number | null
  contextExpanded?: boolean
}

interface StoredMessage {
  id: string
  role: 'USER' | 'ASSISTANT'
  content: string
  createdAt: string
  provider?: string | null
  model?: string | null
  metadata?: unknown
}

interface ConversationDetails extends Conversation {
  messages: StoredMessage[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sources: SourceReference[]
}

interface KnowledgeStatus {
  sourceCount: number
  chunkCount: number
}

interface SendMessageResponse {
  userMessage: StoredMessage
  assistantMessage: StoredMessage
  sources: SourceReference[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSourceReference(value: unknown): value is SourceReference {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.sourceType === 'string'
    && typeof value.sourceId === 'string'
    && typeof value.title === 'string'
    && typeof value.chunkIndex === 'number'
    && (value.similarity === undefined || value.similarity === null || typeof value.similarity === 'number')
    && (value.contextExpanded === undefined || typeof value.contextExpanded === 'boolean')
}

function readMessageSources(metadata: unknown): SourceReference[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.sources)) return []
  return metadata.sources.filter(isSourceReference)
}

function toChatMessage(message: StoredMessage, sources = readMessageSources(message.metadata)): ChatMessage {
  return {
    id: message.id,
    role: message.role === 'USER' ? 'user' : 'assistant',
    content: message.content,
    timestamp: new Date(message.createdAt).toLocaleString(),
    sources,
  }
}

function CopilotWorkspace({ accessToken, displayName }: { accessToken: string; displayName: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null)
  const [knowledgeStatus, setKnowledgeStatus] = useState<KnowledgeStatus | null>(null)
  const [input, setInput] = useState('')
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [knowledgeSuccess, setKnowledgeSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoadingConversations(true)
    setError(null)
    void apiRequest<ConversationListResponse>(
      '/copilot/conversations?page=1&pageSize=50&status=ACTIVE',
      accessToken,
      { signal: controller.signal },
    ).then((result) => {
      setConversations(result.conversations)
      setSelectedConversationId(result.conversations[0]?.id ?? null)
    }).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load your conversations.')
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingConversations(false)
    })

    return () => controller.abort()
  }, [accessToken])

  useEffect(() => {
    const controller = new AbortController()
    if (!selectedConversationId) {
      setMessages([])
      setLoadedConversationId(null)
      setLoadingMessages(false)
      return () => controller.abort()
    }

    setError(null)
    setLoadedConversationId(null)
    setLoadingMessages(true)
    void apiRequest<ConversationDetails>(
      `/copilot/conversations/${encodeURIComponent(selectedConversationId)}`,
      accessToken,
      { signal: controller.signal },
    ).then((conversation) => {
      setMessages(conversation.messages.map((message) => toChatMessage(message)))
      setLoadedConversationId(conversation.id)
    }).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load this conversation.')
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingMessages(false)
    })

    return () => controller.abort()
  }, [accessToken, selectedConversationId])

  useEffect(() => {
    const controller = new AbortController()
    void apiRequest<KnowledgeStatus>('/knowledge/status', accessToken, {
      signal: controller.signal,
    }).then(setKnowledgeStatus).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setKnowledgeError(requestError instanceof Error ? requestError.message : 'Unable to check indexed career data.')
      }
    })
    return () => controller.abort()
  }, [accessToken])

  async function handleNewConversation() {
    setCreatingConversation(true)
    setError(null)
    try {
      const conversation = await apiRequest<Conversation>('/copilot/conversations', accessToken, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
      setSelectedConversationId(conversation.id)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to start a new conversation.')
    } finally {
      setCreatingConversation(false)
    }
  }

  async function handleSyncKnowledge() {
    setSyncing(true)
    setKnowledgeError(null)
    setKnowledgeSuccess(null)
    try {
      const status = await apiRequest<KnowledgeStatus>('/knowledge/reindex', accessToken, {
        method: 'POST',
      })
      setKnowledgeStatus(status)
      setKnowledgeSuccess(
        `Personal data synced: ${status.sourceCount} sources and ${status.chunkCount} searchable sections.`,
      )
    } catch (requestError) {
      setKnowledgeError(requestError instanceof Error ? requestError.message : 'Unable to sync your career data.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSend(textToSend = input) {
    const content = textToSend.trim()
    const conversationId = selectedConversationId
    if (!content || !conversationId || loadedConversationId !== conversationId || sending) return

    const optimisticId = `pending-${Date.now()}`
    setInput('')
    setError(null)
    setSending(true)
    setMessages((current) => [...current, {
      id: optimisticId,
      role: 'user',
      content,
      timestamp: 'Just now',
      sources: [],
    }])

    try {
      const result = await apiRequest<SendMessageResponse>(
        `/copilot/conversations/${encodeURIComponent(conversationId)}/messages`,
        accessToken,
        { method: 'POST', body: JSON.stringify({ content }) },
      )
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticId),
        toChatMessage(result.userMessage),
        toChatMessage(result.assistantMessage, result.sources),
      ])
      setConversations((current) => current.map((conversation) => (
        conversation.id === conversationId
          ? {
            ...conversation,
            title: conversation.title ?? content.slice(0, 240),
            updatedAt: result.assistantMessage.createdAt,
          }
          : conversation
      )))
    } catch (requestError) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId))
      const sendError = requestError instanceof Error
        ? requestError.message
        : 'Unable to get a Copilot response.'
      setError(sendError)
      try {
        const conversation = await apiRequest<ConversationDetails>(
          `/copilot/conversations/${encodeURIComponent(conversationId)}`,
          accessToken,
        )
        setMessages(conversation.messages.map((message) => toChatMessage(message)))
      } catch (historyError) {
        const historyMessage = historyError instanceof Error
          ? historyError.message
          : 'Unable to refresh conversation history.'
        setError(`${sendError} ${historyMessage}`)
      }
    } finally {
      setSending(false)
    }
  }

  const currentConversation = conversations.find((conversation) => conversation.id === selectedConversationId)
  const visibleMessages = loadedConversationId === selectedConversationId ? messages : []
  const canSend = Boolean(selectedConversationId)
    && loadedConversationId === selectedConversationId
    && !loadingMessages
    && !sending

  const quickPrompts = [
    'How can I highlight impact in my experience?',
    'What skills should I emphasize for my target role?',
    'Help me prepare examples for a behavioral interview.',
    'How can I strengthen my resume summary?',
  ]

  return (
    <DashboardLayout>
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-5xl flex-col space-y-4 p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-3 border-b border-gray-100 pb-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-gray-900">AI Career Copilot</h1>
              <Badge variant="info">RAG-powered</Badge>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              Career guidance grounded in your indexed profile, resume, skills, and activity.
            </p>
            {currentConversation && (
              <p className="mt-1 truncate text-xs text-gray-400">
                {currentConversation.title ?? 'New conversation'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="copilot-conversation">Conversation history</label>
            <select
              id="copilot-conversation"
              aria-label="Conversation history"
              value={selectedConversationId ?? ''}
              onChange={(event) => setSelectedConversationId(event.target.value || null)}
              disabled={loadingConversations || sending}
              className="max-w-48 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
            >
              <option value="">Select a conversation</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title ?? 'New conversation'}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleNewConversation()}
              loading={creatingConversation}
              disabled={sending}
            >
              <Plus size={14} /> New
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleSyncKnowledge()}
              loading={syncing}
              aria-label="Sync personal data"
            >
              <RefreshCw size={13} /> Sync personal data
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs text-gray-500 shadow-sm">
          <span>
            {knowledgeStatus
              ? `${knowledgeStatus.sourceCount} sources · ${knowledgeStatus.chunkCount} searchable sections`
              : 'Checking indexed career data…'}
          </span>
          {knowledgeError && <span role="alert" className="text-red-600">{knowledgeError}</span>}
          {knowledgeSuccess && <span role="status" className="text-green-700">{knowledgeSuccess}</span>}
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto pb-1">
          <span className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <Lightbulb size={13} className="text-amber-500" /> Prompts:
          </span>
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void handleSend(prompt)}
              disabled={!canSend}
              className="whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
          {loadingConversations || loadingMessages ? (
            <p role="status" className="text-sm text-gray-500">Loading your conversation…</p>
          ) : visibleMessages.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-600 shadow-sm">
              <p>Hello, {displayName}. Start a conversation to get guidance based on your career data.</p>
              {!selectedConversationId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleNewConversation()}
                  loading={creatingConversation}
                  className="mt-4"
                >
                  <Plus size={14} /> Start a conversation
                </Button>
              )}
              {knowledgeStatus?.chunkCount === 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  Sync personal data to enable personalized answers.
                </p>
              )}
            </div>
          ) : visibleMessages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-white ${
                message.role === 'assistant' ? 'bg-electric-500 shadow-sm' : 'bg-navy-700 shadow-sm'
              }`}>
                {message.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
              </div>
              <div className={`max-w-xl rounded-2xl p-4 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'rounded-tr-none bg-navy-900 text-white'
                  : 'whitespace-pre-line rounded-tl-none border border-gray-100 bg-white text-gray-800 shadow-card'
              }`}>
                <div className="mb-1 flex items-center justify-between gap-4">
                  <span className={`text-[10px] font-semibold ${message.role === 'user' ? 'text-navy-300' : 'text-gray-400'}`}>
                    {message.role === 'assistant' ? 'Career Copilot' : displayName}
                  </span>
                  <span className={`text-[9px] ${message.role === 'user' ? 'text-navy-400' : 'text-gray-400'}`}>
                    {message.timestamp}
                  </span>
                </div>
                <p>{message.content}</p>
                {message.sources.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Sources</p>
                    <ul className="space-y-1">
                      {message.sources.map((source) => (
                        <li key={source.id} className="text-[11px] text-gray-500">
                          {source.title} · {source.sourceType} · {source.contextExpanded
                            ? 'Supporting context'
                            : typeof source.similarity === 'number'
                              ? `${Math.round(source.similarity * 100)}% match`
                              : 'Source'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <p role="status" className="text-sm text-gray-500">Preparing a grounded response…</p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-card">
          <input
            type="text"
            aria-label="Message"
            placeholder="Ask about your resume, skills, or career goals..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
            disabled={!canSend}
            className="flex-1 bg-transparent px-2 py-1 text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:opacity-50"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleSend()}
            disabled={!input.trim() || !canSend}
            loading={sending}
          >
            <Send size={14} /> Send
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}

export function CopilotPage() {
  const { user, session } = useAuth()
  if (!user || !session) {
    return (
      <DashboardLayout>
        <p role="status" className="p-8 text-sm text-gray-500">Loading your account…</p>
      </DashboardLayout>
    )
  }

  return (
    <CopilotWorkspace
      key={user.id}
      accessToken={session.access_token}
      displayName={getUserDisplayName(user)}
    />
  )
}
