import type { RequestHandler } from 'express'

export const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = Date.now()
  const requestPath = request.path

  response.on('finish', () => {
    const durationMs = Date.now() - startedAt
    console.info(
      `[request] ${request.method} ${requestPath} ${response.statusCode} ${durationMs}ms`
    )
  })

  next()
}
