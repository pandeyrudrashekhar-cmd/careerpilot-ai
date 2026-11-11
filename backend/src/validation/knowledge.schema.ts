import { z } from 'zod'

export const knowledgeSourceTypeSchema = z.enum([
  'RESUME',
  'PROFILE',
  'SKILL',
  'ROADMAP',
  'APPLICATION',
  'JOB',
])

export const knowledgeDocumentSchema = z.object({
  sourceType: knowledgeSourceTypeSchema,
  sourceId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(100_000),
}).strict()

export const knowledgeCountSchema = z.object({
  sourceCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
}).strict()

export const knowledgeDeleteSchema = z.object({
  deleted: z.number().int().nonnegative(),
}).strict()

export const retrievedSourceSchema = z.object({
  id: z.string().uuid(),
  sourceType: knowledgeSourceTypeSchema,
  sourceId: z.string().uuid(),
  title: z.string().max(240),
  chunkIndex: z.number().int().nonnegative(),
  similarity: z.number().min(-1).max(1).nullable().optional(),
  contextExpanded: z.boolean().optional(),
  content: z.string().max(12_000),
}).strict()

export const copilotReplySchema = z.object({
  answer: z.string().trim().min(1).max(20_000),
  sources: z.array(retrievedSourceSchema).max(32),
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(160),
}).strict()

export type KnowledgeSourceType = z.infer<typeof knowledgeSourceTypeSchema>
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>
export type RetrievedSource = z.infer<typeof retrievedSourceSchema>
export type CopilotReply = z.infer<typeof copilotReplySchema>
