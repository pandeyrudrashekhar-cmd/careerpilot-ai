import { Router } from 'express'
import { listJobMatches } from '../controllers/job.controller'
import { authenticate } from '../middleware/authenticate'

const matchRouter = Router()

matchRouter.use(authenticate)
matchRouter.get('/', listJobMatches)

export default matchRouter
