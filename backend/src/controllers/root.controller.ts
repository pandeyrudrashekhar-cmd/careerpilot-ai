import type { RequestHandler } from 'express'
import { asyncHandler } from '../utils/asyncHandler'

export const getWelcome: RequestHandler = asyncHandler((_request, response) => {
  response.json({
    success: true,
    message: 'Welcome to the CareerPilot AI backend API',
    data: {
      service: 'careerpilot-backend',
      version: '0.1.0',
      health: '/api/health',
    },
  })
})
