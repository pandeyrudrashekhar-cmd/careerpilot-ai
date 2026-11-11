import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ApiError } from '../utils/ApiError'
import type { AiServiceClient } from './aiServiceClient.service'
import { aiServiceClient } from './aiServiceClient.service'
import type {
  ConversationListQuery,
  CreateConversationInput,
  SendCopilotMessageInput,
} from '../validation/copilot.schema'

const HISTORY_MESSAGE_LIMIT = 12
const CONVERSATION_MESSAGE_LIMIT = 50

export interface CopilotServiceDependencies {
  database?: PrismaClient
  aiClient?: AiServiceClient
}

export function createCopilotService(dependencies: CopilotServiceDependencies = {}) {
  const database = dependencies.database ?? prisma
  const aiClient = dependencies.aiClient ?? aiServiceClient

  async function nextSequence(transaction: Prisma.TransactionClient, conversationId: string): Promise<number> {
    const latest = await transaction.message.findFirst({
      where: { conversationId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    })
    return (latest?.sequence ?? 0) + 1
  }

  return {
    create(userId: string, input: CreateConversationInput) {
      return database.conversation.create({
        data: { userId, title: input.title },
      })
    },

    async list(userId: string, query: ConversationListQuery) {
      const where = { userId, status: query.status }
      const [conversations, total] = await Promise.all([
        database.conversation.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: { _count: { select: { messages: true } } },
        }),
        database.conversation.count({ where }),
      ])
      return {
        conversations,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      }
    },

    async get(userId: string, conversationId: string) {
      const conversation = await database.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { sequence: 'desc' },
            take: CONVERSATION_MESSAGE_LIMIT,
          },
        },
      })
      if (!conversation) throw new ApiError(404, 'Conversation not found')
      return { ...conversation, messages: conversation.messages.reverse() }
    },

    async send(userId: string, conversationId: string, input: SendCopilotMessageInput) {
      const conversation = await database.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true, title: true, status: true },
      })
      if (!conversation) throw new ApiError(404, 'Conversation not found')
      if (conversation.status !== 'ACTIVE') throw new ApiError(409, 'Conversation is archived')

      const userMessage = await database.$transaction(async (transaction) => {
        const message = await transaction.message.create({
          data: {
            conversationId,
            sequence: await nextSequence(transaction, conversationId),
            role: 'USER',
            content: input.content,
          },
        })
        await transaction.conversation.updateMany({
          where: { id: conversationId, userId },
          data: {
            updatedAt: new Date(),
            ...(!conversation.title ? { title: input.content.slice(0, 240) } : {}),
          },
        })
        return message
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

      const recentMessages = await database.message.findMany({
        where: { conversationId },
        orderBy: { sequence: 'desc' },
        take: HISTORY_MESSAGE_LIMIT + 1,
        select: { id: true, role: true, content: true },
      })
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = recentMessages
        .filter((message) => message.id !== userMessage.id)
        .reverse()
        .slice(-HISTORY_MESSAGE_LIMIT)
        .filter((message): message is typeof message & { role: 'USER' | 'ASSISTANT' } =>
          message.role === 'USER' || message.role === 'ASSISTANT'
        )
        .map((message) => ({
          role: message.role === 'USER' ? 'user' : 'assistant',
          content: message.content,
        }))

      const reply = await aiClient.respond(userId, input.content, history)
      const publicSources = reply.sources.map(({ content: _content, ...source }) => source)
      const metadata: Prisma.InputJsonObject = {
        grounded: publicSources.length > 0,
        sources: publicSources.map((source) => ({
          id: source.id,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          title: source.title,
          chunkIndex: source.chunkIndex,
          ...(source.similarity === undefined ? {} : { similarity: source.similarity }),
          ...(source.contextExpanded === undefined ? {} : { contextExpanded: source.contextExpanded }),
        })),
      }

      const assistantMessage = await database.$transaction(async (transaction) => {
        const ownedConversation = await transaction.conversation.findFirst({
          where: { id: conversationId, userId, status: 'ACTIVE' },
          select: { id: true },
        })
        if (!ownedConversation) throw new ApiError(404, 'Conversation not found')

        const message = await transaction.message.create({
          data: {
            conversationId,
            sequence: await nextSequence(transaction, conversationId),
            role: 'ASSISTANT',
            content: reply.answer,
            provider: reply.provider,
            model: reply.model,
            metadata,
          },
        })
        await transaction.conversation.updateMany({
          where: { id: conversationId, userId },
          data: { updatedAt: new Date() },
        })
        return message
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

      return { userMessage, assistantMessage, sources: publicSources }
    },

    async delete(userId: string, conversationId: string) {
      const result = await database.conversation.deleteMany({
        where: { id: conversationId, userId },
      })
      if (result.count === 0) throw new ApiError(404, 'Conversation not found')
    },
  }
}

export const copilotService = createCopilotService()
