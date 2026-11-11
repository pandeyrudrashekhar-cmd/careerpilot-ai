const assert = require('node:assert/strict')
const test = require('node:test')
const { createProfileService } = require('../dist/services/profile.service')
const { profileUpdateSchema } = require('../dist/validation/profile.schema')

const userId = 'c0a80101-0000-4000-8000-000000000001'

test('profile GET provisions an empty profile scoped to the authenticated user', async () => {
  let call
  const service = createProfileService({
    profile: {
      upsert: async (args) => {
        call = args
        return { id: 'profile-id', ...args.create }
      },
    },
  })

  const profile = await service.get(userId)
  assert.equal(profile.userId, userId)
  assert.deepEqual(call.where, { userId })
  assert.deepEqual(call.create, { userId })
})

test('profile update persists validated fields for the authenticated user', async () => {
  let call
  const service = createProfileService({
    profile: {
      upsert: async (args) => {
        call = args
        return { id: 'profile-id', ...args.update }
      },
    },
  })
  const data = profileUpdateSchema.parse({
    displayName: 'Ada',
    targetRole: 'Backend Engineer',
    websiteUrl: 'https://example.test',
  })

  const profile = await service.update(userId, data)
  assert.equal(profile.displayName, 'Ada')
  assert.deepEqual(call.where, { userId })
  assert.equal(call.create.userId, userId)
  assert.equal(call.update.targetRole, 'Backend Engineer')
})

test('profile validation rejects owner IDs and unsafe URLs', () => {
  assert.equal(profileUpdateSchema.safeParse({ userId }).success, false)
  assert.equal(profileUpdateSchema.safeParse({ websiteUrl: 'javascript:alert(1)' }).success, false)
})
