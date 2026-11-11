import type { RequestHandler } from 'express'
import { z } from 'zod'
import { jobService } from '../services/job.service'
import { jobMatchService } from '../services/jobMatch.service'
import { createJobSchema, jobSearchSchema } from '../validation/job.schema'
import { uuidSchema } from '../validation/id.schema'
import { ApiError } from '../utils/ApiError'
import { asyncHandler } from '../utils/asyncHandler'

function getJobId(value: string | undefined): string {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, 'Invalid job ID')
  return parsed.data
}

function parseSearchQuery(query: unknown) {
  const parsed = jobSearchSchema.safeParse(query)
  if (!parsed.success) throw new ApiError(400, 'Invalid job search filters')
  return parsed.data
}

export const createJob: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = createJobSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid job data')
  const job = await jobService.createManual(parsed.data)
  response.status(201).json({ success: true, data: job })
})

export const listJobs: RequestHandler = asyncHandler(async (request, response) => {
  const result = await jobService.search(parseSearchQuery(request.query))
  response.json({ success: true, data: result })
})

export const searchJobs: RequestHandler = asyncHandler(async (request, response) => {
  const result = await jobService.search(parseSearchQuery(request.query))
  response.json({ success: true, data: result })
})

export const getJob: RequestHandler = asyncHandler(async (request, response) => {
  const job = await jobService.get(getJobId(request.params.jobId))
  response.json({ success: true, data: job })
})

export const createJobMatch: RequestHandler = asyncHandler(async (request, response) => {
  const match = await jobMatchService.createOrRefresh(request.auth!.userId, getJobId(request.params.jobId))
  response.json({ success: true, data: match })
})

export const getJobMatch: RequestHandler = asyncHandler(async (request, response) => {
  const match = await jobMatchService.getForJob(request.auth!.userId, getJobId(request.params.jobId))
  response.json({ success: true, data: match })
})

export const listJobMatches: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = z.object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }).strict().safeParse(request.query)
  if (!parsed.success) throw new ApiError(400, 'Invalid match pagination')
  const result = await jobMatchService.list(request.auth!.userId, parsed.data.page, parsed.data.pageSize)
  response.json({ success: true, data: result })
})
