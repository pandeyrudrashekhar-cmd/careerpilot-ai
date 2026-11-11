const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const configModule = path.resolve(__dirname, '../dist/config/env.js')
const internalToken = 'test-internal-token-at-least-32-characters'

function loadConfig(aiServiceUrl, nodeEnv = 'production') {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    NODE_ENV: nodeEnv,
    FRONTEND_URL: 'https://careerpilot-test.vercel.app',
    AI_SERVICE_INTERNAL_TOKEN: internalToken,
  }
  if (aiServiceUrl !== undefined) env.AI_SERVICE_URL = aiServiceUrl

  return spawnSync(
    process.execPath,
    ['-e', `const { config } = require(${JSON.stringify(configModule)}); process.stdout.write(config.aiServiceUrl)`],
    { cwd: os.tmpdir(), env, encoding: 'utf8' },
  )
}

test('normalizes the Render private AI service hostname to its internal URL', () => {
  const result = loadConfig('careerpilot-ai-service-gnra')

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'http://careerpilot-ai-service-gnra:10000')
})

test('preserves a valid HTTPS AI service URL', () => {
  const url = 'https://careerpilot-ai-service-gnra.onrender.com'
  const result = loadConfig(url)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, url)
})

test('preserves support for a bare public Render hostname', () => {
  const result = loadConfig('careerpilot-ai-service-gnra.onrender.com')

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'https://careerpilot-ai-service-gnra.onrender.com')
})

test('rejects malformed or unsupported AI service URLs clearly', () => {
  for (const url of ['https://[invalid', 'another-service', 'http://another-service:10000']) {
    const result = loadConfig(url)

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /AI_SERVICE_URL/)
    assert.match(result.stderr, /valid absolute HTTP or HTTPS URL|supported Render internal service URL/)
  }
})

test('rejects a missing AI service URL in production', () => {
  const result = loadConfig('')

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /AI_SERVICE_URL: is required when NODE_ENV is production/)
})

test('preserves HTTP AI service URLs outside production', () => {
  const url = 'http://ai.internal:8000'
  const result = loadConfig(url, 'test')

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, url)
})
