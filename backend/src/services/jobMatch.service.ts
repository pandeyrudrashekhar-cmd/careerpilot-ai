import type { PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ApiError } from '../utils/ApiError'
import { normalizeSkillList } from '../utils/skillNames'
import { getActiveResumeAnalysis } from './activeResumeAnalysis.service'

export interface SkillMatchScore {
  score: number
  matchedSkills: string[]
  missingSkills: string[]
  explanation: string
}

export function calculateSkillMatch(
  userSkills: readonly string[],
  requiredSkills: readonly string[],
  optionalSkills: readonly string[] = []
): SkillMatchScore {
  const normalizedUserSkills = new Set(normalizeSkillList(userSkills))
  const required = normalizeSkillList(requiredSkills)
  const optional = normalizeSkillList(optionalSkills).filter((skill) => !required.includes(skill))
  const matchedRequired = required.filter((skill) => normalizedUserSkills.has(skill))
  const missingSkills = required.filter((skill) => !normalizedUserSkills.has(skill))
  const matchedOptional = optional.filter((skill) => normalizedUserSkills.has(skill))
  const matchedSkills = normalizeSkillList([...matchedRequired, ...matchedOptional])

  let score = 0
  if (required.length > 0) {
    const requiredCoverage = matchedRequired.length / required.length
    const optionalCoverage = optional.length > 0 ? matchedOptional.length / optional.length : 0
    score = Math.round(100 * (
      optional.length > 0
        ? (0.8 * requiredCoverage) + (0.2 * optionalCoverage)
        : requiredCoverage
    ))
  } else if (optional.length > 0) {
    score = Math.round(100 * matchedOptional.length / optional.length)
  }

  const explanation = required.length === 0 && optional.length === 0
    ? 'No job skill criteria are available, so a compatibility score cannot be meaningfully calculated.'
    : `Matched ${matchedRequired.length} of ${required.length} required skills`
      + (optional.length > 0 ? ` and ${matchedOptional.length} of ${optional.length} optional skills.` : '.')
      + (required.length > 0 && optional.length > 0
        ? ' The product-defined score weights required-skill coverage at 80% and optional-skill overlap at 20%.'
        : '')

  return { score, matchedSkills, missingSkills, explanation }
}

export function createJobMatchService(database: PrismaClient = prisma) {
  return {
    async createOrRefresh(userId: string, jobId: string) {
      const job = await database.job.findUnique({
        where: { id: jobId },
        select: { id: true, requiredSkills: true, optionalSkills: true },
      })
      if (!job) throw new ApiError(404, 'Job not found')
      const activeAnalysis = await getActiveResumeAnalysis(userId, database)

      const result = calculateSkillMatch(activeAnalysis.skills, job.requiredSkills, job.optionalSkills)
      const { score, ...skillDetails } = result
      return database.jobMatch.upsert({
        where: {
          userId_resumeId_jobId: {
            userId,
            resumeId: activeAnalysis.resumeId,
            jobId,
          },
        },
        create: {
          userId,
          resumeId: activeAnalysis.resumeId,
          jobId,
          matchScore: score,
          ...skillDetails,
        },
        update: { matchScore: score, ...skillDetails },
        include: {
          job: { select: { id: true, title: true, company: true } },
          resume: { select: { id: true, originalFilename: true } },
        },
      })
    },

    async getForJob(userId: string, jobId: string) {
      const match = await database.jobMatch.findFirst({
        where: { userId, jobId },
        orderBy: { updatedAt: 'desc' },
        include: {
          job: { select: { id: true, title: true, company: true } },
          resume: { select: { id: true, originalFilename: true } },
        },
      })
      if (!match) throw new ApiError(404, 'Job match not found')
      return match
    },

    list(userId: string, page: number, pageSize: number) {
      const where = { userId }
      return Promise.all([
        database.jobMatch.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            job: { select: { id: true, title: true, company: true } },
            resume: { select: { id: true, originalFilename: true } },
          },
        }),
        database.jobMatch.count({ where }),
      ]).then(([matches, total]) => ({
        matches,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }))
    },
  }
}

export const jobMatchService = createJobMatchService()
