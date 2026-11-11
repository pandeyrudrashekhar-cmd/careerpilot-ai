import 'dotenv/config'
import { z } from 'zod'

const optionalUrl = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().url().optional()
)

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  FRONTEND_URL: optionalUrl,
  AI_SERVICE_URL: optionalUrl,
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
    && new URL(environment.AI_SERVICE_URL).protocol !== 'https:'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AI_SERVICE_URL'],
      message: 'must use HTTPS when NODE_ENV is production',
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
