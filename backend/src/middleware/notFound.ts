import type { RequestHandler } from 'express'
import { ApiError } from '../utils/ApiError'

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'Route not found'))
}
