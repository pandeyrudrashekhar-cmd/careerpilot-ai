import type { Request, RequestHandler } from 'express'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'
import { config } from '../config/env'

export type ResumeReadRoute =
  | '/api/resumes'
  | '/api/resumes/:resumeId'
  | '/api/resumes/:resumeId/summary'

export type ResumePerformanceStage =
  | 'jwt_verification'
  | 'user_provisioning'
  | 'prisma_resume_list_query'
  | 'prisma_resume_detail_query'
  | 'route_total'

const requestContext = new AsyncLocalStorage<{ requestId: string }>()

export function getResumeReadRoute(request: Pick<Request, 'method' | 'originalUrl'>): ResumeReadRoute | undefined {
  if (request.method !== 'GET') return undefined

  const queryIndex = request.originalUrl.indexOf('?')
  const path = queryIndex === -1 ? request.originalUrl : request.originalUrl.slice(0, queryIndex)

  if (path === '/api/resumes' || path === '/api/resumes/') return '/api/resumes'
  if (/^\/api\/resumes\/[^/]+\/summary\/?$/.test(path)) return '/api/resumes/:resumeId/summary'
  if (/^\/api\/resumes\/[^/]+\/?$/.test(path)) return '/api/resumes/:resumeId'
  return undefined
}

export async function measureResumeStage<T>(
  route: ResumeReadRoute | undefined,
  stage: ResumePerformanceStage,
  operation: () => Promise<T>,
): Promise<T> {
  if (!route) return operation()

  const startedAt = performance.now()
  try {
    return await operation()
  } finally {
    logResumeTiming(route, stage, startedAt)
  }
}

function logResumeTiming(
  route: ResumeReadRoute,
  stage: ResumePerformanceStage,
  startedAt: number,
  requestId = requestContext.getStore()?.requestId,
): void {
  if (!config.isDevelopment) return

  console.info(JSON.stringify({
    event: 'resume.performance',
    ...(requestId ? { request_id: requestId } : {}),
    route,
    stage,
    duration_ms: Number((performance.now() - startedAt).toFixed(1)),
  }))
}

export const resumeReadPerformance: RequestHandler = (request, response, next) => {
  const route = getResumeReadRoute(request)
  if (!route) {
    next()
    return
  }

  const startedAt = performance.now()
  const requestId = randomUUID()
  requestContext.run({ requestId }, () => {
    response.once('finish', () => logResumeTiming(route, 'route_total', startedAt, requestId))
    next()
  })
}
