import { z } from 'zod'
import { normalizeSkillList, normalizeSkillName } from '../utils/skillNames'

const skillList = z.array(z.string().trim().min(1).max(120)).max(100)
  .superRefine((values, context) => {
    values.forEach((value, index) => {
      if (!normalizeSkillName(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'Skill name must contain letters or numbers',
        })
      }
    })
  })
  .transform(normalizeSkillList)

const webUrl = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && !url.username
      && !url.password
  } catch {
    return false
  }
}, 'URL must use HTTP or HTTPS')

const jobFieldsSchema = z.object({
  title: z.string().trim().min(1).max(240),
  company: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(50_000),
  requiredSkills: skillList.default([]),
  optionalSkills: skillList.default([]),
  location: z.string().trim().min(1).max(240).nullable().optional(),
  remoteStatus: z.enum(['ONSITE', 'HYBRID', 'REMOTE', 'UNSPECIFIED']).default('UNSPECIFIED'),
  employmentType: z.enum([
    'FULL_TIME',
    'PART_TIME',
    'CONTRACT',
    'TEMPORARY',
    'INTERNSHIP',
    'APPRENTICESHIP',
    'OTHER',
  ]).default('OTHER'),
  applicationUrl: webUrl.nullable().optional(),
  postedAt: z.string().datetime({ offset: true }).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict()

export const createJobSchema = jobFieldsSchema.superRefine((job, context) => {
  if (job.postedAt && job.expiresAt && Date.parse(job.expiresAt) < Date.parse(job.postedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiresAt'],
      message: 'Expiry date cannot be earlier than posting date',
    })
  }
})

export const externalJobSchema = jobFieldsSchema.extend({
  provider: z.string().trim().min(1).max(120),
  externalId: z.string().trim().min(1).max(255),
}).strict().superRefine((job, context) => {
  if (job.postedAt && job.expiresAt && Date.parse(job.expiresAt) < Date.parse(job.postedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiresAt'],
      message: 'Expiry date cannot be earlier than posting date',
    })
  }
})

const queryString = z.preprocess(
  (value) => value === '' || value === undefined ? undefined : value,
  z.string().trim().max(240).optional()
)

const skillQuery = z.preprocess(
  (value) => value === '' || value === undefined ? undefined : value,
  z.string().max(1200).optional()
).transform((value) => value ? normalizeSkillList(value.split(',')) : undefined)

export const jobSearchSchema = z.object({
  title: queryString,
  company: queryString,
  description: z.preprocess(
    (value) => value === '' || value === undefined ? undefined : value,
    z.string().trim().max(500).optional()
  ),
  location: queryString,
  employmentType: z.enum([
    'FULL_TIME',
    'PART_TIME',
    'CONTRACT',
    'TEMPORARY',
    'INTERNSHIP',
    'APPRENTICESHIP',
    'OTHER',
  ]).optional(),
  remoteStatus: z.enum(['ONSITE', 'HYBRID', 'REMOTE', 'UNSPECIFIED']).optional(),
  requiredSkills: skillQuery,
  provider: z.preprocess(
    (value) => value === '' || value === undefined ? undefined : value,
    z.string().trim().min(1).max(120).optional()
  ),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'postedAt', 'title', 'company']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict()

export type CreateJobInput = z.infer<typeof createJobSchema>
export type ExternalJobInput = z.infer<typeof externalJobSchema>
export type JobSearchQuery = z.infer<typeof jobSearchSchema>
