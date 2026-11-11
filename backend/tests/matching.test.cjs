const assert = require('node:assert/strict')
const test = require('node:test')
const { ApiError } = require('../dist/utils/ApiError')
const { calculateSkillMatch, createJobMatchService } = require('../dist/services/jobMatch.service')

const userId = 'c0a80101-0000-4000-8000-000000000001'
const otherUserId = 'c0a80101-0000-4000-8000-000000000002'
const jobId = '00000000-0000-4000-8000-000000000011'

test('matching score is deterministic, normalized, deduplicated, and explainable', () => {
  const result = calculateSkillMatch(
    ['Node.JS', 'TYPESCRIPT', 'docker', 'typescript'],
    ['TypeScript', 'Node.js', 'PostgreSQL', 'node.js'],
    ['Docker', 'AWS']
  )

  assert.equal(result.score, 63)
  assert.deepEqual(result.matchedSkills, ['typescript', 'node.js', 'docker'])
  assert.deepEqual(result.missingSkills, ['postgresql'])
  assert.match(result.explanation, /80%/)
  assert.equal(calculateSkillMatch([], [], []).score, 0)
})

test('match persistence uses the active resume analysis and authenticated owner', async () => {
  let resumeQuery
  let upsertArgs
  const service = createJobMatchService({
    job: {
      findUnique: async () => ({
        id: jobId,
        requiredSkills: ['typescript', 'react'],
        optionalSkills: [],
      }),
    },
    resume: {
      findFirst: async (args) => {
        resumeQuery = args
        return {
          id: 'resume-1',
          analyses: [{ id: 'analysis-1', skills: ['TypeScript'] }],
        }
      },
    },
    jobMatch: {
      upsert: async (args) => { upsertArgs = args; return args.create },
    },
  })

  const match = await service.createOrRefresh(userId, jobId)

  assert.deepEqual(resumeQuery.where, { userId, isActive: true })
  assert.equal(upsertArgs.create.userId, userId)
  assert.equal(upsertArgs.create.resumeId, 'resume-1')
  assert.equal(upsertArgs.create.matchScore, 50)
  assert.deepEqual(upsertArgs.create.matchedSkills, ['typescript'])
  assert.deepEqual(upsertArgs.create.missingSkills, ['react'])
  assert.equal(match.userId, userId)
})

test('matching reports missing active resumes and missing analyses without fabricating scores', async () => {
  const noActiveResume = createJobMatchService({
    job: { findUnique: async () => ({ id: jobId, requiredSkills: ['typescript'], optionalSkills: [] }) },
    resume: { findFirst: async () => null },
  })
  await assert.rejects(
    noActiveResume.createOrRefresh(userId, jobId),
    (error) => error instanceof ApiError && error.statusCode === 409
  )

  const noAnalysis = createJobMatchService({
    job: { findUnique: async () => ({ id: jobId, requiredSkills: ['typescript'], optionalSkills: [] }) },
    resume: { findFirst: async () => ({ id: 'resume-1', analyses: [] }) },
  })
  await assert.rejects(
    noAnalysis.createOrRefresh(userId, jobId),
    (error) => error instanceof ApiError && error.statusCode === 409
  )
})

test('match retrieval and history are scoped to the verified user', async () => {
  let findArgs
  let historyArgs
  let countArgs
  const service = createJobMatchService({
    jobMatch: {
      findFirst: async (args) => { findArgs = args; return null },
      findMany: async (args) => { historyArgs = args; return [] },
      count: async (args) => { countArgs = args; return 0 },
    },
  })

  await assert.rejects(
    service.getForJob(userId, jobId),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
  const history = await service.list(userId, 1, 10)
  assert.deepEqual(findArgs.where, { userId, jobId })
  assert.deepEqual(historyArgs.where, { userId })
  assert.deepEqual(countArgs.where, { userId })
  assert.equal(history.pagination.total, 0)
  assert.notEqual(userId, otherUserId)
})
