const assert = require('node:assert/strict')
const test = require('node:test')
const { Prisma } = require('@prisma/client')
const { ApiError } = require('../dist/utils/ApiError')
const { createJobService } = require('../dist/services/job.service')
const { createExternalJobProviderRegistry } = require('../dist/services/externalJobProvider.service')
const { createJobSchema, externalJobSchema, jobSearchSchema } = require('../dist/validation/job.schema')
const { uuidSchema } = require('../dist/validation/id.schema')

const jobInput = {
  title: 'Backend Engineer',
  company: 'Example Corp',
  description: 'Build APIs',
  requiredSkills: ['TypeScript', 'Node.js', 'typescript'],
  optionalSkills: ['Docker'],
  remoteStatus: 'REMOTE',
}

test('manual job creation validates and normalizes skills without accepting owner IDs', async () => {
  let createArgs
  const service = createJobService({
    database: {
      job: {
        create: async (args) => {
          createArgs = args
          return args.data
        },
      },
    },
  })

  const parsed = createJobSchema.parse(jobInput)
  const job = await service.createManual(parsed)

  assert.deepEqual(job.requiredSkills, ['typescript', 'node.js'])
  assert.deepEqual(job.optionalSkills, ['docker'])
  assert.equal(createArgs.data.source, 'MANUAL')
  assert.equal(createArgs.data.provider, null)
  assert.equal(createArgs.data.externalId, null)
  assert.equal(createJobSchema.safeParse({ ...jobInput, userId: 'untrusted' }).success, false)
  assert.equal(createJobSchema.safeParse({ ...jobInput, title: ' ' }).success, false)
  assert.equal(createJobSchema.safeParse({ ...jobInput, applicationUrl: 'javascript:alert(1)' }).success, false)
  assert.equal(createJobSchema.safeParse({ ...jobInput, requiredSkills: ['!!!'] }).success, false)
})

test('job search applies text, location, enum, skill, pagination, and sorting filters', async () => {
  let findArgs
  let countArgs
  const service = createJobService({
    database: {
      job: {
        findMany: async (args) => { findArgs = args; return [{ id: 'job-1' }] },
        count: async (args) => { countArgs = args; return 21 },
      },
    },
  })
  const query = jobSearchSchema.parse({
    title: 'engineer',
    company: 'example',
    description: 'API',
    location: 'Toronto',
    employmentType: 'FULL_TIME',
    remoteStatus: 'HYBRID',
    requiredSkills: 'TypeScript,node.js',
    page: '2',
    pageSize: '10',
    sortBy: 'title',
    sortOrder: 'asc',
  })
  const result = await service.search(query)

  assert.equal(findArgs.skip, 10)
  assert.equal(findArgs.take, 10)
  assert.deepEqual(findArgs.orderBy, { title: 'asc' })
  assert.deepEqual(findArgs.where.requiredSkills, { hasSome: ['typescript', 'node.js'] })
  assert.equal(findArgs.where.title.mode, 'insensitive')
  assert.deepEqual(countArgs.where, findArgs.where)
  assert.deepEqual(result.pagination, { page: 2, pageSize: 10, total: 21, totalPages: 3 })
  assert.equal(jobSearchSchema.safeParse({ pageSize: '1000' }).success, false)
  assert.equal(uuidSchema.safeParse('not-a-uuid').success, false)
})

test('external job duplicate constraints return conflict and unconfigured providers are explicit', async () => {
  const duplicateError = new Prisma.PrismaClientKnownRequestError('Duplicate', {
    code: 'P2002',
    clientVersion: '6.19.0',
    meta: { target: ['provider', 'externalId'] },
  })
  const service = createJobService({
    database: { job: { create: async () => { throw duplicateError } } },
  })
  const externalJob = externalJobSchema.parse({
    ...jobInput,
    provider: 'example-provider',
    externalId: 'external-123',
  })

  await assert.rejects(
    service.createExternal(externalJob),
    (error) => error instanceof ApiError && error.statusCode === 409
  )

  const registry = createExternalJobProviderRegistry()
  await assert.rejects(
    registry.search('not-configured', {}),
    (error) => error instanceof ApiError && error.statusCode === 501
  )

  let receivedQuery
  const configuredRegistry = createExternalJobProviderRegistry([{
    name: 'sample',
    search: async (query) => {
      receivedQuery = query
      return { jobs: [], total: 0 }
    },
  }])
  const externalResult = await configuredRegistry.search('SAMPLE', { page: 2, pageSize: 5 })
  assert.deepEqual(receivedQuery, { page: 2, pageSize: 5 })
  assert.deepEqual(externalResult, { jobs: [], total: 0 })
})

test('job detail returns not found for an unknown job', async () => {
  const service = createJobService({ database: { job: { findUnique: async () => null } } })
  await assert.rejects(
    service.get('00000000-0000-4000-8000-000000000001'),
    (error) => error instanceof ApiError && error.statusCode === 404
  )
})
