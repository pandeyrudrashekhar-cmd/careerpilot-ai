import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ApiError } from '../utils/ApiError'
import type {
  AddInterviewQuestionInput,
  CreateInterviewInput,
  GenerateQuestionsInput,
  InterviewListQuery,
  InterviewQuestionOutput,
  SubmitInterviewAnswerInput,
} from '../validation/interview.schema'
import { createInterviewAiProvider, type InterviewAiProvider, type InterviewGenerationContext } from './interviewAiProvider.service'

export interface InterviewServiceDependencies {
  database?: PrismaClient
  provider?: InterviewAiProvider
  providerFactory?: () => InterviewAiProvider | undefined
}

export function createInterviewService(dependencies: InterviewServiceDependencies = {}) {
  const database = dependencies.database ?? prisma
  const providerFactory = dependencies.providerFactory
    ?? (() => dependencies.provider ?? createInterviewAiProvider())

  async function getOwnedSession(userId: string, sessionId: string) {
    const session = await database.interviewSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        job: { select: { title: true, description: true, requiredSkills: true, optionalSkills: true } },
        resume: {
          select: {
            analyses: {
              where: { status: 'COMPLETED' },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { skills: true, extractedText: true },
            },
          },
        },
      },
    })
    if (!session) throw new ApiError(404, 'Interview session not found')
    return session
  }

  function getContext(session: Awaited<ReturnType<typeof getOwnedSession>>): InterviewGenerationContext {
    const analysis = session.resume?.analyses[0]
    const resumeSkills = Array.isArray(analysis?.skills)
      ? analysis.skills.filter((skill): skill is string => typeof skill === 'string')
      : []
    return {
      targetRole: session.targetRole,
      interviewType: session.type,
      difficulty: session.difficulty,
      skills: [...new Set([
        ...resumeSkills,
        ...(session.job?.requiredSkills ?? []),
        ...(session.job?.optionalSkills ?? []),
      ])].slice(0, 40),
      jobDescription: session.job?.description,
      resumeText: analysis?.extractedText ?? undefined,
    }
  }

  return {
    async create(userId: string, input: CreateInterviewInput) {
      if (input.jobId) {
        const job = await database.job.findUnique({ where: { id: input.jobId }, select: { id: true } })
        if (!job) throw new ApiError(404, 'Job not found')
      }
      if (input.resumeId) {
        const resume = await database.resume.findFirst({
          where: { id: input.resumeId, userId },
          select: { id: true },
        })
        if (!resume) throw new ApiError(404, 'Resume not found')
      }
      return database.interviewSession.create({
        data: {
          userId,
          targetRole: input.targetRole,
          type: input.type,
          difficulty: input.difficulty,
          jobId: input.jobId ?? null,
          resumeId: input.resumeId ?? null,
          status: 'IN_PROGRESS',
        },
      })
    },

    async list(userId: string, query: InterviewListQuery) {
      const where: Prisma.InterviewSessionWhereInput = { userId }
      if (query.status) where.status = query.status
      if (query.type) where.type = query.type
      const [sessions, total] = await Promise.all([
        database.interviewSession.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            _count: { select: { questions: true } },
          },
        }),
        database.interviewSession.count({ where }),
      ])
      return {
        sessions,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      }
    },

    async get(userId: string, sessionId: string) {
      return database.interviewSession.findFirst({
        where: { id: sessionId, userId },
        include: {
          questions: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              order: true,
              type: true,
              prompt: true,
              createdAt: true,
              answer: { select: { id: true, answeredAt: true, score: true } },
            },
          },
        },
      }).then((session) => {
        if (!session) throw new ApiError(404, 'Interview session not found')
        return session
      })
    },

    async start(userId: string, sessionId: string) {
      const session = await database.interviewSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true, status: true },
      })
      if (!session) throw new ApiError(404, 'Interview session not found')
      if (session.status !== 'IN_PROGRESS') {
        throw new ApiError(409, 'Only in-progress interview sessions can be started')
      }
      return database.interviewSession.findFirstOrThrow({
        where: { id: sessionId, userId },
      })
    },

    async addQuestion(userId: string, sessionId: string, input: AddInterviewQuestionInput) {
      const session = await database.interviewSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true, status: true },
      })
      if (!session) throw new ApiError(404, 'Interview session not found')
      if (session.status !== 'IN_PROGRESS') throw new ApiError(409, 'Interview session is not in progress')

      return database.$transaction(async (transaction) => {
        const last = await transaction.interviewQuestion.findFirst({
          where: { sessionId },
          orderBy: { order: 'desc' },
          select: { order: true },
        })
        return transaction.interviewQuestion.create({
          data: {
            sessionId,
            order: (last?.order ?? 0) + 1,
            prompt: input.prompt,
            type: input.type,
            expectedAnswer: input.expectedAnswer,
          },
          select: { id: true, order: true, prompt: true, type: true, createdAt: true },
        })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    },

    async generateQuestions(userId: string, sessionId: string, input: GenerateQuestionsInput) {
      const session = await getOwnedSession(userId, sessionId)
      if (session.status !== 'IN_PROGRESS') throw new ApiError(409, 'Interview session is not in progress')
      const baseContext = getContext(session)
      const context = {
        ...baseContext,
        skills: [...new Set([...baseContext.skills, ...(input.skills ?? [])])].slice(0, 40),
      }
      const provider = providerFactory()
      if (!provider) throw new ApiError(503, 'Interview question generation is not configured')
      const generated: InterviewQuestionOutput = await provider.generateQuestions(context, input.count)

      const created = await database.$transaction(async (transaction) => {
        const last = await transaction.interviewQuestion.findFirst({
          where: { sessionId },
          orderBy: { order: 'desc' },
          select: { order: true },
        })
        const startOrder = (last?.order ?? 0) + 1
        await transaction.interviewQuestion.createMany({
          data: generated.map((question, index) => ({
            sessionId,
            order: startOrder + index,
            prompt: question.prompt,
            type: question.type,
          })),
        })
        return transaction.interviewQuestion.findMany({
          where: { sessionId, order: { gte: startOrder } },
          orderBy: { order: 'asc' },
          select: { id: true, order: true, prompt: true, type: true, createdAt: true },
        })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      return { source: 'AI' as const, questions: created }
    },

    async questions(userId: string, sessionId: string) {
      const session = await database.interviewSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true },
      })
      if (!session) throw new ApiError(404, 'Interview session not found')
      return database.interviewQuestion.findMany({
        where: { sessionId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          prompt: true,
          type: true,
          createdAt: true,
          answer: { select: { id: true, answeredAt: true } },
        },
      })
    },

    async submitAnswer(userId: string, sessionId: string, input: SubmitInterviewAnswerInput) {
      const question = await database.interviewQuestion.findFirst({
        where: {
          id: input.questionId,
          sessionId,
          session: { userId, status: 'IN_PROGRESS' },
        },
        select: { id: true },
      })
      if (!question) throw new ApiError(404, 'Interview question not found')
      const answer = await database.interviewAnswer.upsert({
        where: { questionId: question.id },
        create: {
          questionId: question.id,
          content: input.content,
        },
        update: {
          content: input.content,
          evaluation: Prisma.DbNull,
          evaluationFeedback: null,
          score: null,
          provider: null,
          model: null,
          answeredAt: new Date(),
        },
        select: { id: true, questionId: true, content: true, answeredAt: true, score: true },
      })
      return { answer, evaluationStatus: 'NOT_EVALUATED' as const }
    },

    async evaluateAnswer(userId: string, sessionId: string, questionId: string) {
      const provider = providerFactory()
      if (!provider) throw new ApiError(503, 'Interview answer evaluation is not configured')
      const question = await database.interviewQuestion.findFirst({
        where: { id: questionId, sessionId, session: { userId } },
        select: {
          id: true,
          prompt: true,
          answer: { select: { id: true, content: true } },
          session: {
            select: {
              targetRole: true,
              type: true,
              difficulty: true,
              job: { select: { title: true, description: true, requiredSkills: true, optionalSkills: true } },
              resume: {
                select: {
                  analyses: {
                    where: { status: 'COMPLETED' },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { skills: true, extractedText: true },
                  },
                },
              },
            },
          },
        },
      })
      if (!question) throw new ApiError(404, 'Interview question not found')
      if (!question.answer) throw new ApiError(409, 'Submit an answer before requesting evaluation')
      const analysis = question.session.resume?.analyses[0]
      const skills = Array.isArray(analysis?.skills)
        ? analysis.skills.filter((skill): skill is string => typeof skill === 'string')
        : []
      const evaluation = await provider.evaluateAnswer(question.prompt, question.answer.content, {
        targetRole: question.session.targetRole,
        interviewType: question.session.type,
        difficulty: question.session.difficulty,
        skills: [...new Set([
          ...skills,
          ...(question.session.job?.requiredSkills ?? []),
          ...(question.session.job?.optionalSkills ?? []),
        ])].slice(0, 40),
        jobDescription: question.session.job?.description,
        resumeText: analysis?.extractedText ?? undefined,
      })
      return database.interviewAnswer.update({
        where: { id: question.answer.id },
        data: {
          score: evaluation.overallScore,
          evaluationFeedback: evaluation.areasForImprovement.join('\n'),
          evaluation: evaluation as Prisma.InputJsonValue,
          provider: provider.provider,
          model: provider.model,
        },
        select: { id: true, questionId: true, score: true, evaluationFeedback: true, evaluation: true },
      })
    },

    async feedback(userId: string, sessionId: string) {
      const session = await database.interviewSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true },
      })
      if (!session) throw new ApiError(404, 'Interview session not found')
      const questions = await database.interviewQuestion.findMany({
        where: { sessionId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          prompt: true,
          type: true,
          answer: {
            select: {
              content: true,
              answeredAt: true,
              score: true,
              evaluationFeedback: true,
              evaluation: true,
              provider: true,
              model: true,
            },
          },
        },
      })
      return {
        questions: questions.map((question) => ({
          ...question,
          evaluationStatus: question.answer?.evaluation ? 'EVALUATED' : 'NOT_EVALUATED',
        })),
      }
    },

    async complete(userId: string, sessionId: string) {
      return database.$transaction(async (transaction) => {
        const session = await transaction.interviewSession.findFirst({
          where: { id: sessionId, userId },
          select: { id: true, status: true, completedAt: true },
        })
        if (!session) throw new ApiError(404, 'Interview session not found')
        if (session.status === 'ABANDONED') throw new ApiError(409, 'Abandoned sessions cannot be completed')
        const scores = await transaction.interviewAnswer.findMany({
          where: {
            question: { sessionId },
            score: { not: null },
          },
          select: { score: true },
        })
        const evaluatedScores = scores.flatMap(({ score }) => score === null ? [] : [score])
        const updated = session.status === 'COMPLETED'
          ? session
          : await transaction.interviewSession.update({
            where: { id: session.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          })
        return {
          session: updated,
          evaluatedAnswerCount: evaluatedScores.length,
          averageScore: evaluatedScores.length
            ? Math.round(evaluatedScores.reduce((total, score) => total + score, 0) / evaluatedScores.length)
            : null,
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    },

    async stats(userId: string, recentLimit: number) {
      const sessionWhere = { userId }
      const [totalSessions, completedSessions, byType, recent, scoreAggregate, scoredAnswers] = await Promise.all([
        database.interviewSession.count({ where: sessionWhere }),
        database.interviewSession.count({ where: { ...sessionWhere, status: 'COMPLETED' } }),
        database.interviewSession.groupBy({
          by: ['type'],
          where: sessionWhere,
          _count: { _all: true },
        }),
        database.interviewSession.findMany({
          where: sessionWhere,
          orderBy: { updatedAt: 'desc' },
          take: recentLimit,
          select: { id: true, targetRole: true, type: true, status: true, startedAt: true, completedAt: true },
        }),
        database.interviewAnswer.aggregate({
          where: {
            question: { session: { userId } },
            score: { not: null },
          },
          _avg: { score: true },
          _count: { _all: true },
        }),
        database.interviewAnswer.findMany({
          where: {
            question: { session: { userId } },
            score: { not: null },
          },
          orderBy: { answeredAt: 'desc' },
          take: 20,
          select: { score: true, answeredAt: true },
        }),
      ])
      return {
        totalSessions,
        completedSessions,
        byType: Object.fromEntries(byType.map(({ type, _count }) => [type, _count._all])),
        averageScore: scoreAggregate._avg.score === null ? null : Math.round(scoreAggregate._avg.score),
        recent,
        performanceTrend: scoreAggregate._count._all >= 3
          ? scoredAnswers.slice().reverse().map(({ score, answeredAt }) => ({ score, answeredAt }))
          : [],
      }
    },
  }
}

export const interviewService = createInterviewService()
