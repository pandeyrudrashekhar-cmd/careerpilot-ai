import type { RequestHandler } from 'express'
import { z } from 'zod'
import { resumeService } from '../services/resume.service'
import { ApiError } from '../utils/ApiError'
import { asyncHandler } from '../utils/asyncHandler'

const resumeIdSchema = z.string().uuid()

function getResumeId(value: string | undefined): string {
  const parsed = resumeIdSchema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, 'Invalid resume ID')
  return parsed.data
}

function serializeResume<T extends { fileSizeBytes: bigint; storagePath?: string; storageBucket?: string; userId?: string }>(
  resume: T
): Omit<T, 'fileSizeBytes' | 'storagePath' | 'storageBucket' | 'userId'> & { fileSizeBytes: number } {
  const { fileSizeBytes, storagePath: _storagePath, storageBucket: _storageBucket, userId: _userId, ...safeResume } = resume
  return { ...safeResume, fileSizeBytes: Number(fileSizeBytes) }
}

export const uploadResume: RequestHandler = asyncHandler(async (request, response) => {
  if (!request.file) throw new ApiError(400, 'Resume file is required')
  const resume = await resumeService.upload(
    request.auth!.userId,
    request.auth!.accessToken,
    request.file
  )
  response.status(201).json({ success: true, data: serializeResume(resume) })
})

export const listResumes: RequestHandler = asyncHandler(async (request, response) => {
  const resumes = await resumeService.list(request.auth!.userId)
  response.json({ success: true, data: resumes.map(serializeResume) })
})

export const getResume: RequestHandler = asyncHandler(async (request, response) => {
  const resume = await resumeService.get(request.auth!.userId, getResumeId(request.params.resumeId))
  response.json({ success: true, data: serializeResume(resume) })
})

export const getResumeSummary: RequestHandler = asyncHandler(async (request, response) => {
  const resume = await resumeService.getSummary(request.auth!.userId, getResumeId(request.params.resumeId))
  response.json({ success: true, data: serializeResume(resume) })
})

export const deleteResume: RequestHandler = asyncHandler(async (request, response) => {
  await resumeService.delete(
    request.auth!.userId,
    request.auth!.accessToken,
    getResumeId(request.params.resumeId)
  )
  response.json({ success: true, message: 'Resume deleted' })
})

export const activateResume: RequestHandler = asyncHandler(async (request, response) => {
  const resume = await resumeService.activate(request.auth!.userId, getResumeId(request.params.resumeId))
  response.json({ success: true, data: serializeResume(resume) })
})

export const analyzeResume: RequestHandler = asyncHandler(async (request, response) => {
  const analysis = await resumeService.analyze(
    request.auth!.userId,
    request.auth!.accessToken,
    getResumeId(request.params.resumeId)
  )
  response.json({ success: true, data: analysis })
})
