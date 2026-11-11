import { Router } from 'express'
import {
  addInterviewQuestion,
  addInterviewQuestions,
  completeInterview,
  createInterview,
  evaluateInterviewAnswer,
  getInterview,
  getInterviewFeedback,
  interviewStats,
  listInterviewQuestions,
  listInterviews,
  startInterview,
  submitInterviewAnswer,
} from '../controllers/interview.controller'
import { authenticate } from '../middleware/authenticate'
import { resourceRateLimit } from '../middleware/resourceRateLimit'

const interviewRouter = Router()

interviewRouter.use(authenticate)
interviewRouter.post('/', createInterview)
interviewRouter.get('/stats', interviewStats)
interviewRouter.get('/', listInterviews)
interviewRouter.post('/:sessionId/start', startInterview)
interviewRouter.post('/:sessionId/questions', resourceRateLimit, addInterviewQuestions)
interviewRouter.post('/:sessionId/questions/manual', addInterviewQuestion)
interviewRouter.get('/:sessionId/questions', listInterviewQuestions)
interviewRouter.post('/:sessionId/answers', submitInterviewAnswer)
interviewRouter.post('/:sessionId/answers/:questionId/evaluate', resourceRateLimit, evaluateInterviewAnswer)
interviewRouter.get('/:sessionId/feedback', getInterviewFeedback)
interviewRouter.post('/:sessionId/complete', completeInterview)
interviewRouter.get('/:sessionId', getInterview)

export default interviewRouter
