import { Router } from 'express'
import {
  createJob,
  createJobMatch,
  getJob,
  getJobMatch,
  listJobs,
  searchJobs,
} from '../controllers/job.controller'
import { authenticate } from '../middleware/authenticate'

const jobRouter = Router()

jobRouter.use(authenticate)
jobRouter.post('/', createJob)
jobRouter.get('/', listJobs)
jobRouter.get('/search', searchJobs)
jobRouter.post('/:jobId/match', createJobMatch)
jobRouter.get('/:jobId/match', getJobMatch)
jobRouter.get('/:jobId', getJob)

export default jobRouter
