import type { RequestHandler } from 'express'
import { roadmapService } from '../services/roadmap.service'
import { ApiError } from '../utils/ApiError'
import { asyncHandler } from '../utils/asyncHandler'
import {
  generateRoadmapSchema,
  roadmapItemUpdateSchema,
  roadmapListQuerySchema,
} from '../validation/roadmap.schema'
import { uuidSchema } from '../validation/id.schema'

function getId(value: string | undefined, label: string): string {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, `Invalid ${label}`)
  return parsed.data
}

export const generateRoadmap: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = generateRoadmapSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid roadmap request')
  const result = await roadmapService.generate(request.auth!.userId, parsed.data.jobId)
  response.status(201).json({ success: true, data: result })
})

export const listRoadmaps: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = roadmapListQuerySchema.safeParse(request.query)
  if (!parsed.success) throw new ApiError(400, 'Invalid roadmap pagination')
  const result = await roadmapService.list(request.auth!.userId, parsed.data.page, parsed.data.pageSize)
  response.json({ success: true, data: result })
})

export const getRoadmap: RequestHandler = asyncHandler(async (request, response) => {
  const roadmap = await roadmapService.get(
    request.auth!.userId,
    getId(request.params.roadmapId, 'roadmap ID')
  )
  response.json({ success: true, data: roadmap })
})

export const updateRoadmapItem: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = roadmapItemUpdateSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid roadmap item update')
  const item = await roadmapService.updateItem(
    request.auth!.userId,
    getId(request.params.roadmapId, 'roadmap ID'),
    getId(request.params.itemId, 'roadmap item ID'),
    parsed.data
  )
  response.json({ success: true, data: item })
})
