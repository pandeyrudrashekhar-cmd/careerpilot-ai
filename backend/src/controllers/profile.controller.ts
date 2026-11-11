import type { RequestHandler } from 'express'
import { asyncHandler } from '../utils/asyncHandler'
import { profileService } from '../services/profile.service'
import { profileUpdateSchema } from '../validation/profile.schema'
import { ApiError } from '../utils/ApiError'

export const getProfile: RequestHandler = asyncHandler(async (request, response) => {
  const profile = await profileService.get(request.auth!.userId)
  response.json({ success: true, data: profile })
})

export const updateProfile: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = profileUpdateSchema.safeParse(request.body)
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid profile data')
  }

  const profile = await profileService.update(request.auth!.userId, parsed.data)
  response.json({ success: true, data: profile })
})
