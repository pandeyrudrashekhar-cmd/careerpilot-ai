import type { RequestHandler } from 'express'
import { interviewService } from '../services/interview.service'
import { ApiError } from '../utils/ApiError'
import { asyncHandler } from '../utils/asyncHandler'
import { uuidSchema } from '../validation/id.schema'
import {
  addQuestionSchema,
  createInterviewSchema,
  generateQuestionsSchema,
  interviewListQuerySchema,
  interviewStatsQuerySchema,
  submitAnswerSchema,
} from '../validation/interview.schema'

function getSessionId(value: string | undefined): string {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, 'Invalid interview session ID')
  return parsed.data
}

export const createInterview: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = createInterviewSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid interview session data')
  const session = await interviewService.create(request.auth!.userId, parsed.data)
  response.status(201).json({ success: true, data: session })
})

export const listInterviews: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = interviewListQuerySchema.safeParse(request.query)
  if (!parsed.success) throw new ApiError(400, 'Invalid interview filters')
  const result = await interviewService.list(request.auth!.userId, parsed.data)
  response.json({ success: true, data: result })
})

export const getInterview: RequestHandler = asyncHandler(async (request, response) => {
  const session = await interviewService.get(request.auth!.userId, getSessionId(request.params.sessionId))
  response.json({ success: true, data: session })
})

export const startInterview: RequestHandler = asyncHandler(async (request, response) => {
  const session = await interviewService.start(request.auth!.userId, getSessionId(request.params.sessionId))
  response.json({ success: true, data: session })
})

export const addInterviewQuestions: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = generateQuestionsSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid question generation request')
  const result = await interviewService.generateQuestions(
    request.auth!.userId,
    getSessionId(request.params.sessionId),
    parsed.data
  )
  response.status(201).json({ success: true, data: result })
})

export const addInterviewQuestion: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = addQuestionSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid interview question')
  const question = await interviewService.addQuestion(
    request.auth!.userId,
    getSessionId(request.params.sessionId),
    parsed.data
  )
  response.status(201).json({ success: true, data: question })
})

export const listInterviewQuestions: RequestHandler = asyncHandler(async (request, response) => {
  const questions = await interviewService.questions(
    request.auth!.userId,
    getSessionId(request.params.sessionId)
  )
  response.json({ success: true, data: questions })
})

export const submitInterviewAnswer: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = submitAnswerSchema.safeParse(request.body)
  if (!parsed.success) throw new ApiError(400, 'Invalid interview answer')
  const result = await interviewService.submitAnswer(
    request.auth!.userId,
    getSessionId(request.params.sessionId),
    parsed.data
  )
  response.status(201).json({ success: true, data: result })
})

export const evaluateInterviewAnswer: RequestHandler = asyncHandler(async (request, response) => {
  const result = await interviewService.evaluateAnswer(
    request.auth!.userId,
    getSessionId(request.params.sessionId),
    getSessionId(request.params.questionId)
  )
  response.json({ success: true, data: result })
})

export const getInterviewFeedback: RequestHandler = asyncHandler(async (request, response) => {
  const result = await interviewService.feedback(
    request.auth!.userId,
    getSessionId(request.params.sessionId)
  )
  response.json({ success: true, data: result })
})

export const completeInterview: RequestHandler = asyncHandler(async (request, response) => {
  const result = await interviewService.complete(
    request.auth!.userId,
    getSessionId(request.params.sessionId)
  )
  response.json({ success: true, data: result })
})

export const interviewStats: RequestHandler = asyncHandler(async (request, response) => {
  const parsed = interviewStatsQuerySchema.safeParse(request.query)
  if (!parsed.success) throw new ApiError(400, 'Invalid interview statistics options')
  const result = await interviewService.stats(request.auth!.userId, parsed.data.recentLimit)
  response.json({ success: true, data: result })
})
