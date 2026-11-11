const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const request = require('supertest')
const { errors, jwtVerify } = require('jose')
const { createAuthenticateMiddleware } = require('../dist/middleware/authenticate')
const { errorHandler } = require('../dist/middleware/errorHandler')

const userId = 'c0a80101-0000-4000-8000-000000000001'

function createProtectedApp(authenticate) {
  const app = express()
  app.use(express.json())
  app.get('/protected', authenticate, (req, res) => {
    res.json({ userId: req.auth.userId })
  })
  app.use(errorHandler)
  return app
}

test('rejects a missing bearer token', async () => {
  const app = createProtectedApp(createAuthenticateMiddleware({
    verifyToken: async () => ({ sub: userId }),
    provisionUser: async () => {},
  }))

  const response = await request(app).get('/protected')
  assert.equal(response.status, 401)
  assert.equal(response.body.success, false)
})

test('rejects an invalid JWT', async () => {
  const app = createProtectedApp(createAuthenticateMiddleware({
    verifyToken: (token) => jwtVerify(token, new Uint8Array(32)),
    provisionUser: async () => {},
  }))

  const response = await request(app)
    .get('/protected')
    .set('Authorization', 'Bearer invalid.jwt.token')
  assert.equal(response.status, 401)
})

test('rejects verified tokens without a UUID subject', async () => {
  const app = createProtectedApp(createAuthenticateMiddleware({
    verifyToken: async () => ({ sub: 'not-a-uuid' }),
    provisionUser: async () => {},
  }))

  const response = await request(app).get('/protected').set('Authorization', 'Bearer verified')
  assert.equal(response.status, 401)
})

test('uses the verified JWT subject rather than a request-supplied user ID', async () => {
  const provisioned = []
  const app = createProtectedApp(createAuthenticateMiddleware({
    verifyToken: async () => ({ sub: userId, email: 'student@example.test' }),
    provisionUser: async (id, email) => provisioned.push({ id, email }),
  }))

  const response = await request(app)
    .get('/protected')
    .set('Authorization', 'Bearer verified')
    .send({ userId: 'c0a80101-0000-4000-8000-000000000099' })

  assert.equal(response.status, 200)
  assert.equal(response.body.userId, userId)
  assert.deepEqual(provisioned, [{ id: userId, email: 'student@example.test' }])
})

test('treats a JWKS/network failure as an authentication provider outage', async () => {
  const app = createProtectedApp(createAuthenticateMiddleware({
    verifyToken: async () => {
      throw new errors.JWKSTimeout('JWKS timeout')
    },
    provisionUser: async () => {},
  }))

  const response = await request(app).get('/protected').set('Authorization', 'Bearer token')
  assert.equal(response.status, 503)
})
