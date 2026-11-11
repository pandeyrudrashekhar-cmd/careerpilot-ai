import 'dotenv/config'
import { z } from 'zod'

const optionalUrl = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().url().optional()
)

const renderInternalAiServiceHostname = /^careerpilot-ai-service(?:-[a-z0-9]{4})?$/

function isSupportedProductionAiServiceUrl(value: string): boolean | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      || (
        url.protocol === 'http:'
        && url.port === '10000'
        && renderInternalAiServiceHostname.test(url.hostname)
      )
  } catch {
    return undefined
  }
}

const optionalRenderServiceUrl = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value
    const hostname = value.trim()
    if (!hostname) return undefined
    if (renderInternalAiServiceHostname.test(hostname)) {
      return `http://${hostname}:10000`
    }
    if (/^[a-z0-9][a-z0-9-]*\.onrender\.com$/i.test(hostname)) {
      return `https://${hostname}`
    }
    return hostname
  },
  z.string().optional().superRefine((value, context) => {
    if (!value) return
    if (/\s/.test(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must not contain whitespace',
      })
      return
    }

    let url: URL
    try {
      url = new URL(value)
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must be a valid absolute HTTP or HTTPS URL',
      })
      return
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must use HTTP or HTTPS',
      })
    }
  })
)

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  FRONTEND_URL: optionalUrl,
  AI_SERVICE_URL: optionalRenderServiceUrl,
  AI_SERVICE_INTERNAL_TOKEN: z.string().trim().min(32).optional(),
  SUPABASE_URL: optionalUrl,
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_RESUME_BUCKET: z.string().min(1).max(100).default('resumes'),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().min(1).max(160).default('openai/gpt-oss-20b'),
  RESUME_MAX_SIZE_BYTES: z.coerce.number().int().positive().max(50 * 1024 * 1024).default(10 * 1024 * 1024),
}).superRefine((environment, context) => {
  if (environment.NODE_ENV === 'production' && !environment.FRONTEND_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['FRONTEND_URL'],
      message: 'is required when NODE_ENV is production',
    })
  }
  if (environment.NODE_ENV === 'production' && !environment.AI_SERVICE_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AI_SERVICE_URL'],
      message: 'is required when NODE_ENV is production',
    })
  }
  if (environment.NODE_ENV === 'production' && !environment.AI_SERVICE_INTERNAL_TOKEN) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AI_SERVICE_INTERNAL_TOKEN'],
      message: 'is required when NODE_ENV is production',
    })
  }
  if (
    environment.NODE_ENV === 'production'
    && environment.AI_SERVICE_URL
    && isSupportedProductionAiServiceUrl(environment.AI_SERVICE_URL) === false
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AI_SERVICE_URL'],
      message: 'must use HTTPS or the supported Render internal service URL when NODE_ENV is production',
    })
  }
})

const result = environmentSchema.safeParse(process.env)

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `- ${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('\n')

  throw new Error(`[config] Invalid environment configuration:\n${details}`)
}

const parsedEnvironment = result.data

export const config = {
  port: parsedEnvironment.PORT,
  nodeEnv: parsedEnvironment.NODE_ENV,
  frontendUrl: parsedEnvironment.FRONTEND_URL ?? 'http://localhost:5173',
  aiServiceUrl: parsedEnvironment.AI_SERVICE_URL ?? 'http://localhost:8000',
  aiServiceInternalToken: parsedEnvironment.AI_SERVICE_INTERNAL_TOKEN,
  supabaseUrl: parsedEnvironment.SUPABASE_URL,
  supabaseAnonKey: parsedEnvironment.SUPABASE_ANON_KEY,
  supabaseResumeBucket: parsedEnvironment.SUPABASE_RESUME_BUCKET,
  groqApiKey: parsedEnvironment.GROQ_API_KEY,
  groqModel: parsedEnvironment.GROQ_MODEL,
  resumeMaxSizeBytes: parsedEnvironment.RESUME_MAX_SIZE_BYTES,
  isDevelopment: parsedEnvironment.NODE_ENV === 'development',
  isProduction: parsedEnvironment.NODE_ENV === 'production',
} as const

export type EnvironmentConfig = typeof config
