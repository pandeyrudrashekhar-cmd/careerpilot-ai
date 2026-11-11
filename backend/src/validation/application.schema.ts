import { z } from 'zod'

const optionalDate = z.string().datetime({ offset: true }).nullable().optional()

const createFields = z.object({
  jobId: z.string().uuid().nullable().optional(),
  resumeId: z.string().uuid().nullable().optional(),
  company: z.string().trim().min(1).max(200).optional(),
  role: z.string().trim().min(1).max(240).optional(),
  status: z.enum(['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN']).default('SAVED'),
  appliedAt: optionalDate,
  notes: z.string().trim().max(20_000).nullable().optional(),
}).strict()

export const createApplicationSchema = createFields.superRefine((value, context) => {
  if (!value.jobId && (!value.company || !value.role)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['jobId'],
      message: 'A job or both company and role are required',
    })
  }
})

export const updateApplicationSchema = z.object({
  company: z.string().trim().min(1).max(200).optional(),
  role: z.string().trim().min(1).max(240).optional(),
  appliedAt: optionalDate,
  notes: z.string().trim().max(20_000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const updateApplicationStatusSchema = z.object({
  status: z.enum(['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN']),
  note: z.string().trim().max(2000).nullable().optional(),
}).strict()

export const applicationListQuerySchema = z.object({
  status: z.enum(['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN']).optional(),
  company: z.string().trim().min(1).max(200).optional(),
  role: z.string().trim().min(1).max(240).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'appliedAt', 'company', 'role']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict().superRefine((query, context) => {
  if (query.from && query.to && query.from > query.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'to must be on or after from' })
  }
})

export const applicationStatsQuerySchema = z.object({
  recentLimit: z.coerce.number().int().min(1).max(20).default(5),
}).strict()

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>
