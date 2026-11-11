import { z } from 'zod'

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
}).strict()

export const conversationListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

export const sendCopilotMessageSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
}).strict()

export type CreateConversationInput = z.infer<typeof createConversationSchema>
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>
export type SendCopilotMessageInput = z.infer<typeof sendCopilotMessageSchema>
