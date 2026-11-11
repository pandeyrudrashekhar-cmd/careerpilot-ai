const assert = require('node:assert/strict')
const test = require('node:test')
const { ApiError } = require('../dist/utils/ApiError')
const { createAiServiceClient } = require('../dist/services/aiServiceClient.service')
const { createCopilotService } = require('../dist/services/copilot.service')
const {
  conversationListQuerySchema,
  createConversationSchema,
  sendCopilotMessageSchema,
} = require('../dist/validation/copilot.schema')

const userId = 'c0a80101-0000-4000-8000-000000000001'
const otherUserId = 'c0a80101-0000-4000-8000-000000000002'
const conversationId = '00000000-0000-4000-8000-000000000031'
const chunkId = '00000000-0000-4000-8000-000000000032'
const expandedChunkId = '00000000-0000-4000-8000-000000000034'
const sourceId = '00000000-0000-4000-8000-000000000033'

function createDatabase({ owner = userId, status = 'ACTIVE', existingMessages = [] } = {}) {
  const state = {
    messages: [...existingMessages],
    conversationUpdates: [],
    deletedWhere: undefined,
  }
  const transaction = {
    message: {
      findFirst: async ({ where }) => state.messages
        .filter((message) => message.conversationId === where.conversationId)
        .sort((left, right) => right.sequence - left.sequence)[0] ?? null,
      create: async ({ data }) => {
        const message = { id: `message-${state.messages.length + 1}`, createdAt: new Date(), ...data }
        state.messages.push(message)
        return message
      },
    },
    conversation: {
      findFirst: async ({ where }) =>
        where.userId === owner && where.status === status ? { id: conversationId } : null,
      updateMany: async (args) => { state.conversationUpdates.push(args); return { count: 1 } },
    },
  }
  const database = {
    $transaction: async (callback) => callback(transaction),
    conversation: {
      create: async ({ data }) => ({ id: conversationId, status: 'ACTIVE', ...data }),
      findMany: async ({ where }) => where.userId === owner ? [{ id: conversationId }] : [],
      count: async ({ where }) => where.userId === owner ? 1 : 0,
      findFirst: async ({ where }) => where.userId === owner && where.id === conversationId
        ? { id: conversationId, userId: owner, title: null, status, messages: state.messages }
        : null,
      deleteMany: async ({ where }) => {
        state.deletedWhere = where
        return { count: where.userId === owner && where.id === conversationId ? 1 : 0 }
      },
    },
    message: {
      findMany: async ({ where, take }) => state.messages
        .filter((message) => message.conversationId === where.conversationId)
        .sort((left, right) => right.sequence - left.sequence)
        .slice(0, take),
    },
  }
  return { database, state }
}

const reply = {
  answer: 'Your profile shows API development experience; consider highlighting its impact.',
  sources: [
    {
      id: chunkId,
      sourceType: 'RESUME',
      sourceId,
      title: 'resume.pdf',
      chunkIndex: 3,
      similarity: 0.83,
      content: 'CraftAI — AI-Powered Website Builder',
    },
    {
      id: expandedChunkId,
      sourceType: 'RESUME',
      sourceId,
      title: 'resume.pdf',
      chunkIndex: 4,
      contextExpanded: true,
      content: 'CraftAI purpose and implementation details.',
    },
  ],
  provider: 'groq',
  model: 'gpt-test',
}

test('validates conversation/message payloads and paginated filters', () => {
  assert.equal(createConversationSchema.safeParse({ userId }).success, false)
  assert.equal(sendCopilotMessageSchema.safeParse({ content: '', userId }).success, false)
  assert.equal(sendCopilotMessageSchema.safeParse({ content: 'Help me prepare.' }).success, true)
  assert.equal(conversationListQuerySchema.safeParse({ page: '2', pageSize: '10' }).success, true)
})

test('creates a conversation using only the verified caller identity', async () => {
  let args
  const { database } = createDatabase()
  database.conversation.create = async (input) => { args = input; return { id: conversationId, ...input.data } }
  const service = createCopilotService({ database })
  const created = await service.create(userId, createConversationSchema.parse({ title: 'Career planning' }))
  assert.equal(args.data.userId, userId)
  assert.equal(created.id, conversationId)
})

test('saves user and assistant messages, bounds memory, and returns source references only', async () => {
  const priorMessages = Array.from({ length: 20 }, (_, index) => ({
    id: `prior-${index}`,
    conversationId,
    sequence: index + 1,
    role: index % 2 ? 'ASSISTANT' : 'USER',
    content: `History ${index}`,
  }))
  const { database, state } = createDatabase({ existingMessages: priorMessages })
  let aiRequest
  const service = createCopilotService({
    database,
    aiClient: {
      respond: async (owner, query, history) => {
        aiRequest = { owner, query, history }
        return reply
      },
    },
  })

  const result = await service.send(userId, conversationId, sendCopilotMessageSchema.parse({ content: 'What should I improve?' }))
  assert.equal(aiRequest.owner, userId)
  assert.equal(aiRequest.query, 'What should I improve?')
  assert.equal(aiRequest.history.length, 12)
  assert.equal(result.userMessage.role, 'USER')
  assert.equal(result.assistantMessage.role, 'ASSISTANT')
  assert.equal(result.assistantMessage.provider, 'groq')
  assert.equal(result.sources[0].id, chunkId)
  assert.equal(result.sources[1].id, expandedChunkId)
  assert.equal(result.sources[1].contextExpanded, true)
  assert.equal('similarity' in result.sources[1], false)
  assert.equal('content' in result.sources[0], false)
  assert.equal('content' in result.sources[1], false)
  assert.equal(result.assistantMessage.sequence, result.userMessage.sequence + 1)
  assert.equal(state.conversationUpdates.length, 2)
})

test('persists a response returned through the authenticated AI service client', async () => {
  const { database, state } = createDatabase()
  let outboundRequest
  const aiClient = createAiServiceClient(
    'http://ai.internal',
    'internal-integration-token-at-least-32-characters',
    async (url, options) => {
      outboundRequest = { url: String(url), options, body: JSON.parse(options.body) }
      return new Response(JSON.stringify({
        answer: reply.answer,
        sources: reply.sources,
        provider: reply.provider,
        model: reply.model,
      }), { status: 200 })
    },
  )

  const result = await createCopilotService({ database, aiClient }).send(
    userId,
    conversationId,
    sendCopilotMessageSchema.parse({ content: 'What does my profile say about APIs?' }),
  )

  assert.equal(outboundRequest.url, 'http://ai.internal/internal/v1/copilot/respond')
  assert.equal(outboundRequest.options.headers['X-Internal-Token'], 'internal-integration-token-at-least-32-characters')
  assert.deepEqual(outboundRequest.body, {
    userId,
    query: 'What does my profile say about APIs?',
    history: [],
  })
  assert.equal(JSON.stringify(outboundRequest.body).includes('internal-integration-token'), false)
  assert.equal(result.assistantMessage.content, reply.answer)
  assert.equal(result.sources[0].id, chunkId)
  assert.equal(result.sources[1].id, expandedChunkId)
  assert.equal(result.sources[1].contextExpanded, true)
  assert.equal('similarity' in result.sources[1], false)
  assert.equal('content' in result.sources[0], false)
  assert.equal('content' in result.sources[1], false)
  assert.equal(state.messages.length, 2)
  assert.deepEqual(state.messages[1].metadata.sources, [
    {
      id: chunkId,
      sourceType: 'RESUME',
      sourceId,
      title: 'resume.pdf',
      chunkIndex: 3,
      similarity: 0.83,
    },
    {
      id: expandedChunkId,
      sourceType: 'RESUME',
      sourceId,
      title: 'resume.pdf',
      chunkIndex: 4,
      contextExpanded: true,
    },
  ])
})

test('rejects foreign and archived conversations before creating messages', async () => {
  const foreign = createDatabase({ owner: otherUserId })
  const service = createCopilotService({
    database: foreign.database,
    aiClient: { respond: async () => reply },
  })
  await assert.rejects(
    service.send(userId, conversationId, sendCopilotMessageSchema.parse({ content: 'Hello' })),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
  assert.equal(foreign.state.messages.length, 0)

  const archived = createDatabase({ status: 'ARCHIVED' })
  const archivedService = createCopilotService({
    database: archived.database,
    aiClient: { respond: async () => reply },
  })
  await assert.rejects(
    archivedService.send(userId, conversationId, sendCopilotMessageSchema.parse({ content: 'Hello' })),
    (error) => error instanceof ApiError && error.statusCode === 409
  )
  assert.equal(archived.state.messages.length, 0)
})

test('keeps the user message if response generation fails and never invents an answer', async () => {
  const { database, state } = createDatabase()
  const service = createCopilotService({
    database,
    aiClient: {
      respond: async () => { throw new ApiError(503, 'AI service is unavailable') },
    },
  })
  await assert.rejects(
    service.send(userId, conversationId, sendCopilotMessageSchema.parse({ content: 'Am I ready?' })),
    (error) => error instanceof ApiError && error.statusCode === 503
  )
  assert.equal(state.messages.length, 1)
  assert.equal(state.messages[0].role, 'USER')
})

test('deletes only an owner-scoped conversation and reports missing records', async () => {
  const { database, state } = createDatabase()
  const service = createCopilotService({ database })
  await service.delete(userId, conversationId)
  assert.deepEqual(state.deletedWhere, { id: conversationId, userId })

  const foreign = createDatabase({ owner: otherUserId })
  await assert.rejects(
    createCopilotService({ database: foreign.database }).delete(userId, conversationId),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
})
