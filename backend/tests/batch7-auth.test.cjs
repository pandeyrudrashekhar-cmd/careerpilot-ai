const assert = require('node:assert/strict')
const test = require('node:test')
const request = require('supertest')
const app = require('../dist/app').default

test('knowledge and Copilot endpoints require Supabase authentication', async () => {
  const paths = [
    ['post', '/api/knowledge/ingest'],
    ['post', '/api/knowledge/reindex'],
    ['get', '/api/knowledge/status'],
    ['delete', '/api/knowledge/RESUME/00000000-0000-4000-8000-000000000001'],
    ['post', '/api/copilot/conversations'],
    ['get', '/api/copilot/conversations'],
    ['get', '/api/copilot/conversations/00000000-0000-4000-8000-000000000001'],
    ['post', '/api/copilot/conversations/00000000-0000-4000-8000-000000000001/messages'],
    ['delete', '/api/copilot/conversations/00000000-0000-4000-8000-000000000001'],
  ]
  for (const [method, path] of paths) {
    const response = await request(app)[method](path)
    assert.equal(response.status, 401, `${method.toUpperCase()} ${path}`)
    assert.equal(response.body.success, false)
  }
})
