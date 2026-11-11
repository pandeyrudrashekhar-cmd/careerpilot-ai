import type { RequestHandler } from 'express'
import { z } from 'zod'
import { applicationService } from '../services/application.service'
import { ApiError } from '../utils/ApiError'
import { asyncHandler } from '../utils/asyncHandler'
import { uuidSchema } from '../validation/id.schema'
import {
  applicationListQuerySchema,
  applicationStatsQuerySchema,
  createApplicationSchema,
  updateApplicationSchema,
  updateApplicationStatusSchema,
} from '../validation/application.schema'

function getApplicationId(value: string | undefined): string {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, 'Invalid application ID')
  return parsed.data
}

export const createApplication: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = createApplicationSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid application data')
  const application = await applicationService.create(request.auth!.userId, parsed.data)
  response.status(201).json({ success: true, data: application })
})

export const listApplications: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = applicationListQuerySchema.safeParse(request.query)
  if (!parsed.success) throw new ApiError(400, 'Invalid application filters')
  const result = await applicationService.list(request.auth!.userId, parsed.data)
  response.json({ success: true, data: result })
})

export const getApplication: RequestHandler = asyncHandler(async (request, response) => {
  const application = await applicationService.get(
    request.auth!.userId,
    getApplicationId(request.params.applicationId)
  )
  response.json({ success: true, data: application })
})

export const updateApplication: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = updateApplicationSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid application update')
  const application = await applicationService.update(
    request.auth!.userId,
    getApplicationId(request.params.applicationId),
    parsed.data
  )
  response.json({ success: true, data: application })
})

export const updateApplicationStatus: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = updateApplicationStatusSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid application status update')
  const application = await applicationService.updateStatus(
    request.auth!.userId,
    getApplicationId(request.params.applicationId),
    parsed.data
  )
  response.json({ success: true, data: application })
})

export const deleteApplication: RequestHandler = asyncHandler(async (request, response) => {
  await applicationService.delete(request.auth!.userId, getApplicationId(request.params.applicationId))
  response.json({ success: true, message: 'Application deleted' })
})

export const applicationStats: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = applicationStatsQuerySchema.safeParse(request.query)
  if (!parsed.success) throw new ApiError(400, 'Invalid statistics options')
  const stats = await applicationService.stats(request.auth!.userId, parsed.data.recentLimit)
  response.json({ success: true, data: stats })
})

export const applicationHistory: RequestHandler = asyncHandler(async (request, response) => {
  const history = await applicationService.history(
    request.auth!.userId,
    getApplicationId(request.params.applicationId)
  )
  response.json({ success: true, data: history })
})
