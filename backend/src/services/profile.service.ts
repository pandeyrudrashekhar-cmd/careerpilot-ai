import type { PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { ProfileUpdate } from '../validation/profile.schema'

export function createProfileService(database: PrismaClient = prisma) {
  return {
    get(userId: string) {
      return database.profile.upsert({
        where: { userId },
        create: { userId },
        update: {},
      })
    },

    update(userId: string, data: ProfileUpdate) {
      return database.profile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      })
    },
  }
}

export const profileService = createProfileService()
