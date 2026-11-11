import type { RequestHandler } from 'express'
import { getHealthStatus } from '../services/health.service'
import { asyncHandler } from '../utils/asyncHandler'

export const getHealth: RequestHandler = asyncHandler((_request, response) => {
  response.json({
    success: true,
    message: 'CareerPilot AI backend is running',
    data: getHealthStatus(),
  })
})
