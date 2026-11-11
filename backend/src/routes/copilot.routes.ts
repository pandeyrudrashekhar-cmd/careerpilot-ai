import { Router } from 'express'
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  sendCopilotMessage,
} from '../controllers/copilot.controller'
import { authenticate } from '../middleware/authenticate'
import { resourceRateLimit } from '../middleware/resourceRateLimit'

const copilotRouter = Router()

copilotRouter.use(authenticate)
copilotRouter.post('/conversations', createConversation)
copilotRouter.get('/conversations', listConversations)
copilotRouter.get('/conversations/:conversationId', getConversation)
copilotRouter.post('/conversations/:conversationId/messages', resourceRateLimit, sendCopilotMessage)
copilotRouter.delete('/conversations/:conversationId', deleteConversation)

export default copilotRouter
