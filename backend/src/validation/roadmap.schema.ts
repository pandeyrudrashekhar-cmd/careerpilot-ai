import { z } from 'zod'

export const generateRoadmapSchema = z.object({
  jobId: z.string().uuid(),
}).strict()

export const roadmapItemUpdateSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']),
}).strict()

export const roadmapListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

export type GenerateRoadmapInput = z.infer<typeof generateRoadmapSchema>
export type RoadmapItemUpdate = z.infer<typeof roadmapItemUpdateSchema>
export type RoadmapListQuery = z.infer<typeof roadmapListQuerySchema>
