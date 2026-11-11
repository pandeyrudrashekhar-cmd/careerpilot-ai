import type { ErrorRequestHandler } from 'express'
import multer from 'multer'
import { config } from '../config/env'
import { ApiError } from '../utils/ApiError'

function getBodyParserError(error: unknown): { statusCode: number; message: string } | undefined {
  if (typeof error !== 'object' || error === null || !('type' in error)) {
    return undefined
  }

  if (error.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'Invalid JSON request body' }
  }

  if (error.type === 'entity.too.large') {
    return { statusCode: 413, message: 'Request body exceeds the allowed size' }
  }

  return undefined
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const bodyParserError = getBodyParserError(error)
  const multerError = error instanceof multer.MulterError
    ? {
        statusCode: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        message: error.code === 'LIMIT_FILE_SIZE'
          ? 'Resume exceeds the allowed file size'
          : 'Invalid resume upload',
      }
    : undefined
  const apiError = error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 600
    ? error
    : undefined
  const statusCode = bodyParserError?.statusCode ?? multerError?.statusCode ?? apiError?.statusCode ?? 500
  const message = bodyParserError?.message
    ?? multerError?.message
    ?? (apiError && statusCode < 500
      ? apiError.message
      : config.isProduction
        ? 'Internal server error'
        : error instanceof Error
          ? error.message
          : 'Internal server error')

  response.status(statusCode).json({
    success: false,
    message,
  })
}
