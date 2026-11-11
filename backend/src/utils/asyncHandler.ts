import type { RequestHandler } from 'express'

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve()
      .then(() => handler(request, response, next))
      .catch(next)
  }
}
