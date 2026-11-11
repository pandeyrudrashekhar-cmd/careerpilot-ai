process.env.NODE_ENV = 'development'

const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const request = require('supertest')
const { createAuthenticateMiddleware } = require('../dist/middleware/authenticate')
const {
  getResumeReadRoute,
  resumeReadPerformance,
} = require('../dist/middleware/resumePerformance')
const { createResumeService } = require('../dist/services/resume.service')

const userId = 'c0a80101-0000-4000-8000-000000000001'
const resumeId = 'c0a80101-0000-4000-8000-000000000099'

function captureLogs() {
  const originalInfo = console.info
  const logs = []
  console.info = (message) => logs.push(JSON.parse(message))

  return {
    logs,
    restore() {
      console.info = originalInfo
    },
  }
}

test('classifies resume read URLs without retaining request identifiers or query values', () => {
  assert.equal(getResumeReadRoute({ method: 'GET', originalUrl: '/api/resumes?email=private@example.test' }), '/api/resumes')
  assert.equal(getResumeReadRoute({ method: 'GET', originalUrl: `/api/resumes/${resumeId}` }), '/api/resumes/:resumeId')
  assert.equal(getResumeReadRoute({ method: 'GET', originalUrl: `/api/resumes/${resumeId}/summary` }), '/api/resumes/:resumeId/summary')
  assert.equal(getResumeReadRoute({ method: 'POST', originalUrl: '/api/resumes' }), undefined)
  assert.equal(getResumeReadRoute({ method: 'GET', originalUrl: '/api/resumes/a/b' }), undefined)
})

test('logs safe JWT, provisioning and total timings for list and detail reads', async () => {
  const captured = captureLogs()
  const app = express()
  const authenticate = createAuthenticateMiddleware({
    verifyToken: async () => ({ sub: userId, email: 'private@example.test' }),
    provisionUser: async () => {},
  })

  app.use(resumeReadPerformance)
  app.get('/api/resumes', authenticate, (_request, response) => response.json({ success: true, data: [] }))
  app.get('/api/resumes/:resumeId', authenticate, (_request, response) => response.json({ success: true, data: {} }))

  try {
    await request(app).get('/api/resumes').set('Authorization', 'Bearer private-access-token').expect(200)
    await request(app).get(`/api/resumes/${resumeId}`).set('Authorization', 'Bearer private-access-token').expect(200)

    assert.deepEqual(
      captured.logs.map(({ route, stage }) => `${route}:${stage}`).sort(),
      [
        '/api/resumes/:resumeId:jwt_verification',
        '/api/resumes/:resumeId:route_total',
        '/api/resumes/:resumeId:user_provisioning',
        '/api/resumes:jwt_verification',
        '/api/resumes:route_total',
        '/api/resumes:user_provisioning',
      ].sort(),
    )
    for (const log of captured.logs) {
      assert.equal(log.event, 'resume.performance')
      assert.match(log.request_id, /^[0-9a-f-]{36}$/i)
      assert.equal(typeof log.duration_ms, 'number')
      assert.ok(log.duration_ms >= 0)
      assert.deepEqual(Object.keys(log).sort(), ['duration_ms', 'event', 'request_id', 'route', 'stage'])
    }

    const serializedLogs = JSON.stringify(captured.logs)
    assert.equal(serializedLogs.includes(userId), false)
    assert.equal(serializedLogs.includes(resumeId), false)
    assert.equal(serializedLogs.includes('private@example.test'), false)
    assert.equal(serializedLogs.includes('private-access-token'), false)
  } finally {
    captured.restore()
  }
})

test('measures the existing Prisma list and detail queries', async () => {
  const captured = captureLogs()
  const service = createResumeService({
    database: {
      resume: {
        findMany: async ({ where }) => {
          assert.deepEqual(where, { userId })
          return []
        },
        findFirst: async ({ where }) => {
          assert.deepEqual(where, { id: resumeId, userId })
          return { id: resumeId, analyses: [] }
        },
      },
    },
  })

  try {
    assert.deepEqual(await service.list(userId), [])
    assert.deepEqual(await service.get(userId, resumeId), { id: resumeId, analyses: [] })
    assert.deepEqual(
      captured.logs.map(({ route, stage }) => `${route}:${stage}`),
      [
        '/api/resumes:prisma_resume_list_query',
        '/api/resumes/:resumeId:prisma_resume_detail_query',
      ],
    )
  } finally {
    captured.restore()
  }
})
