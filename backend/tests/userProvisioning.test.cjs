const assert = require('node:assert/strict')
const test = require('node:test')
const { provisionUser } = require('../dist/services/user.service')

const userId = 'c0a80101-0000-4000-8000-000000000001'
const email = 'student@example.test'
const profileId = 'c0a80101-0000-4000-8000-000000000002'
const createdAt = new Date('2026-01-01T00:00:00.000Z')
const updatedAt = new Date('2026-01-02T00:00:00.000Z')

function existingUser(overrides = {}) {
  return {
    id: userId,
    email,
    createdAt,
    updatedAt,
    profile: { id: profileId },
    ...overrides,
  }
}

function createDatabase({ foundUser, upsertResult } = {}) {
  const calls = { findUnique: [], upsert: [] }
  return {
    calls,
    user: {
      findUnique: async (args) => {
        calls.findUnique.push(args)
        return foundUser ?? null
      },
      upsert: async (args) => {
        calls.upsert.push(args)
        return upsertResult ?? { id: userId, email, createdAt, updatedAt }
      },
    },
  }
}

test('existing user with synchronized email and profile requires no write', async () => {
  const database = createDatabase({ foundUser: existingUser() })

  const user = await provisionUser(userId, email, database)

  assert.deepEqual(user, { id: userId, email, createdAt, updatedAt })
  assert.deepEqual(database.calls.findUnique[0].where, { id: userId })
  assert.deepEqual(database.calls.findUnique[0].select, {
    id: true,
    email: true,
    createdAt: true,
    updatedAt: true,
    profile: { select: { id: true } },
  })
  assert.equal(database.calls.upsert.length, 0)
})

test('new user is provisioned with a profile using the verified Supabase UUID', async () => {
  const database = createDatabase()

  await provisionUser(userId, email, database)

  assert.equal(database.calls.upsert.length, 1)
  assert.deepEqual(database.calls.upsert[0], {
    where: { id: userId },
    create: {
      id: userId,
      email,
      profile: { create: {} },
    },
    update: {
      email,
      profile: {
        upsert: {
          create: {},
          update: {},
        },
      },
    },
  })
})

test('existing user with a missing profile repairs it and synchronizes email', async () => {
  const database = createDatabase({
    foundUser: existingUser({ profile: null }),
  })

  await provisionUser(userId, email, database)

  assert.equal(database.calls.upsert.length, 1)
  assert.deepEqual(database.calls.upsert[0].where, { id: userId })
  assert.deepEqual(database.calls.upsert[0].update, {
    email,
    profile: {
      upsert: {
        create: {},
        update: {},
      },
    },
  })
})

test('existing user with a changed authenticated email is synchronized', async () => {
  const changedEmail = 'updated@example.test'
  const database = createDatabase({
    foundUser: existingUser(),
    upsertResult: { id: userId, email: changedEmail, createdAt, updatedAt },
  })

  const user = await provisionUser(userId, changedEmail, database)

  assert.equal(user.email, changedEmail)
  assert.equal(database.calls.upsert.length, 1)
  assert.deepEqual(database.calls.upsert[0].where, { id: userId })
  assert.deepEqual(database.calls.upsert[0].update, {
    email: changedEmail,
    profile: {
      upsert: {
        create: {},
        update: {},
      },
    },
  })
})
