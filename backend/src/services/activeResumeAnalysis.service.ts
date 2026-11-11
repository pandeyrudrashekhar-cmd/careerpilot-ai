import type { PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ApiError } from '../utils/ApiError'

export async function getActiveResumeAnalysis(userId: string, database: PrismaClient = prisma) {
  const resume = await database.resume.findFirst({
    where: { userId, isActive: true },
    select: {
      id: true,
      analyses: {
        where: { status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, skills: true },
      },
    },
  })

  if (!resume) throw new ApiError(409, 'An active resume is required for this operation')
  const analysis = resume.analyses[0]
  if (!analysis) throw new ApiError(409, 'The active resume has no completed analysis')

  const skills = Array.isArray(analysis.skills)
    ? analysis.skills.filter((skill): skill is string => typeof skill === 'string')
    : []

  return { resumeId: resume.id, analysisId: analysis.id, skills }
}
