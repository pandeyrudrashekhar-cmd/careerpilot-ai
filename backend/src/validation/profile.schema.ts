import { z } from 'zod'

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

export const profileUpdateSchema = z.object({
  displayName: optionalText(160),
  headline: optionalText(240),
  summary: optionalText(10_000),
  location: optionalText(200),
  websiteUrl: optionalText(2048).refine(isOptionalHttpUrl, 'Must be an HTTP(S) URL'),
  githubUrl: optionalText(2048).refine(isOptionalHttpUrl, 'Must be an HTTP(S) URL'),
  linkedinUrl: optionalText(2048).refine(isOptionalHttpUrl, 'Must be an HTTP(S) URL'),
  targetRole: optionalText(200),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one profile field is required')

function isOptionalHttpUrl(value: string | null | undefined): boolean {
  if (value == null || value === '') return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>
