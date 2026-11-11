import { Router } from 'express'
import {
  deleteKnowledgeSource,
  getKnowledgeStatus,
  ingestKnowledge,
  reindexKnowledge,
} from '../controllers/knowledge.controller'
import { authenticate } from '../middleware/authenticate'
import { resourceRateLimit } from '../middleware/resourceRateLimit'

const knowledgeRouter = Router()

knowledgeRouter.use(authenticate)
knowledgeRouter.post('/ingest', resourceRateLimit, ingestKnowledge)
knowledgeRouter.post('/reindex', resourceRateLimit, reindexKnowledge)
knowledgeRouter.get('/status', getKnowledgeStatus)
knowledgeRouter.delete('/:sourceType/:sourceId', deleteKnowledgeSource)

export default knowledgeRouter
