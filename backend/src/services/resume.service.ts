import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { config } from '../config/env'
import { ApiError } from '../utils/ApiError'
import { extractResumeText, getResumeExtension, validateResumeFileContent } from './resumeFile.service'
import { createResumeAnalysisProvider } from './resumeAnalysisProvider.service'
import { createResumeStorage, type ResumeStorage } from './resumeStorage.service'
import { measureResumeStage } from '../middleware/resumePerformance'

export interface ResumeUpload {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

export interface ResumeServiceDependencies {
  database?: PrismaClient
  createStorage?: (accessToken: string) => ResumeStorage
  createAnalysisProvider?: typeof createResumeAnalysisProvider
}

export function createResumeService(dependencies: ResumeServiceDependencies = {}) {
  const database = dependencies.database ?? prisma
  const storageFor = dependencies.createStorage ?? createResumeStorage
  const analysisProviderFor = dependencies.createAnalysisProvider ?? createResumeAnalysisProvider

  return {
    async upload(userId: string, accessToken: string, file: ResumeUpload) {
      validateResumeFileContent(file.originalname, file.mimetype, file.buffer)
      const extension = getResumeExtension(file.originalname)
      const storagePath = `${userId}/${randomUUID()}${extension}`
      const storage = storageFor(accessToken)

      await storage.upload(storagePath, file.buffer, file.mimetype)

      try {
        return await database.$transaction(async (transaction) => {
          const activeResumeCount = await transaction.resume.count({
            where: { userId, isActive: true },
          })

          return transaction.resume.create({
            data: {
              userId,
              originalFilename: path.basename(file.originalname),
              storageBucket: config.supabaseResumeBucket,
              storagePath,
              mimeType: file.mimetype,
              fileSizeBytes: BigInt(file.size),
              processingStatus: 'UPLOADED',
              isActive: activeResumeCount === 0,
            },
          })
        }, { isolationLevel: 'Serializable' })
      } catch {
        try {
          await storage.remove(storagePath)
        } catch {
          throw new ApiError(502, 'Resume metadata could not be saved and storage cleanup failed')
        }
        throw new ApiError(500, 'Resume metadata could not be saved')
      }
    },

    list(userId: string) {
      return measureResumeStage('/api/resumes', 'prisma_resume_list_query', () =>
        database.resume.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            originalFilename: true,
            mimeType: true,
            fileSizeBytes: true,
            processingStatus: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      )
    },

    async get(userId: string, resumeId: string) {
      const resume = await measureResumeStage('/api/resumes/:resumeId', 'prisma_resume_detail_query', () =>
        database.resume.findFirst({
          where: { id: resumeId, userId },
          include: {
            analyses: {
              orderBy: { createdAt: 'desc' },
            },
          },
        })
      )
      if (!resume) throw new ApiError(404, 'Resume not found')
      return resume
    },

    async getSummary(userId: string, resumeId: string) {
      const resume = await measureResumeStage('/api/resumes/:resumeId/summary', 'prisma_resume_detail_query', () =>
        database.resume.findFirst({
          where: { id: resumeId, userId },
          select: {
            id: true,
            originalFilename: true,
            mimeType: true,
            fileSizeBytes: true,
            processingStatus: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            analyses: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                status: true,
                strengths: true,
                improvementSuggestions: true,
                provider: true,
                model: true,
                analyzedAt: true,
                createdAt: true,
              },
            },
          },
        })
      )
      if (!resume) throw new ApiError(404, 'Resume not found')
      return resume
    },

    async delete(userId: string, accessToken: string, resumeId: string) {
      const resume = await database.resume.findFirst({
        where: { id: resumeId, userId },
        select: { id: true, storagePath: true },
      })
      if (!resume) throw new ApiError(404, 'Resume not found')

      const linkedMatches = await database.jobMatch.count({
        where: { resumeId, userId },
      })
      if (linkedMatches > 0) {
        throw new ApiError(409, 'Resume is linked to job matches and cannot be deleted')
      }

      await database.resume.delete({ where: { id: resume.id } })
      try {
        await storageFor(accessToken).remove(resume.storagePath)
      } catch {
        console.error('[resume] Storage cleanup failed after resume metadata deletion')
        throw new ApiError(502, 'Resume metadata was deleted but private storage cleanup failed')
      }
    },

    async activate(userId: string, resumeId: string) {
      return database.$transaction(async (transaction) => {
        const resume = await transaction.resume.findFirst({
          where: { id: resumeId, userId },
          select: { id: true },
        })
        if (!resume) throw new ApiError(404, 'Resume not found')

        await transaction.resume.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        })
        return transaction.resume.update({
          where: { id: resumeId },
          data: { isActive: true },
        })
      }, { isolationLevel: 'Serializable' })
    },

    async analyze(userId: string, accessToken: string, resumeId: string) {
      const resume = await database.resume.findFirst({
        where: { id: resumeId, userId },
      })
      if (!resume) throw new ApiError(404, 'Resume not found')

      const analysis = await database.resumeAnalysis.create({
        data: { resumeId, status: 'PROCESSING' },
      })

      try {
        await database.resume.update({
          where: { id: resumeId },
          data: { processingStatus: 'PROCESSING' },
        })
        const buffer = await storageFor(accessToken).download(resume.storagePath)
        const extractedText = await extractResumeText(resume.originalFilename, buffer)
        const provider = analysisProviderFor()
        const result = await provider.analyze(extractedText)

        const updatedAnalysis = await database.resumeAnalysis.update({
          where: { id: analysis.id },
          data: {
            status: 'COMPLETED',
            extractedText,
            skills: result.skills,
            experienceSummary: result.experienceSummary,
            education: result.education,
            strengths: result.strengths,
            improvementSuggestions: result.improvementSuggestions,
            provider: provider.provider,
            model: provider.model,
            analyzedAt: new Date(),
          },
        })
        await database.resume.update({
          where: { id: resumeId },
          data: { processingStatus: 'PROCESSED' },
        })
        return updatedAnalysis
      } catch (error) {
        await database.resumeAnalysis.update({
          where: { id: analysis.id },
          data: { status: 'FAILED' },
        })
        await database.resume.update({
          where: { id: resumeId },
          data: { processingStatus: 'FAILED' },
        })
        throw error
      }
    },
  }
}

export const resumeService = createResumeService()
