import { Router } from 'express'
import {
  applicationHistory,
  applicationStats,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
  updateApplicationStatus,
} from '../controllers/application.controller'
import { authenticate } from '../middleware/authenticate'

const applicationRouter = Router()

applicationRouter.use(authenticate)
applicationRouter.post('/', createApplication)
applicationRouter.get('/stats', applicationStats)
applicationRouter.get('/', listApplications)
applicationRouter.get('/:applicationId/history', applicationHistory)
applicationRouter.patch('/:applicationId/status', updateApplicationStatus)
applicationRouter.get('/:applicationId', getApplication)
applicationRouter.patch('/:applicationId', updateApplication)
applicationRouter.delete('/:applicationId', deleteApplication)

export default applicationRouter
