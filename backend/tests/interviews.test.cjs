const assert = require('node:assert/strict')
const test = require('node:test')
const { ApiError } = require('../dist/utils/ApiError')
const { requestGroq } = require('../dist/lib/groqRequest')
const { createInterviewService } = require('../dist/services/interview.service')
const { createInterviewAiProvider } = require('../dist/services/interviewAiProvider.service')
const {
  createInterviewSchema,
  interviewEvaluationSchema,
  interviewQuestionOutputSchema,
  submitAnswerSchema,
} = require('../dist/validation/interview.schema')

const userId = 'c0a80101-0000-4000-8000-000000000001'
const otherUserId = 'c0a80101-0000-4000-8000-000000000002'
const sessionId = '00000000-0000-4000-8000-000000000031'
const questionId = '00000000-0000-4000-8000-000000000032'
const jobId = '00000000-0000-4000-8000-000000000033'
const resumeId = '00000000-0000-4000-8000-000000000034'

test('bounds Groq retries and does not retry non-transient responses', async () => {
  let attempts = 0
  const recovered = await requestGroq(async (_url, init) => {
    attempts += 1
    assert.ok(init.signal)
    return new Response('{}', { status: attempts === 1 ? 503 : 200 })
  }, 'https://api.groq.com/openai/v1/chat/completions', { method: 'POST' })
  assert.equal(recovered.status, 200)
  assert.equal(attempts, 2)

  attempts = 0
  const rejected = await requestGroq(async () => {
    attempts += 1
    return new Response('{}', { status: 400 })
  }, 'https://api.groq.com/openai/v1/chat/completions', { method: 'POST' })
  assert.equal(rejected.status, 400)
  assert.equal(attempts, 1)

  attempts = 0
  const exhausted = await requestGroq(async () => {
    attempts += 1
    return new Response('{}', { status: 503 })
  }, 'https://api.groq.com/openai/v1/chat/completions', { method: 'POST' })
  assert.equal(exhausted.status, 503)
  assert.equal(attempts, 2)
})

function provider(overrides = {}) {
  return {
    provider: 'mock-ai',
    model: 'mock-model',
    generateQuestions: async (_context, count) => Array.from({ length: count }, (_, index) => ({
      prompt: `AI question number ${index + 1} about backend engineering?`,
      type: 'TECHNICAL',
    })),
    evaluateAnswer: async () => ({
      overallScore: 80,
      technicalCorrectness: 82,
      clarity: 78,
      completeness: 80,
      strengths: ['Clear reasoning'],
      areasForImprovement: ['Add edge cases'],
      suggestedImprovedAnswer: 'A stronger answer with trade-offs.',
    }),
    ...overrides,
  }
}

test('creates an owner-scoped interview session with valid optional job and resume references', async () => {
  let createArgs
  const service = createInterviewService({
    database: {
      job: { findUnique: async () => ({ id: jobId }) },
      resume: { findFirst: async ({ where }) => where.userId === userId ? { id: resumeId } : null },
      interviewSession: {
        create: async (args) => { createArgs = args; return { id: sessionId, ...args.data } },
      },
    },
    providerFactory: () => undefined,
  })

  const input = createInterviewSchema.parse({
    targetRole: 'Backend Engineer',
    type: 'TECHNICAL',
    difficulty: 'ADVANCED',
    jobId,
    resumeId,
  })
  const session = await service.create(userId, input)

  assert.equal(createArgs.data.userId, userId)
  assert.equal(createArgs.data.jobId, jobId)
  assert.equal(createArgs.data.resumeId, resumeId)
  assert.equal(createArgs.data.status, 'IN_PROGRESS')
  assert.equal(session.id, sessionId)
  assert.equal(createInterviewSchema.safeParse({ ...input, userId }).success, false)
  assert.equal(createInterviewSchema.safeParse({ ...input, difficulty: 'HARD' }).success, false)
})

test('rejects inaccessible resume or missing job references', async () => {
  const resumeOwnerCheck = createInterviewService({
    database: {
      job: { findUnique: async () => ({ id: jobId }) },
      resume: { findFirst: async ({ where }) => where.userId === otherUserId ? { id: resumeId } : null },
    },
  })
  await assert.rejects(
    resumeOwnerCheck.create(userId, createInterviewSchema.parse({
      targetRole: 'Engineer',
      type: 'TECHNICAL',
      resumeId,
    })),
    (error) => error instanceof ApiError && error.statusCode === 404
  )

  const noJob = createInterviewService({ database: { job: { findUnique: async () => null } } })
  await assert.rejects(
    noJob.create(userId, createInterviewSchema.parse({
      targetRole: 'Engineer',
      type: 'TECHNICAL',
      jobId,
    })),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
})

test('does not create fallback interview questions when the AI provider is unavailable', async () => {
  const context = {
    id: sessionId,
    userId,
    targetRole: 'Backend Engineer',
    type: 'TECHNICAL',
    difficulty: 'INTERMEDIATE',
    status: 'IN_PROGRESS',
    job: { title: 'Backend Engineer', description: 'Build APIs', requiredSkills: ['Node.js'], optionalSkills: [] },
    resume: { analyses: [{ skills: ['TypeScript'], extractedText: 'Experience text' }] },
  }
  const service = createInterviewService({
    database: { interviewSession: { findFirst: async ({ where }) => where.userId === userId ? context : null } },
    providerFactory: () => undefined,
  })

  await assert.rejects(
    service.generateQuestions(userId, sessionId, { count: 3 }),
    (error) => error instanceof ApiError
      && error.statusCode === 503
      && error.message === 'Interview question generation is not configured'
  )
})

test('uses configured AI question generator and rejects malformed provider output', async () => {
  const validOutput = {
    questions: [{ prompt: 'How would you design a reliable backend service?', type: 'SYSTEM_DESIGN' }],
  }
  const ai = createInterviewAiProvider(
    'test-key',
    'test-model',
    async (_url, init) => {
      assert.equal(_url, 'https://api.groq.com/openai/v1/chat/completions')
      assert.equal(init.headers.Authorization, 'Bearer test-key')
      const request = JSON.parse(init.body)
      assert.equal(request.response_format.json_schema.strict, true)
      assert.equal(request.model, 'test-model')
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validOutput) } }],
      }), { status: 200 })
    }
  )
  const questions = await ai.generateQuestions({
    targetRole: 'Backend Engineer',
    interviewType: 'SYSTEM_DESIGN',
    difficulty: 'ADVANCED',
    skills: ['Node.js'],
  }, 1)
  assert.equal(questions[0].type, 'SYSTEM_DESIGN')
  assert.equal(interviewQuestionOutputSchema.safeParse(validOutput).success, true)
  assert.equal(ai.provider, 'groq')

  const malformed = createInterviewAiProvider(
    'test-key',
    'test-model',
    async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"questions":[{"prompt":"x","type":"INVALID"}]}' } }],
    }), { status: 200 })
  )
  await assert.rejects(
    malformed.generateQuestions({
      targetRole: 'Engineer',
      interviewType: 'TECHNICAL',
      difficulty: 'BEGINNER',
      skills: [],
    }, 1),
    (error) => error instanceof ApiError && error.statusCode === 502
  )
})

test('interview Groq provider handles authentication, rate limit, server, and network failures', async () => {
  const context = {
    targetRole: 'Engineer',
    interviewType: 'TECHNICAL',
    difficulty: 'BEGINNER',
    skills: [],
  }
  for (const [status, message] of [
    [401, 'authentication failed'],
    [429, 'rate limit exceeded'],
    [503, 'temporarily unavailable'],
  ]) {
    const ai = createInterviewAiProvider(
      'test-key',
      'test-model',
      async () => new Response('{}', { status })
    )
    await assert.rejects(
      ai.generateQuestions(context, 1),
      (error) => error instanceof ApiError
        && error.statusCode === 502
        && error.message.includes(message)
    )
  }
  const unavailable = createInterviewAiProvider(
    'test-key',
    'test-model',
    async () => { throw new Error('network failure') }
  )
  await assert.rejects(
    unavailable.generateQuestions(context, 1),
    (error) => error instanceof ApiError && error.statusCode === 502
  )
})

test('manual question addition and question listing enforce session ownership', async () => {
  let created
  let listQuery
  const service = createInterviewService({
    database: {
      interviewSession: { findFirst: async ({ where }) => where.userId === userId
        ? { id: sessionId, status: 'IN_PROGRESS' }
        : null },
      $transaction: async (callback) => callback({
        interviewQuestion: {
          findFirst: async () => ({ order: 1 }),
          create: async ({ data }) => { created = data; return { id: questionId, ...data } },
        },
      }),
      interviewQuestion: {
        findMany: async (args) => { listQuery = args; return [] },
      },
    },
  })

  await service.addQuestion(userId, sessionId, {
    prompt: 'Explain a database transaction and its isolation levels.',
    type: 'TECHNICAL',
  })
  assert.equal(created.sessionId, sessionId)
  assert.equal(created.order, 2)
  assert.equal(created.expectedAnswer, undefined)
  await service.questions(userId, sessionId)
  assert.deepEqual(listQuery.where, { sessionId })
  assert.equal('expectedAnswer' in listQuery.select, false)
})

test('answer submission scopes question to caller session and leaves it unevaluated', async () => {
  let questionQuery
  let answerUpsert
  const service = createInterviewService({
    database: {
      interviewQuestion: {
        findFirst: async (args) => { questionQuery = args; return { id: questionId } },
      },
      interviewAnswer: {
        upsert: async (args) => { answerUpsert = args; return { id: 'answer-1', ...args.create } },
      },
    },
    providerFactory: () => undefined,
  })

  const result = await service.submitAnswer(userId, sessionId, submitAnswerSchema.parse({
    questionId,
    content: 'I would define transaction boundaries and validate failure recovery.',
  }))
  assert.deepEqual(questionQuery.where, {
    id: questionId,
    sessionId,
    session: { userId, status: 'IN_PROGRESS' },
  })
  assert.equal(answerUpsert.create.questionId, questionId)
  assert.equal(result.evaluationStatus, 'NOT_EVALUATED')
  assert.equal(result.answer.content.includes('transaction'), true)
  assert.equal(submitAnswerSchema.safeParse({ questionId, content: '', userId }).success, false)
})

test('answer evaluation validates AI feedback and requires configured provider', async () => {
  let updateArgs
  const database = {
    interviewQuestion: {
      findFirst: async ({ where }) => where.session.userId === userId
        ? {
          id: questionId,
          prompt: 'Explain database transactions and isolation.',
          answer: { id: 'answer-1', content: 'Atomicity and isolation prevent inconsistent results.' },
          session: {
            targetRole: 'Backend Engineer',
            type: 'TECHNICAL',
            difficulty: 'INTERMEDIATE',
            job: null,
            resume: null,
          },
        }
        : null,
    },
    interviewAnswer: {
      update: async (args) => { updateArgs = args; return args.data },
    },
  }
  const service = createInterviewService({ database, provider: provider() })
  const evaluated = await service.evaluateAnswer(userId, sessionId, questionId)
  assert.equal(updateArgs.where.id, 'answer-1')
  assert.equal(evaluated.score, 80)
  assert.equal(evaluated.provider, 'mock-ai')
  assert.equal(interviewEvaluationSchema.safeParse(evaluated.evaluation).success, true)

  const noProvider = createInterviewService({ database, providerFactory: () => undefined })
  await assert.rejects(
    noProvider.evaluateAnswer(userId, sessionId, questionId),
    (error) => error instanceof ApiError && error.statusCode === 503
  )
})

test('answer evaluation does not expose another user question and missing answer is rejected', async () => {
  const service = createInterviewService({
    database: {
      interviewQuestion: {
        findFirst: async ({ where }) => where.session.userId === otherUserId
          ? { id: questionId, answer: null, session: {} }
          : null,
      },
    },
    provider: provider(),
  })
  await assert.rejects(
    service.evaluateAnswer(userId, sessionId, questionId),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
  assert.notEqual(userId, otherUserId)

  const noAnswer = createInterviewService({
    database: {
      interviewQuestion: {
        findFirst: async () => ({
          id: questionId,
          prompt: 'Question',
          answer: null,
          session: { targetRole: 'Engineer', type: 'TECHNICAL', difficulty: 'BEGINNER', job: null, resume: null },
        }),
      },
    },
    provider: provider(),
  })
  await assert.rejects(
    noAnswer.evaluateAnswer(userId, sessionId, questionId),
    (error) => error instanceof ApiError && error.statusCode === 409
  )
})

test('completion averages evaluated answers only and updates session transactionally', async () => {
  let sessionUpdate
  const service = createInterviewService({
    database: {
      $transaction: async (callback) => callback({
        interviewSession: {
          findFirst: async ({ where }) => where.userId === userId
            ? { id: sessionId, status: 'IN_PROGRESS', completedAt: null }
            : null,
          update: async (args) => { sessionUpdate = args; return { id: sessionId, ...args.data } },
        },
        interviewAnswer: {
          findMany: async () => [{ score: 70 }, { score: 90 }, { score: null }],
        },
      }),
    },
  })
  const result = await service.complete(userId, sessionId)
  assert.equal(result.session.status, 'COMPLETED')
  assert.equal(result.evaluatedAnswerCount, 2)
  assert.equal(result.averageScore, 80)
  assert.equal(sessionUpdate.data.completedAt instanceof Date, true)
})

test('interview statistics are user-scoped and trend only after enough evaluated answers', async () => {
  let aggregateArgs
  const service = createInterviewService({
    database: {
      interviewSession: {
      count: async ({ where }) => where.status === 'COMPLETED' ? 2 : 4,
      groupBy: async ({ where }) => {
        assert.deepEqual(where, { userId })
        return [{ type: 'TECHNICAL', _count: { _all: 3 } }]
      },
      findMany: async ({ where }) => {
        assert.deepEqual(where, { userId })
        return [{ id: sessionId, targetRole: 'Engineer' }]
      },
      },
      interviewAnswer: {
      aggregate: async (args) => {
        aggregateArgs = args
        return { _avg: { score: 75.5 }, _count: { _all: 4 } }
      },
      findMany: async () => [
        { score: 80, answeredAt: new Date('2026-01-03') },
        { score: 70, answeredAt: new Date('2026-01-02') },
        { score: 77, answeredAt: new Date('2026-01-01') },
      ],
      },
    },
  })
  const stats = await service.stats(userId, 5)
  assert.deepEqual(aggregateArgs.where.question, { session: { userId } })
  assert.equal(stats.totalSessions, 4)
  assert.equal(stats.completedSessions, 2)
  assert.equal(stats.averageScore, 76)
  assert.equal(stats.performanceTrend.length, 3)
  assert.deepEqual(stats.byType, { TECHNICAL: 3 })
})
