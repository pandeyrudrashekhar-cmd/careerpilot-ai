const assert = require('node:assert/strict')
const test = require('node:test')
const { ApiError } = require('../dist/utils/ApiError')
const { createApplicationService } = require('../dist/services/application.service')
const {
  applicationListQuerySchema,
  createApplicationSchema,
  updateApplicationSchema,
  updateApplicationStatusSchema,
} = require('../dist/validation/application.schema')

const userId = 'c0a80101-0000-4000-8000-000000000001'
const otherUserId = 'c0a80101-0000-4000-8000-000000000002'
const jobId = '00000000-0000-4000-8000-000000000011'
const applicationId = '00000000-0000-4000-8000-000000000012'

test('creates a linked application and initial status history in one transaction', async () => {
  let createdApplication
  let history
  let txOptions
  const transaction = {
    application: {
      findFirst: async () => null,
      create: async ({ data }) => {
        createdApplication = data
        return { id: applicationId, ...data }
      },
    },
    applicationStatusHistory: {
      create: async ({ data }) => { history = data },
    },
  }
  const service = createApplicationService({
    job: { findUnique: async () => ({ company: 'Example Co', title: 'Engineer' }) },
    resume: { findFirst: async ({ where }) => where.userId === userId ? { id: where.id } : null },
    $transaction: async (callback, options) => {
      txOptions = options
      return callback(transaction)
    },
  })

  const input = createApplicationSchema.parse({ jobId, status: 'SAVED', notes: 'Follow up' })
  const application = await service.create(userId, input)

  assert.equal(createdApplication.userId, userId)
  assert.equal(createdApplication.company, 'Example Co')
  assert.equal(createdApplication.role, 'Engineer')
  assert.deepEqual(history, {
    applicationId,
    fromStatus: null,
    toStatus: 'SAVED',
    note: 'Application created',
  })
  assert.equal(txOptions.isolationLevel, 'Serializable')
  assert.equal(application.id, applicationId)
})

test('supports manual applications, validates payloads, and rejects duplicate job applications', async () => {
  assert.equal(createApplicationSchema.safeParse({ company: 'Acme', role: 'Developer' }).success, true)
  assert.equal(createApplicationSchema.safeParse({ jobId }).success, true)
  assert.equal(createApplicationSchema.safeParse({ jobId, userId, company: 'A', role: 'B' }).success, false)
  assert.equal(updateApplicationSchema.safeParse({ notes: 'updated' }).success, true)
  assert.equal(updateApplicationSchema.safeParse({}).success, false)
  assert.equal(updateApplicationStatusSchema.safeParse({ status: 'OFFERED' }).success, false)
  assert.equal(applicationListQuerySchema.safeParse({ from: '2026-12-01', to: '2026-01-01' }).success, false)

  let createCalled = false
  const service = createApplicationService({
    job: { findUnique: async () => ({ company: 'Acme', title: 'Engineer' }) },
    $transaction: async (callback) => callback({
      application: {
        findFirst: async ({ where }) => where.userId === userId ? { id: 'existing' } : null,
        create: async () => { createCalled = true },
      },
    }),
  })
  await assert.rejects(
    service.create(userId, createApplicationSchema.parse({ jobId })),
    (error) => error instanceof ApiError && error.statusCode === 409
  )
  assert.equal(createCalled, false)
})

test('application list filters by status, company, job title, date range and pagination', async () => {
  let findArgs
  let countArgs
  const service = createApplicationService({
    application: {
      findMany: async (args) => { findArgs = args; return [] },
      count: async (args) => { countArgs = args; return 0 },
    },
  })
  await service.list(userId, applicationListQuerySchema.parse({
    status: 'INTERVIEW',
    company: 'Example',
    role: 'Backend',
    from: '2026-01-02',
    to: '2026-01-10',
    page: '2',
    pageSize: '5',
    sortBy: 'appliedAt',
  }))

  assert.equal(findArgs.where.userId, userId)
  assert.equal(findArgs.where.status, 'INTERVIEW')
  assert.equal(findArgs.where.company.mode, 'insensitive')
  assert.equal(findArgs.where.OR[1].job.is.title.contains, 'Backend')
  assert.equal(findArgs.where.appliedAt.gte.toISOString(), '2026-01-02T00:00:00.000Z')
  assert.equal(findArgs.where.appliedAt.lt.toISOString(), '2026-01-11T00:00:00.000Z')
  assert.equal(findArgs.skip, 5)
  assert.equal(findArgs.take, 5)
  assert.deepEqual(findArgs.orderBy, { appliedAt: 'desc' })
  assert.deepEqual(countArgs.where, findArgs.where)
})

test('updates owner-scoped application information and creates atomic status history', async () => {
  let updateWhere
  let createdHistory
  const service = createApplicationService({
    application: {
      updateMany: async ({ where }) => {
        updateWhere = where
        return { count: where.userId === userId ? 1 : 0 }
      },
      findFirstOrThrow: async ({ where }) => ({ id: applicationId, ...where }),
    },
    $transaction: async (callback) => callback({
      application: {
        findFirst: async ({ where }) => where.userId === userId
          ? { id: applicationId, status: 'SAVED', appliedAt: null }
          : null,
        update: async ({ data }) => ({ id: applicationId, ...data }),
      },
      applicationStatusHistory: {
        create: async ({ data }) => { createdHistory = data },
      },
    }),
  })

  const update = await service.update(userId, applicationId, updateApplicationSchema.parse({ notes: 'Note' }))
  assert.deepEqual(updateWhere, { id: applicationId, userId })
  assert.equal(update.userId, userId)

  const updatedStatus = await service.updateStatus(
    userId,
    applicationId,
    updateApplicationStatusSchema.parse({ status: 'APPLIED', note: 'Submitted' })
  )
  assert.equal(updatedStatus.status, 'APPLIED')
  assert.equal(updatedStatus.appliedAt instanceof Date, true)
  assert.deepEqual(createdHistory, {
    applicationId,
    fromStatus: 'SAVED',
    toStatus: 'APPLIED',
    note: 'Submitted',
  })
})

test('status updates and reads reject another user; invalid transitions create no history', async () => {
  const foreign = createApplicationService({
    application: { findFirst: async ({ where }) => where.userId === otherUserId ? { id: applicationId } : null },
    $transaction: async (callback) => callback({
      application: { findFirst: async () => null },
    }),
  })
  await assert.rejects(
    foreign.get(userId, applicationId),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
  await assert.rejects(
    foreign.updateStatus(userId, applicationId, { status: 'OFFER' }),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
  assert.notEqual(userId, otherUserId)

  const invalidTransition = createApplicationService({
    $transaction: async (callback) => callback({
      application: { findFirst: async () => ({ id: applicationId, status: 'REJECTED', appliedAt: null }) },
      applicationStatusHistory: { create: async () => assert.fail('history must not be written') },
    }),
  })
  await assert.rejects(
    invalidTransition.updateStatus(userId, applicationId, { status: 'APPLIED' }),
    (error) => error instanceof ApiError && error.statusCode === 409
  )
})

test('dashboard statistics count status groups and recent activity for one owner', async () => {
  let query
  let groupedQuery
  const service = createApplicationService({
    application: {
      count: async ({ where }) => {
        if (where.status === 'INTERVIEW') return 2
        if (where.status === 'OFFER') return 1
        if (where.status === 'REJECTED') return 3
        return 6
      },
      groupBy: async (args) => { groupedQuery = args; return [{ status: 'SAVED', _count: { _all: 4 } }] },
      findMany: async (args) => { query = args; return [{ id: applicationId, company: 'Acme' }] },
    },
  })
  const stats = await service.stats(userId, 3)

  assert.deepEqual(groupedQuery.where, { userId })
  assert.deepEqual(query.where, { userId })
  assert.equal(query.take, 3)
  assert.equal(stats.total, 6)
  assert.equal(stats.interviews, 2)
  assert.equal(stats.offers, 1)
  assert.equal(stats.rejections, 3)
  assert.deepEqual(stats.byStatus, {
    SAVED: 4,
    APPLIED: 0,
    SCREENING: 0,
    INTERVIEW: 0,
    OFFER: 0,
    REJECTED: 0,
    WITHDRAWN: 0,
  })
})

test('application history is owner-checked and delete removes restricted history transactionally', async () => {
  let deletedHistory
  let deletedApplication
  const service = createApplicationService({
    application: {
      findFirst: async ({ where }) => where.userId === userId ? { id: applicationId } : null,
    },
    applicationStatusHistory: {
      findMany: async () => [{ toStatus: 'SAVED' }],
    },
    $transaction: async (callback) => callback({
      application: {
        findFirst: async ({ where }) => where.userId === userId ? { id: applicationId } : null,
        delete: async ({ where }) => { deletedApplication = where },
      },
      applicationStatusHistory: {
        deleteMany: async ({ where }) => { deletedHistory = where },
      },
    }),
  })
  assert.deepEqual(await service.history(userId, applicationId), [{ toStatus: 'SAVED' }])
  await service.delete(userId, applicationId)
  assert.deepEqual(deletedHistory, { applicationId })
  assert.deepEqual(deletedApplication, { id: applicationId })
})
