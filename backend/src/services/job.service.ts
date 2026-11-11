import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ApiError } from '../utils/ApiError'
import {
  externalJobSchema,
  type CreateJobInput,
  type ExternalJobInput,
  type JobSearchQuery,
} from '../validation/job.schema'
import { createExternalJobProviderRegistry, type ExternalJobProvider } from './externalJobProvider.service'

export interface JobServiceDependencies {
  database?: PrismaClient
  externalProviders?: readonly ExternalJobProvider[]
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function createJobService(dependencies: JobServiceDependencies = {}) {
  const database = dependencies.database ?? prisma
  const providerRegistry = createExternalJobProviderRegistry(dependencies.externalProviders)

  return {
    createManual(input: CreateJobInput) {
      return database.job.create({
        data: {
          ...input,
          source: 'MANUAL',
          provider: null,
          externalId: null,
          postedAt: input.postedAt ? new Date(input.postedAt) : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      })
    },

    async createExternal(input: ExternalJobInput) {
      const parsed = externalJobSchema.safeParse(input)
      if (!parsed.success) throw new ApiError(400, 'Invalid external job data')
      const externalJob = parsed.data
      try {
        return await database.job.create({
          data: {
            ...externalJob,
            source: 'EXTERNAL_PROVIDER',
            postedAt: externalJob.postedAt ? new Date(externalJob.postedAt) : null,
            expiresAt: externalJob.expiresAt ? new Date(externalJob.expiresAt) : null,
          },
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ApiError(409, 'This external job has already been imported')
        }
        throw error
      }
    },

    async search(query: JobSearchQuery) {
      if (query.provider) {
        const { provider, sortBy: _sortBy, sortOrder: _sortOrder, ...filters } = query
        return {
          source: 'external',
          result: await providerRegistry.search(provider, filters),
        }
      }

      const where: Prisma.JobWhereInput = {}
      if (query.title) where.title = { contains: query.title, mode: 'insensitive' }
      if (query.company) where.company = { contains: query.company, mode: 'insensitive' }
      if (query.description) where.description = { contains: query.description, mode: 'insensitive' }
      if (query.location) where.location = { contains: query.location, mode: 'insensitive' }
      if (query.employmentType) where.employmentType = query.employmentType
      if (query.remoteStatus) where.remoteStatus = query.remoteStatus
      if (query.requiredSkills?.length) where.requiredSkills = { hasSome: query.requiredSkills }

      const skip = (query.page - 1) * query.pageSize
      const [jobs, total] = await Promise.all([
        database.job.findMany({
          where,
          skip,
          take: query.pageSize,
          orderBy: { [query.sortBy]: query.sortOrder },
        }),
        database.job.count({ where }),
      ])

      return {
        source: 'database',
        jobs,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      }
    },

    async get(jobId: string) {
      const job = await database.job.findUnique({ where: { id: jobId } })
      if (!job) throw new ApiError(404, 'Job not found')
      return job
    },
  }
}

export const jobService = createJobService()
