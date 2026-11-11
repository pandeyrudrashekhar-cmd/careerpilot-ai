const assert = require('node:assert/strict')
const test = require('node:test')
const request = require('supertest')
const app = require('../dist/app').default

test('application and interview endpoints require Supabase authentication', async () => {
  const paths = [
    ['post', '/api/applications'],
    ['get', '/api/applications'],
    ['get', '/api/applications/stats'],
    ['get', '/api/applications/00000000-0000-4000-8000-000000000001'],
    ['patch', '/api/applications/00000000-0000-4000-8000-000000000001'],
    ['patch', '/api/applications/00000000-0000-4000-8000-000000000001/status'],
    ['delete', '/api/applications/00000000-0000-4000-8000-000000000001'],
    ['get', '/api/applications/00000000-0000-4000-8000-000000000001/history'],
    ['post', '/api/interviews'],
    ['get', '/api/interviews'],
    ['get', '/api/interviews/stats'],
    ['get', '/api/interviews/00000000-0000-4000-8000-000000000001'],
    ['post', '/api/interviews/00000000-0000-4000-8000-000000000001/start'],
    ['post', '/api/interviews/00000000-0000-4000-8000-000000000001/questions'],
    ['get', '/api/interviews/00000000-0000-4000-8000-000000000001/questions'],
    ['post', '/api/interviews/00000000-0000-4000-8000-000000000001/answers'],
    ['get', '/api/interviews/00000000-0000-4000-8000-000000000001/feedback'],
    ['post', '/api/interviews/00000000-0000-4000-8000-000000000001/complete'],
  ]
  for (const [method, path] of paths) {
    const response = await request(app)[method](path)
    assert.equal(response.status, 401, `${method.toUpperCase()} ${path}`)
    assert.equal(response.body.success, false)
  }
})
