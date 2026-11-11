const assert = require('node:assert/strict')
const test = require('node:test')
const { ApiError } = require('../dist/utils/ApiError')
const { createAiServiceClient } = require('../dist/services/aiServiceClient.service')
const { createKnowledgeService } = require('../dist/services/knowledge.service')
const { knowledgeDocumentSchema } = require('../dist/validation/knowledge.schema')

const userId = 'c0a80101-0000-4000-8000-000000000001'
const otherUserId = 'c0a80101-0000-4000-8000-000000000002'
const profileId = '00000000-0000-4000-8000-000000000021'
const resumeId = '00000000-0000-4000-8000-000000000022'
const skillId = '00000000-0000-4000-8000-000000000023'
const roadmapId = '00000000-0000-4000-8000-000000000024'
const applicationId = '00000000-0000-4000-8000-000000000025'
const jobId = '00000000-0000-4000-8000-000000000026'

test('builds user-scoped documents for each authorized source and sends a full snapshot', async () => {
  const calls = []
  const database = {
    profile: {
      findUnique: async ({ where }) => {
        assert.deepEqual(where, { userId })
        return { id: profileId, displayName: 'Ada', headline: 'Backend engineer', summary: 'Builds APIs' }
      },
    },
    userSkill: {
      findMany: async ({ where }) => {
        assert.deepEqual(where, { userId })
        return [{
          id: skillId,
          proficiency: 'ADVANCED',
          yearsExperience: { toString: () => '3.0' },
          evidenceSource: 'ASSESSMENT',
          evidence: null,
          skill: { name: 'TypeScript', category: 'PROGRAMMING_LANGUAGE' },
        }]
      },
    },
    resume: {
      findFirst: async (args) => {
        assert.deepEqual(args.where, { userId, isActive: true })
        assert.deepEqual(args.select.analyses.where, { status: 'COMPLETED' })
        assert.deepEqual(args.select.analyses.orderBy, { createdAt: 'desc' })
        assert.equal(args.select.analyses.take, 1)
        return {
          id: resumeId,
          originalFilename: 'resume.pdf',
          analyses: [{
            extractedText: 'Resume facts',
            skills: ['TypeScript'],
            experienceSummary: 'API development',
            education: [{ institution: 'Example University' }],
            strengths: ['Clear communication'],
            improvementSuggestions: ['Add outcome metrics'],
          }],
        }
      },
    },
    learningRoadmap: {
      findMany: async ({ where }) => {
        assert.deepEqual(where, { userId, status: { not: 'ARCHIVED' } })
        return [{
          id: roadmapId,
          targetRole: 'Backend engineer',
          skillGaps: ['System design'],
          status: 'ACTIVE',
          items: [{ title: 'Study system design', description: 'Learn tradeoffs', priority: 'HIGH', status: 'IN_PROGRESS' }],
        }]
      },
    },
    application: {
      findMany: async ({ where }) => {
        assert.deepEqual(where, { userId })
        return [{
          id: applicationId,
          company: 'Example Co',
          role: 'Backend engineer',
          status: 'INTERVIEW',
          appliedAt: new Date('2026-01-01T00:00:00.000Z'),
          notes: 'Technical round scheduled',
          job: { id: jobId, title: 'Backend Engineer', company: 'Example Co', description: 'Build services', requiredSkills: ['Node.js'], optionalSkills: [] },
        }]
      },
    },
    jobMatch: {
      findMany: async ({ where }) => {
        assert.deepEqual(where, { userId })
        return [{ job: { id: jobId, title: 'Backend Engineer', company: 'Example Co', description: 'Build services', requiredSkills: ['Node.js'], optionalSkills: [] } }]
      },
    },
  }
  const service = createKnowledgeService({
    database,
    aiClient: {
      ingest: async (owner, documents) => {
        calls.push({ owner, documents })
        return { sourceCount: documents.length, chunkCount: documents.length * 2 }
      },
    },
  })

  const result = await service.ingest(userId)
  assert.equal(result.sourceCount, 6)
  assert.equal(calls[0].owner, userId)
  assert.deepEqual(new Set(calls[0].documents.map((document) => document.sourceType)), new Set([
    'PROFILE', 'SKILL', 'RESUME', 'ROADMAP', 'APPLICATION', 'JOB',
  ]))
  assert.ok(calls[0].documents.every((document) => knowledgeDocumentSchema.safeParse(document).success))
  assert.equal(calls[0].documents.filter((document) => document.sourceType === 'JOB').length, 1)
  assert.match(calls[0].documents.find((document) => document.sourceType === 'APPLICATION').content, /Technical round scheduled/)
  const resumeDocument = calls[0].documents.find((document) => document.sourceType === 'RESUME')
  assert.equal(resumeDocument.sourceId, resumeId)
  assert.match(resumeDocument.content, /Resume facts/)
  assert.match(resumeDocument.content, /TypeScript/)
  assert.match(resumeDocument.content, /API development/)
  assert.match(resumeDocument.content, /Example University/)
  assert.match(resumeDocument.content, /Clear communication/)
  assert.match(resumeDocument.content, /Add outcome metrics/)
  assert.ok(calls[0].documents.every((document) => !JSON.stringify(document).includes(otherUserId)))
})

test('reindexes empty user data as an empty replacement snapshot and forwards owner-scoped operations', async () => {
  let ingested
  const aiClient = {
    ingest: async (owner, documents) => { ingested = { owner, documents }; return { sourceCount: 0, chunkCount: 0 } },
    status: async (owner) => ({ owner, sourceCount: 0, chunkCount: 0 }),
    deleteSource: async (owner, sourceType, sourceId) => ({ owner, sourceType, sourceId, deleted: 0 }),
  }
  const database = {
    profile: { findUnique: async () => null },
    userSkill: { findMany: async () => [] },
    resume: { findFirst: async () => null },
    learningRoadmap: { findMany: async () => [] },
    application: { findMany: async () => [] },
    jobMatch: { findMany: async () => [] },
  }
  const service = createKnowledgeService({ database, aiClient })
  await service.ingest(userId)
  assert.deepEqual(ingested, { owner: userId, documents: [] })
  assert.deepEqual(await service.status(userId), { owner: userId, sourceCount: 0, chunkCount: 0 })
  assert.deepEqual(
    await service.deleteSource(userId, 'RESUME', resumeId),
    { owner: userId, sourceType: 'RESUME', sourceId: resumeId, deleted: 0 }
  )
})

test('marks oversized indexed sources as truncated instead of silently claiming full coverage', async () => {
  let document
  const service = createKnowledgeService({
    database: {
      profile: { findUnique: async () => ({ id: profileId, summary: 'x'.repeat(100_100) }) },
      userSkill: { findMany: async () => [] },
      resume: { findFirst: async () => null },
      learningRoadmap: { findMany: async () => [] },
      application: { findMany: async () => [] },
      jobMatch: { findMany: async () => [] },
    },
    aiClient: {
      ingest: async (_owner, documents) => {
        document = documents[0]
        return { sourceCount: 1, chunkCount: 1 }
      },
    },
  })
  await service.ingest(userId)
  assert.equal(document.content.length, 100_000)
  assert.match(document.content, /\[Source text truncated at indexing limit\]$/)
})

test('AI service client uses internal authentication and validates structured results', async () => {
  let requestOptions
  const client = createAiServiceClient('http://ai.internal', 'a'.repeat(32), async (url, options) => {
    requestOptions = { url: String(url), options }
    return new Response(JSON.stringify({ answer: 'Based on your profile, consider this.', sources: [], provider: 'groq', model: 'gpt-test' }), { status: 200 })
  })
  const reply = await client.respond(userId, 'What should I improve?', [])
  assert.equal(requestOptions.url, 'http://ai.internal/internal/v1/copilot/respond')
  assert.equal(requestOptions.options.headers['X-Internal-Token'], 'a'.repeat(32))
  assert.deepEqual(reply.sources, [])
})

test('AI service client rejects missing internal auth, malformed output, and provider errors safely', async () => {
  const missingToken = createAiServiceClient('http://ai.internal', '')
  await assert.rejects(missingToken.status(userId), (error) => error instanceof ApiError && error.statusCode === 503)

  const malformed = createAiServiceClient('http://ai.internal', 'a'.repeat(32), async () =>
    new Response(JSON.stringify({ answer: 'ok', sources: [], provider: 'groq' }), { status: 200 })
  )
  await assert.rejects(malformed.respond(userId, 'Hello', []), (error) => error instanceof ApiError && error.statusCode === 502)

  const unavailable = createAiServiceClient('http://ai.internal', 'a'.repeat(32), async () =>
    new Response(JSON.stringify({ detail: 'do not expose provider details' }), { status: 503 })
  )
  await assert.rejects(unavailable.status(userId), (error) =>
    error instanceof ApiError && error.statusCode === 503 && !error.message.includes('provider details')
  )
})
