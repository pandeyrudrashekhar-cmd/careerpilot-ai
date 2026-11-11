const assert = require('node:assert/strict')
const test = require('node:test')
const { ApiError } = require('../dist/utils/ApiError')
const { createResumeService } = require('../dist/services/resume.service')
const {
  extractResumeText,
  validateResumeFileContent,
} = require('../dist/services/resumeFile.service')
const { createResumeAnalysisProvider } = require('../dist/services/resumeAnalysisProvider.service')

const userId = 'c0a80101-0000-4000-8000-000000000001'
const otherUserId = 'c0a80101-0000-4000-8000-000000000002'
const validPdf = Buffer.from('%PDF-1.7\nresume text')

test('resume upload validates type and magic bytes before storage or persistence', async () => {
  let storageCalls = 0
  let transactionCalls = 0
  const service = createResumeService({
    database: {
      $transaction: async () => { transactionCalls += 1 },
    },
    createStorage: () => ({
      upload: async () => { storageCalls += 1 },
      remove: async () => {},
      download: async () => validPdf,
    }),
  })

  await assert.rejects(
    service.upload(userId, 'token', {
      originalname: 'resume.pdf',
      mimetype: 'text/plain',
      size: validPdf.length,
      buffer: validPdf,
    }),
    (error) => error instanceof ApiError && error.statusCode === 400
  )
  assert.equal(storageCalls, 0)
  assert.equal(transactionCalls, 0)

  assert.throws(
    () => validateResumeFileContent('resume.pdf', 'application/pdf', Buffer.from('not a PDF')),
    (error) => error instanceof ApiError && error.statusCode === 400
  )
})

test('resume upload stores private object first and persists owner-scoped metadata', async () => {
  let uploaded
  let created
  const service = createResumeService({
    database: {
      $transaction: async (callback) => callback({
        resume: {
          count: async ({ where }) => {
            assert.deepEqual(where, { userId, isActive: true })
            return 0
          },
          create: async ({ data }) => {
            created = data
            return { id: 'resume-id', ...data, createdAt: new Date(), updatedAt: new Date() }
          },
        },
      }),
    },
    createStorage: () => ({
      upload: async (path, buffer, contentType) => {
        uploaded = { path, buffer, contentType }
      },
      remove: async () => {},
      download: async () => validPdf,
    }),
  })

  const resume = await service.upload(userId, 'verified-token', {
    originalname: 'resume.pdf',
    mimetype: 'application/pdf',
    size: validPdf.length,
    buffer: validPdf,
  })

  assert.equal(uploaded.buffer, validPdf)
  assert.equal(uploaded.contentType, 'application/pdf')
  assert.ok(uploaded.path.startsWith(`${userId}/`))
  assert.equal(created.userId, userId)
  assert.equal(created.storagePath, uploaded.path)
  assert.equal(created.fileSizeBytes, BigInt(validPdf.length))
  assert.equal(created.isActive, true)
  assert.equal(resume.id, 'resume-id')
})

test('resume detail lookup scopes by both resume ID and authenticated owner', async () => {
  let where
  const service = createResumeService({
    database: {
      resume: {
        findFirst: async (args) => {
          where = args.where
          return null
        },
      },
    },
  })

  await assert.rejects(
    service.get(userId, 'resume-owned-by-another-user'),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
  assert.deepEqual(where, { id: 'resume-owned-by-another-user', userId })
  assert.notEqual(userId, otherUserId)
})

test('resume summary excludes extracted text while selecting analysis fields used by the page', async () => {
  let args
  const service = createResumeService({
    database: {
      resume: {
        findFirst: async (query) => {
          args = query
          return { id: 'resume-id', analyses: [] }
        },
      },
    },
  })

  await service.getSummary(userId, 'resume-id')

  assert.deepEqual(args.where, { id: 'resume-id', userId })
  assert.deepEqual(args.select.analyses.select, {
    id: true,
    status: true,
    strengths: true,
    improvementSuggestions: true,
    provider: true,
    model: true,
    analyzedAt: true,
    createdAt: true,
  })
  assert.equal(Object.hasOwn(args.select.analyses.select, 'extractedText'), false)
})

test('resume text extraction rejects malformed PDF content', async () => {
  await assert.rejects(
    extractResumeText('bad.pdf', Buffer.from('%PDF-1.7 not a valid document')),
    (error) => error instanceof ApiError && error.statusCode === 422
  )
})

test('analysis provider rejects malformed structured AI output', async () => {
  const provider = createResumeAnalysisProvider(
    'test-key',
    'test-model',
    async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"skills": []}' } }],
    }), { status: 200 })
  )

  await assert.rejects(
    provider.analyze('A sample resume'),
    (error) => error instanceof ApiError && error.statusCode === 502
  )
})

test('resume analysis uses Groq strict structured output and validates successful results', async () => {
  const analysis = {
    skills: ['TypeScript'],
    experienceSummary: 'Built backend services.',
    education: [{ institution: null, credential: null, field: null, startDate: null, endDate: null }],
    strengths: ['Clear API design'],
    improvementSuggestions: ['Add measurable outcomes'],
  }
  const provider = createResumeAnalysisProvider(
    'test-key',
    'openai/gpt-oss-20b',
    async (url, init) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions')
      assert.equal(init.headers.Authorization, 'Bearer test-key')
      const request = JSON.parse(init.body)
      assert.equal(request.model, 'openai/gpt-oss-20b')
      assert.equal(request.response_format.json_schema.strict, true)
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(analysis) } }],
      }), { status: 200 })
    }
  )

  assert.equal(provider.provider, 'groq')
  assert.deepEqual(await provider.analyze('A sample resume'), analysis)
})

test('resume analysis maps Groq authentication, rate limit, and server failures safely', async () => {
  for (const [status, message] of [
    [401, 'authentication failed'],
    [429, 'rate limit exceeded'],
    [503, 'temporarily unavailable'],
  ]) {
    const provider = createResumeAnalysisProvider(
      'test-key',
      'test-model',
      async () => new Response('{}', { status })
    )
    await assert.rejects(
      provider.analyze('A sample resume'),
      (error) => error instanceof ApiError
        && error.statusCode === 502
        && error.message.includes(message)
    )
  }
  const unavailable = createResumeAnalysisProvider(
    'test-key',
    'test-model',
    async () => { throw new Error('network failure') }
  )
  await assert.rejects(
    unavailable.analyze('A sample resume'),
    (error) => error instanceof ApiError && error.statusCode === 502
  )
})

test('analysis provider logs safe diagnostics for rejected requests without resume data', async () => {
  const resumeText = 'Jane Example jane@example.com phone 555-123-4567 worked on Apollo'
  const originalError = console.error
  const diagnostics = []
  console.error = (...args) => diagnostics.push(args)

  try {
    const provider = createResumeAnalysisProvider(
      'test-key',
      'test-model',
      async () => new Response(JSON.stringify({
        error: {
          message: `Invalid request for Jane Example jane@example.com phone 555-123-4567 gsk_test-secret: unsupported schema`,
          type: 'invalid_request_error',
          param: 'response_format',
          code: 'unsupported_value',
        },
      }), { status: 400 })
    )

    await assert.rejects(
      provider.analyze(resumeText),
      (error) => error instanceof ApiError
        && error.statusCode === 502
        && error.message === 'Resume analysis provider rejected the request'
    )
  } finally {
    console.error = originalError
  }

  assert.equal(diagnostics.length, 1)
  assert.equal(diagnostics[0][0], '[resume-analysis] Groq rejected request')
  assert.equal(diagnostics[0][1].httpStatus, 400)
  assert.equal(diagnostics[0][1].model, 'test-model')
  assert.equal(diagnostics[0][1].type, 'invalid_request_error')
  assert.equal(diagnostics[0][1].param, 'response_format')
  assert.equal(diagnostics[0][1].code, 'unsupported_value')
  assert.equal(diagnostics[0][1].message.includes('jane@example.com'), false)
  assert.equal(diagnostics[0][1].message.includes('555-123-4567'), false)
  assert.equal(diagnostics[0][1].message.includes('Jane'), false)
  assert.equal(diagnostics[0][1].message.includes('Apollo'), false)
  assert.equal(diagnostics[0][1].message.includes('gsk_test-secret'), false)
  assert.equal(diagnostics[0][1].message.includes('unsupported schema'), true)
})

test('analysis provider reports missing credentials instead of returning placeholder results', () => {
  assert.throws(
    () => createResumeAnalysisProvider('', 'test-model'),
    (error) => error instanceof ApiError && error.statusCode === 503
  )
})
