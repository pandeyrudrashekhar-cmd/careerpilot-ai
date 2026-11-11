import { config } from '../config/env'
import { ApiError } from '../utils/ApiError'
import {
  copilotReplySchema,
  knowledgeCountSchema,
  knowledgeDeleteSchema,
  type KnowledgeDocument,
  type KnowledgeSourceType,
  type RetrievedSource,
} from '../validation/knowledge.schema'

export interface AiServiceClient {
  ingest(userId: string, documents: KnowledgeDocument[]): Promise<{ sourceCount: number; chunkCount: number }>
  status(userId: string): Promise<{ sourceCount: number; chunkCount: number }>
  deleteSource(userId: string, sourceType: KnowledgeSourceType, sourceId: string): Promise<{ deleted: number }>
  respond(
    userId: string,
    query: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{
    answer: string
    sources: RetrievedSource[]
    provider: string
    model: string
  }>
}

export function createAiServiceClient(
  baseUrl = config.aiServiceUrl,
  internalToken = config.aiServiceInternalToken,
  fetchImplementation: typeof fetch = fetch
): AiServiceClient {
  async function request(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
    if (!internalToken) throw new ApiError(503, 'AI service authentication is not configured')

    let response: Response
    try {
      response = await fetchImplementation(new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`), {
        method,
        headers: {
          'X-Internal-Token': internalToken,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(method === 'POST' ? 120_000 : 30_000),
      })
    } catch {
      throw new ApiError(502, 'AI service is unavailable')
    }

    if (!response.ok) {
      throw new ApiError(response.status === 503 ? 503 : 502, 'AI service could not complete the request')
    }

    try {
      return await response.json() as unknown
    } catch {
      throw new ApiError(502, 'AI service returned an invalid response')
    }
  }

  return {
    async ingest(userId, documents) {
      const output = await request('/internal/v1/knowledge/ingest', 'POST', { userId, documents })
      const parsed = knowledgeCountSchema.safeParse(output)
      if (!parsed.success) throw new ApiError(502, 'AI service returned invalid ingestion status')
      return parsed.data
    },

    async status(userId) {
      const path = `/internal/v1/knowledge/status?userId=${encodeURIComponent(userId)}`
      const output = await request(path, 'GET')
      const parsed = knowledgeCountSchema.safeParse(output)
      if (!parsed.success) throw new ApiError(502, 'AI service returned invalid knowledge status')
      return parsed.data
    },

    async deleteSource(userId, sourceType, sourceId) {
      const path = `/internal/v1/knowledge/${encodeURIComponent(sourceType)}/${encodeURIComponent(sourceId)}?userId=${encodeURIComponent(userId)}`
      const output = await request(path, 'DELETE')
      const parsed = knowledgeDeleteSchema.safeParse(output)
      if (!parsed.success) throw new ApiError(502, 'AI service returned invalid deletion status')
      return parsed.data
    },

    async respond(userId, query, history) {
      const output = await request('/internal/v1/copilot/respond', 'POST', { userId, query, history })
      const parsed = copilotReplySchema.safeParse(output)
      if (!parsed.success) throw new ApiError(502, 'AI service returned an invalid Copilot response')
      return parsed.data
    },
  }
}

export const aiServiceClient = createAiServiceClient()
