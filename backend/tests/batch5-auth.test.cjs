const assert = require('node:assert/strict')
const test = require('node:test')
const request = require('supertest')
const app = require('../dist/app').default

test('job, match, and roadmap endpoints require Supabase authentication', async () => {
  const paths = [
    ['get', '/api/jobs'],
    ['get', '/api/jobs/search'],
    ['post', '/api/jobs'],
    ['post', '/api/jobs/00000000-0000-4000-8000-000000000001/match'],
    ['get', '/api/jobs/00000000-0000-4000-8000-000000000001/match'],
    ['get', '/api/matches'],
    ['post', '/api/roadmaps/generate'],
    ['get', '/api/roadmaps'],
    ['get', '/api/roadmaps/00000000-0000-4000-8000-000000000001'],
    ['patch', '/api/roadmaps/00000000-0000-4000-8000-000000000001/items/00000000-0000-4000-8000-000000000002'],
  ]

  for (const [method, path] of paths) {
    const response = await request(app)[method](path)
    assert.equal(response.status, 401, `${method.toUpperCase()} ${path}`)
    assert.equal(response.body.success, false)
  }
})
