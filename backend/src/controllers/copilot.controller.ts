import type { RequestHandler } from 'express'
import { copilotService } from '../services/copilot.service'
import { ApiError } from '../utils/ApiError'
import { asyncHandler } from '../utils/asyncHandler'
import { uuidSchema } from '../validation/id.schema'
import {
  conversationListQuerySchema,
  createConversationSchema,
  sendCopilotMessageSchema,
} from '../validation/copilot.schema'

function getConversationId(value: string | undefined): string {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, 'Invalid conversation ID')
  return parsed.data
}

export const createConversation: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = createConversationSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid conversation data')
  const conversation = await copilotService.create(request.auth!.userId, parsed.data)
  response.status(201).json({ success: true, data: conversation })
})

export const listConversations: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = conversationListQuerySchema.safeParse(request.query)
  if (!parsed.success) throw new ApiError(400, 'Invalid conversation filters')
  const result = await copilotService.list(request.auth!.userId, parsed.data)
  response.json({ success: true, data: result })
})

export const getConversation: RequestHandler = asyncHandler(async (request, response) => {
  const conversation = await copilotService.get(
    request.auth!.userId,
    getConversationId(request.params.conversationId)
  )
  response.json({ success: true, data: conversation })
})

export const sendCopilotMessage: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = sendCopilotMessageSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid Copilot message')
  const result = await copilotService.send(
    request.auth!.userId,
    getConversationId(request.params.conversationId),
    parsed.data
  )
  response.status(201).json({ success: true, data: result })
})

export const deleteConversation: RequestHandler = asyncHandler(async (request, response) => {
  await copilotService.delete(request.auth!.userId, getConversationId(request.params.conversationId))
  response.json({ success: true, message: 'Conversation deleted' })
})
