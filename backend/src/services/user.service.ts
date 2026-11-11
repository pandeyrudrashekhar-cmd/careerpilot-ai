import type { PrismaClient, User } from '@prisma/client'
import { prisma } from '../lib/prisma'

export async function provisionUser(
  userId: string,
  email: string | undefined,
  database: PrismaClient = prisma
): Promise<User> {
  const existingUser = await database.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      updatedAt: true,
      profile: { select: { id: true } },
    },
  })

  if (existingUser?.profile && (!email || existingUser.email === email)) {
    const { profile: _profile, ...user } = existingUser
    return user
  }

  return database.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email,
      profile: { create: {} },
    },
    update: {
      ...(email ? { email } : {}),
      profile: {
        upsert: {
          create: {},
          update: {},
        },
      },
    },
  })
}
