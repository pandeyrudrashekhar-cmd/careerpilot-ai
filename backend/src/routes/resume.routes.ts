import { Router } from 'express'
import {
  activateResume,
  analyzeResume,
  deleteResume,
  getResume,
  getResumeSummary,
  listResumes,
  uploadResume,
} from '../controllers/resume.controller'
import { authenticate } from '../middleware/authenticate'
import { resumeUpload } from '../middleware/resumeUpload'
import { resumeReadPerformance } from '../middleware/resumePerformance'
import { resourceRateLimit } from '../middleware/resourceRateLimit'

const resumeRouter = Router()

resumeRouter.use(resumeReadPerformance)
resumeRouter.use(authenticate)
resumeRouter.post('/', resourceRateLimit, resumeUpload.single('file'), uploadResume)
resumeRouter.get('/', listResumes)
resumeRouter.get('/:resumeId/summary', getResumeSummary)
resumeRouter.get('/:resumeId', getResume)
resumeRouter.delete('/:resumeId', deleteResume)
resumeRouter.put('/:resumeId/active', activateResume)
resumeRouter.post('/:resumeId/analyze', resourceRateLimit, analyzeResume)

export default resumeRouter
