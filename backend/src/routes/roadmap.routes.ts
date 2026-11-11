import { Router } from 'express'
import {
  generateRoadmap,
  getRoadmap,
  listRoadmaps,
  updateRoadmapItem,
} from '../controllers/roadmap.controller'
import { authenticate } from '../middleware/authenticate'

const roadmapRouter = Router()

roadmapRouter.use(authenticate)
roadmapRouter.post('/generate', generateRoadmap)
roadmapRouter.get('/', listRoadmaps)
roadmapRouter.patch('/:roadmapId/items/:itemId', updateRoadmapItem)
roadmapRouter.get('/:roadmapId', getRoadmap)

export default roadmapRouter
