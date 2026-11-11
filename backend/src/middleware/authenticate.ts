import type { RequestHandler } from 'express'
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose'
import { z } from 'zod'
import { config } from '../config/env'
import { ApiError } from '../utils/ApiError'
import { provisionUser } from '../services/user.service'
import { getResumeReadRoute, measureResumeStage } from './resumePerformance'

const claimsSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email().optional(),
})

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getKeySet(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  let keySet = keySets.get(supabaseUrl)
  if (!keySet) {
    const jwksUrl = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl)
    keySet = createRemoteJWKSet(jwksUrl)
    keySets.set(supabaseUrl, keySet)
  }
  return keySet
}

function isInvalidTokenError(error: unknown): boolean {
  return error instanceof errors.JWTExpired
    || error instanceof errors.JWTClaimValidationFailed
    || error instanceof errors.JWTInvalid
    || error instanceof errors.JWSInvalid
    || error instanceof errors.JWSSignatureVerificationFailed
    || error instanceof errors.JWKSNoMatchingKey
}

export interface AuthMiddlewareDependencies {
  verifyToken?: (token: string) => Promise<JWTPayload>
  provisionUser?: (userId: string, email?: string) => Promise<unknown>
}

export function createAuthenticateMiddleware(
  dependencies: AuthMiddlewareDependencies = {}
): RequestHandler {
  const verifyToken = dependencies.verifyToken ?? (async (token) => {
    if (!config.supabaseUrl) {
      throw new ApiError(503, 'Supabase authentication is not configured')
    }

    const issuer = new URL('/auth/v1', config.supabaseUrl).toString().replace(/\/$/, '')
    const { payload } = await jwtVerify(token, getKeySet(config.supabaseUrl), {
      issuer,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
    })
    return payload
  })
  const ensureUser = dependencies.provisionUser ?? provisionUser

  return async (request, _response, next) => {
    const authorization = request.header('authorization')
    const match = authorization?.match(/^Bearer\s+(\S+)$/i)

    if (!match) {
      next(new ApiError(401, 'A valid bearer token is required'))
      return
    }

    try {
      const resumeRoute = getResumeReadRoute(request)
      const payload = await measureResumeStage(
        resumeRoute,
        'jwt_verification',
        () => verifyToken(match[1])
      )
      const claims = claimsSchema.safeParse(payload)
      if (!claims.success) {
        throw new ApiError(401, 'Invalid authentication token')
      }

      await measureResumeStage(
        resumeRoute,
        'user_provisioning',
        () => ensureUser(claims.data.sub, claims.data.email)
      )
      request.auth = { userId: claims.data.sub, accessToken: match[1] }
      next()
    } catch (error) {
      if (error instanceof ApiError) {
        next(error)
      } else if (isInvalidTokenError(error)) {
        next(new ApiError(401, 'Invalid or expired authentication token'))
      } else {
        next(new ApiError(503, 'Supabase authentication is temporarily unavailable'))
      }
    }
  }
}

export const authenticate = createAuthenticateMiddleware()
