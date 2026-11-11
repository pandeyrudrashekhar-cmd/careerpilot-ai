import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ApiError } from '../utils/ApiError'
import type {
  ApplicationListQuery,
  CreateApplicationInput,
  UpdateApplicationInput,
  UpdateApplicationStatusInput,
} from '../validation/application.schema'

const transitions: Record<string, readonly string[]> = {
  SAVED: ['APPLIED', 'WITHDRAWN'],
  APPLIED: ['SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  WITHDRAWN: [],
}
const applicationStatuses = ['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const

export function createApplicationService(database: PrismaClient = prisma) {
  return {
    async create(userId: string, input: CreateApplicationInput) {
      let linkedJob: { company: string; title: string } | null = null
      if (input.jobId) {
        linkedJob = await database.job.findUnique({
          where: { id: input.jobId },
          select: { company: true, title: true },
        })
        if (!linkedJob) throw new ApiError(404, 'Job not found')
      }

      if (input.resumeId) {
        const resume = await database.resume.findFirst({
          where: { id: input.resumeId, userId },
          select: { id: true },
        })
        if (!resume) throw new ApiError(404, 'Resume not found')
      }

      return database.$transaction(async (transaction) => {
        if (input.jobId) {
          const duplicate = await transaction.application.findFirst({
            where: { userId, jobId: input.jobId },
            select: { id: true },
          })
          if (duplicate) throw new ApiError(409, 'This job is already in your application tracker')
        }
        const application = await transaction.application.create({
          data: {
            userId,
            jobId: input.jobId ?? null,
            resumeId: input.resumeId ?? null,
            company: input.company ?? linkedJob?.company ?? '',
            role: input.role ?? linkedJob?.title ?? '',
            status: input.status,
            appliedAt: input.appliedAt ? new Date(input.appliedAt) : null,
            notes: input.notes,
          },
        })
        await transaction.applicationStatusHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: null,
            toStatus: application.status,
            note: 'Application created',
          },
        })
        return application
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    },

    async list(userId: string, query: ApplicationListQuery) {
      const where: Prisma.ApplicationWhereInput = { userId }
      if (query.status) where.status = query.status
      if (query.company) where.company = { contains: query.company, mode: 'insensitive' }
      if (query.role) {
        where.OR = [
          { role: { contains: query.role, mode: 'insensitive' } },
          { job: { is: { title: { contains: query.role, mode: 'insensitive' } } } },
        ]
      }
      if (query.from || query.to) {
        where.appliedAt = {
          ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
          ...(query.to
            ? { lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000) }
            : {}),
        }
      }
      const [applications, total] = await Promise.all([
        database.application.findMany({
          where,
          orderBy: { [query.sortBy]: query.sortOrder },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        database.application.count({ where }),
      ])
      return {
        applications,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      }
    },

    async get(userId: string, applicationId: string) {
      const application = await database.application.findFirst({
        where: { id: applicationId, userId },
        include: { job: true, resume: { select: { id: true, originalFilename: true } } },
      })
      if (!application) throw new ApiError(404, 'Application not found')
      return application
    },

    async update(userId: string, applicationId: string, input: UpdateApplicationInput) {
      const result = await database.application.updateMany({
        where: { id: applicationId, userId },
        data: {
          ...input,
          ...(input.appliedAt !== undefined
            ? { appliedAt: input.appliedAt ? new Date(input.appliedAt) : null }
            : {}),
        },
      })
      if (result.count === 0) throw new ApiError(404, 'Application not found')
      return database.application.findFirstOrThrow({ where: { id: applicationId, userId } })
    },

    async updateStatus(userId: string, applicationId: string, input: UpdateApplicationStatusInput) {
      return database.$transaction(async (transaction) => {
        const application = await transaction.application.findFirst({
          where: { id: applicationId, userId },
          select: { id: true, status: true, appliedAt: true },
        })
        if (!application) throw new ApiError(404, 'Application not found')
        if (
          application.status !== input.status
          && !transitions[application.status]?.includes(input.status)
        ) {
          throw new ApiError(409, `Cannot change application status from ${application.status} to ${input.status}`)
        }
        if (application.status === input.status) return application

        const updated = await transaction.application.update({
          where: { id: application.id },
          data: {
            status: input.status,
            ...(input.status === 'APPLIED' && !application.appliedAt ? { appliedAt: new Date() } : {}),
          },
        })
        await transaction.applicationStatusHistory.create({
          data: {
            applicationId: application.id,
            fromStatus: application.status,
            toStatus: input.status,
            note: input.note,
          },
        })
        return updated
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    },

    async delete(userId: string, applicationId: string) {
      await database.$transaction(async (transaction) => {
        const application = await transaction.application.findFirst({
          where: { id: applicationId, userId },
          select: { id: true },
        })
        if (!application) throw new ApiError(404, 'Application not found')
        await transaction.applicationStatusHistory.deleteMany({ where: { applicationId } })
        await transaction.application.delete({ where: { id: applicationId } })
      })
    },

    async history(userId: string, applicationId: string) {
      const application = await database.application.findFirst({
        where: { id: applicationId, userId },
        select: { id: true },
      })
      if (!application) throw new ApiError(404, 'Application not found')
      return database.applicationStatusHistory.findMany({
        where: { applicationId },
        orderBy: { createdAt: 'asc' },
      })
    },

    async stats(userId: string, recentLimit: number) {
      const where = { userId }
      const [total, grouped, recent, interviews, offers, rejections] = await Promise.all([
        database.application.count({ where }),
        database.application.groupBy({ by: ['status'], where, _count: { _all: true } }),
        database.application.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: recentLimit,
          select: { id: true, company: true, role: true, status: true, createdAt: true, appliedAt: true },
        }),
        database.application.count({ where: { ...where, status: 'INTERVIEW' } }),
        database.application.count({ where: { ...where, status: 'OFFER' } }),
        database.application.count({ where: { ...where, status: 'REJECTED' } }),
      ])
      const byStatus = Object.fromEntries(applicationStatuses.map((status) => [status, 0]))
      for (const { status, _count } of grouped) byStatus[status] = _count._all
      return {
        total,
        byStatus,
        interviews,
        offers,
        rejections,
        recent,
      }
    },
  }
}

export const applicationService = createApplicationService()
