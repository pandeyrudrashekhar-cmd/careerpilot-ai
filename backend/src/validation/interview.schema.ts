import { z } from 'zod'

export const createInterviewSchema = z.object({
  targetRole: z.string().trim().min(1).max(200),
  type: z.enum(['TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'HR', 'MIXED', 'OTHER']),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('INTERMEDIATE'),
  jobId: z.string().uuid().nullable().optional(),
  resumeId: z.string().uuid().nullable().optional(),
}).strict()

export const interviewListQuerySchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ABANDONED']).optional(),
  type: z.enum(['TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'HR', 'MIXED', 'OTHER']).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

export const generateQuestionsSchema = z.object({
  count: z.coerce.number().int().min(1).max(10).default(5),
  skills: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
}).strict()

export const addQuestionSchema = z.object({
  prompt: z.string().trim().min(5).max(5000),
  type: z.enum(['TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'SITUATIONAL', 'OTHER']).default('OTHER'),
  expectedAnswer: z.string().trim().max(10_000).nullable().optional(),
}).strict()

export const submitAnswerSchema = z.object({
  questionId: z.string().uuid(),
  content: z.string().trim().min(1).max(20_000),
}).strict()

export const interviewStatsQuerySchema = z.object({
  recentLimit: z.coerce.number().int().min(1).max(20).default(5),
}).strict()

export const interviewQuestionOutputSchema = z.object({
  questions: z.array(z.object({
    prompt: z.string().trim().min(10).max(2000),
    type: z.enum(['TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'SITUATIONAL', 'OTHER']),
  }).strict()).min(1).max(10),
}).strict()

export const interviewEvaluationSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  technicalCorrectness: z.number().int().min(0).max(100),
  clarity: z.number().int().min(0).max(100),
  completeness: z.number().int().min(0).max(100),
  strengths: z.array(z.string().trim().min(1).max(500)).max(10),
  areasForImprovement: z.array(z.string().trim().min(1).max(500)).max(10),
  suggestedImprovedAnswer: z.string().trim().min(1).max(10_000),
}).strict()

export type InterviewQuestionOutput = z.infer<typeof interviewQuestionOutputSchema>['questions']
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>
export type GenerateQuestionsInput = z.infer<typeof generateQuestionsSchema>
export type AddInterviewQuestionInput = z.infer<typeof addQuestionSchema>
export type SubmitInterviewAnswerInput = z.infer<typeof submitAnswerSchema>
export type InterviewEvaluation = z.infer<typeof interviewEvaluationSchema>
export type InterviewListQuery = z.infer<typeof interviewListQuerySchema>
