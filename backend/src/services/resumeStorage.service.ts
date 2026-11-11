import { createClient } from '@supabase/supabase-js'
import { config } from '../config/env'
import { ApiError } from '../utils/ApiError'

function getStorageUploadDiagnostic(error: unknown): {
  errorName: string
  message: string
  httpStatus?: number
  statusCode?: string
  errorCode?: string
} {
  const errorName = error instanceof Error ? error.name : 'UnknownStorageError'
  const rawMessage = error instanceof Error ? error.message : 'Unknown storage error'
  const message = rawMessage
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT REDACTED]')
    .replace(/https?:\/\/\S+/gi, '[URL REDACTED]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300)
  const diagnostic: ReturnType<typeof getStorageUploadDiagnostic> = {
    errorName: /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(errorName) ? errorName : 'StorageError',
    message,
  }

  if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof error.status === 'number' && Number.isInteger(error.status)) {
      diagnostic.httpStatus = error.status
    }
    if ('statusCode' in error && typeof error.statusCode === 'string') {
      const statusCode = error.statusCode.slice(0, 80)
      if (/^[A-Za-z0-9_.-]+$/.test(statusCode)) diagnostic.statusCode = statusCode
    }
    if ('code' in error && typeof error.code === 'string') {
      const errorCode = error.code.slice(0, 80)
      if (/^[A-Za-z0-9_.-]+$/.test(errorCode)) diagnostic.errorCode = errorCode
    }
  }

  return diagnostic
}

export interface ResumeStorage {
  upload(path: string, buffer: Buffer, contentType: string): Promise<void>
  download(path: string): Promise<Buffer>
  remove(path: string): Promise<void>
}

export function createResumeStorage(accessToken: string): ResumeStorage {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new ApiError(503, 'Supabase Storage is not configured')
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
  const bucket = supabase.storage.from(config.supabaseResumeBucket)

  return {
    async upload(path, buffer, contentType) {
      const { error } = await bucket.upload(path, buffer, {
        contentType,
        upsert: false,
      })
      if (error) {
        console.error('[resume-storage] upload failed', {
          bucket: config.supabaseResumeBucket,
          ...getStorageUploadDiagnostic(error),
        })
        throw new ApiError(502, 'Resume could not be uploaded to private storage')
      }
    },

    async download(path) {
      const { data, error } = await bucket.download(path)
      if (error || !data) {
        throw new ApiError(502, 'Resume could not be retrieved from private storage')
      }
      return Buffer.from(await data.arrayBuffer())
    },

    async remove(path) {
      const { error } = await bucket.remove([path])
      if (error) {
        throw new ApiError(502, 'Resume could not be removed from private storage')
      }
    },
  }
}
