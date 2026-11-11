import type { RequestHandler } from 'express'
import { knowledgeService } from '../services/knowledge.service'
import { ApiError } from '../utils/ApiError'
import { asyncHandler } from '../utils/asyncHandler'
import { uuidSchema } from '../validation/id.schema'
import { knowledgeSourceTypeSchema } from '../validation/knowledge.schema'

function getSourceParams(sourceType: string | undefined, sourceId: string | undefined) {
  const parsedType = knowledgeSourceTypeSchema.safeParse(sourceType)
  const parsedId = uuidSchema.safeParse(sourceId)
  if (!parsedType.success || !parsedId.success) {
    throw new ApiError(400, 'Invalid knowledge source')
  }
  return { sourceType: parsedType.data, sourceId: parsedId.data }
}

export const ingestKnowledge: RequestHandler = asyncHandler(async (request, response) => {
  const status = await knowledgeService.ingest(request.auth!.userId)
  response.json({ success: true, data: status })
})

export const reindexKnowledge: RequestHandler = asyncHandler(async (request, response) => {
  const status = await knowledgeService.ingest(request.auth!.userId)
  response.json({ success: true, data: status })
})

export const getKnowledgeStatus: RequestHandler = asyncHandler(async (request, response) => {
  const status = await knowledgeService.status(request.auth!.userId)
  response.json({ success: true, data: status })
})

export const deleteKnowledgeSource: RequestHandler = asyncHandler(async (request, response) => {
  const { sourceType, sourceId } = getSourceParams(request.params.sourceType, request.params.sourceId)
  const result = await knowledgeService.deleteSource(request.auth!.userId, sourceType, sourceId)
  response.json({ success: true, data: result })
})
