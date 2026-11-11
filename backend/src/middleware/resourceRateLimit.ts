import { rateLimit } from 'express-rate-limit'
import { config } from '../config/env'

export const resourceRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !config.isProduction,
  keyGenerator: (request) => request.auth!.userId,
  handler: (_request, response) => {
    response.status(429).json({
      success: false,
      message: 'Too many resource-intensive requests. Please try again in a minute.',
    })
  },
})
