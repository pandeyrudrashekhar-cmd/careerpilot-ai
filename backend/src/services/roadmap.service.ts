import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ApiError } from '../utils/ApiError'
import { normalizeSkillList, normalizeSkillName } from '../utils/skillNames'
import type { RoadmapItemUpdate } from '../validation/roadmap.schema'
import { getActiveResumeAnalysis } from './activeResumeAnalysis.service'

const allowedTransitions: Record<string, readonly string[]> = {
  NOT_STARTED: ['IN_PROGRESS', 'SKIPPED'],
  IN_PROGRESS: ['NOT_STARTED', 'COMPLETED', 'SKIPPED'],
  COMPLETED: ['IN_PROGRESS'],
  SKIPPED: ['NOT_STARTED', 'IN_PROGRESS'],
}

export function createRoadmapService(database: PrismaClient = prisma) {
  return {
    async generate(userId: string, jobId: string) {
      const job = await database.job.findUnique({
        where: { id: jobId },
        select: { id: true, title: true, requiredSkills: true },
      })
      if (!job) throw new ApiError(404, 'Job not found')

      const activeAnalysis = await getActiveResumeAnalysis(userId, database)
      const profileSkills = await database.userSkill.findMany({
        where: { userId },
        select: {
          proficiency: true,
          skill: { select: { normalizedName: true } },
        },
      })

      const resumeSkills = new Set(normalizeSkillList(activeAnalysis.skills))
      const reliableProfileSkills = new Map(
        profileSkills.map(({ proficiency, skill }) => [normalizeSkillName(skill.normalizedName), proficiency])
      )
      const existingSkills = normalizeSkillList([
        ...activeAnalysis.skills,
        ...profileSkills
          .filter(({ proficiency }) => proficiency !== 'BEGINNER' && proficiency !== 'ELEMENTARY')
          .map(({ skill }) => skill.normalizedName),
      ])
      const partiallyMatchingSkills: string[] = []
      const missingSkills: string[] = []
      const gaps = normalizeSkillList(job.requiredSkills).filter((skill) => {
        if (resumeSkills.has(skill)) return false
        const proficiency = reliableProfileSkills.get(skill)
        if (proficiency === 'BEGINNER' || proficiency === 'ELEMENTARY') {
          partiallyMatchingSkills.push(skill)
          return true
        }
        if (proficiency) return false
        missingSkills.push(skill)
        return true
      })

      const roadmapItems = gaps.map((skill, index) => {
        const partial = partiallyMatchingSkills.includes(skill)
        return {
          order: index + 1,
          title: `Develop ${skill}`,
          description: partial
            ? `Build on your recorded foundational knowledge of ${skill} with guided practice and a small applied project.`
            : `Learn the core concepts of ${skill}, practice them with focused exercises, and demonstrate the skill in a small project.`,
          priority: partial ? 'MEDIUM' as const : 'HIGH' as const,
          status: 'NOT_STARTED' as const,
        }
      })

      const roadmap = await database.learningRoadmap.create({
        data: {
          userId,
          sourceResumeId: activeAnalysis.resumeId,
          targetRole: job.title,
          skillGaps: gaps,
          generationSource: 'DETERMINISTIC',
          status: gaps.length > 0 ? 'ACTIVE' : 'COMPLETED',
          generatedAt: new Date(),
          items: { create: roadmapItems },
        },
        include: { items: { orderBy: { order: 'asc' } } },
      })

      return {
        roadmap,
        skillGapAnalysis: {
          existingSkills,
          missingSkills,
          partiallyMatchingSkills,
          summary: gaps.length === 0
            ? `Your recorded skills cover the listed requirements for ${job.title}.`
            : `${missingSkills.length} missing and ${partiallyMatchingSkills.length} foundational skill gaps identified for ${job.title}.`,
        },
      }
    },

    async list(userId: string, page: number, pageSize: number) {
      const where = { userId }
      const [roadmaps, total] = await Promise.all([
        database.learningRoadmap.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { _count: { select: { items: true } } },
        }),
        database.learningRoadmap.count({ where }),
      ])
      return {
        roadmaps,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    },

    async get(userId: string, roadmapId: string) {
      const roadmap = await database.learningRoadmap.findFirst({
        where: { id: roadmapId, userId },
        include: { items: { orderBy: { order: 'asc' } } },
      })
      if (!roadmap) throw new ApiError(404, 'Roadmap not found')
      return roadmap
    },

    async updateItem(userId: string, roadmapId: string, itemId: string, update: RoadmapItemUpdate) {
      return database.$transaction(async (transaction) => {
        const roadmap = await transaction.learningRoadmap.findFirst({
          where: { id: roadmapId, userId },
          select: { id: true, status: true },
        })
        if (!roadmap) throw new ApiError(404, 'Roadmap not found')
        if (roadmap.status === 'ARCHIVED') throw new ApiError(409, 'Archived roadmaps cannot be changed')

        const item = await transaction.roadmapItem.findFirst({
          where: { id: itemId, roadmapId },
          select: { id: true, status: true, completedAt: true },
        })
        if (!item) throw new ApiError(404, 'Roadmap item not found')
        if (
          item.status !== update.status
          && !allowedTransitions[item.status]?.includes(update.status)
        ) {
          throw new ApiError(409, `Cannot change roadmap item from ${item.status} to ${update.status}`)
        }

        const updatedItem = await transaction.roadmapItem.update({
          where: { id: itemId },
          data: {
            status: update.status,
            completedAt: update.status === 'COMPLETED'
              ? item.status === 'COMPLETED' ? item.completedAt ?? new Date() : new Date()
              : null,
          },
        })
        const itemStatuses = await transaction.roadmapItem.findMany({
          where: { roadmapId },
          select: { status: true },
        })
        const isComplete = itemStatuses.every(({ status }) => status === 'COMPLETED' || status === 'SKIPPED')
        await transaction.learningRoadmap.update({
          where: { id: roadmapId },
          data: { status: isComplete ? 'COMPLETED' : 'ACTIVE' },
        })
        return updatedItem
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    },
  }
}

export const roadmapService = createRoadmapService()
