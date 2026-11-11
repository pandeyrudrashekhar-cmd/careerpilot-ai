const assert = require('node:assert/strict')
const test = require('node:test')
const { ApiError } = require('../dist/utils/ApiError')
const { createRoadmapService } = require('../dist/services/roadmap.service')
const { generateRoadmapSchema, roadmapItemUpdateSchema } = require('../dist/validation/roadmap.schema')

const userId = 'c0a80101-0000-4000-8000-000000000001'
const jobId = '00000000-0000-4000-8000-000000000021'
const roadmapId = '00000000-0000-4000-8000-000000000022'
const itemId = '00000000-0000-4000-8000-000000000023'

test('roadmap generation creates deterministic owner-scoped steps from skill gaps', async () => {
  let resumeQuery
  let roadmapCreate
  const service = createRoadmapService({
    job: {
      findUnique: async () => ({
        id: jobId,
        title: 'Backend Engineer',
        requiredSkills: ['TypeScript', 'React', 'Docker'],
      }),
    },
    resume: {
      findFirst: async (args) => {
        resumeQuery = args
        return { id: 'resume-1', analyses: [{ id: 'analysis-1', skills: ['typescript'] }] }
      },
    },
    userSkill: {
      findMany: async () => [{
        proficiency: 'ELEMENTARY',
        skill: { normalizedName: 'react' },
      }],
    },
    learningRoadmap: {
      create: async (args) => {
        roadmapCreate = args
        return { id: roadmapId, ...args.data, items: args.data.items.create }
      },
    },
  })

  const result = await service.generate(userId, jobId)

  assert.deepEqual(resumeQuery.where, { userId, isActive: true })
  assert.equal(roadmapCreate.data.userId, userId)
  assert.equal(roadmapCreate.data.sourceResumeId, 'resume-1')
  assert.equal(roadmapCreate.data.generationSource, 'DETERMINISTIC')
  assert.deepEqual(roadmapCreate.data.skillGaps, ['react', 'docker'])
  assert.deepEqual(result.skillGapAnalysis.existingSkills, ['typescript'])
  assert.deepEqual(result.skillGapAnalysis.partiallyMatchingSkills, ['react'])
  assert.deepEqual(result.skillGapAnalysis.missingSkills, ['docker'])
  assert.deepEqual(roadmapCreate.data.items.create.map((item) => item.priority), ['MEDIUM', 'HIGH'])
  assert.ok(roadmapCreate.data.items.create.every((item) => !('learningResources' in item)))
  assert.ok(roadmapCreate.data.items.create.every((item) => !('estimatedEffortHours' in item)))
})

test('roadmap generation rejects missing active resumes and foreign jobs are not exposed', async () => {
  const noResume = createRoadmapService({
    job: { findUnique: async () => ({ id: jobId, title: 'Engineer', requiredSkills: [] }) },
    resume: { findFirst: async () => null },
  })
  await assert.rejects(
    noResume.generate(userId, jobId),
    (error) => error instanceof ApiError && error.statusCode === 409
  )

  const noJob = createRoadmapService({ job: { findUnique: async () => null } })
  await assert.rejects(
    noJob.generate(userId, jobId),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
  assert.equal(generateRoadmapSchema.safeParse({ jobId, userId }).success, false)
  assert.equal(generateRoadmapSchema.safeParse({ jobId: 'not-a-uuid' }).success, false)

  const noAnalysis = createRoadmapService({
    job: { findUnique: async () => ({ id: jobId, title: 'Engineer', requiredSkills: [] }) },
    resume: { findFirst: async () => ({ id: 'resume-1', analyses: [] }) },
  })
  await assert.rejects(
    noAnalysis.generate(userId, jobId),
    (error) => error instanceof ApiError && error.statusCode === 409
  )
})

test('roadmap item transitions are validated and completion synchronizes roadmap status', async () => {
  let roadmapUpdate
  let itemUpdate
  const transaction = {
    learningRoadmap: {
      findFirst: async ({ where }) => where.id === roadmapId && where.userId === userId
        ? { id: roadmapId, status: 'ACTIVE' }
        : null,
      update: async (args) => { roadmapUpdate = args },
    },
    roadmapItem: {
      findFirst: async ({ where }) => where.id === itemId && where.roadmapId === roadmapId
        ? { id: itemId, status: 'IN_PROGRESS' }
        : null,
      update: async (args) => { itemUpdate = args; return { id: itemId, ...args.data } },
      findMany: async () => [{ status: 'COMPLETED' }, { status: 'SKIPPED' }],
    },
  }
  const service = createRoadmapService({
    $transaction: async (callback) => callback(transaction),
  })

  const updated = await service.updateItem(userId, roadmapId, itemId, { status: 'COMPLETED' })
  assert.equal(updated.status, 'COMPLETED')
  assert.equal(itemUpdate.data.completedAt instanceof Date, true)
  assert.deepEqual(roadmapUpdate, {
    where: { id: roadmapId },
    data: { status: 'COMPLETED' },
  })

  assert.equal(roadmapItemUpdateSchema.safeParse({ status: 'INVALID' }).success, false)
})

test('roadmap item updates enforce ownership and reject invalid transitions', async () => {
  const foreignRoadmap = createRoadmapService({
    $transaction: async (callback) => callback({
      learningRoadmap: {
        findFirst: async ({ where }) => where.userId === userId ? null : { status: 'ACTIVE' },
      },
      roadmapItem: {},
    }),
  })
  await assert.rejects(
    foreignRoadmap.updateItem(userId, roadmapId, itemId, { status: 'COMPLETED' }),
    (error) => error instanceof ApiError && error.statusCode === 404
  )

  const invalidTransition = createRoadmapService({
    $transaction: async (callback) => callback({
      learningRoadmap: { findFirst: async () => ({ id: roadmapId, status: 'ACTIVE' }) },
      roadmapItem: { findFirst: async () => ({ id: itemId, status: 'NOT_STARTED' }) },
    }),
  })
  await assert.rejects(
    invalidTransition.updateItem(userId, roadmapId, itemId, { status: 'COMPLETED' }),
    (error) => error instanceof ApiError && error.statusCode === 409
  )
})
