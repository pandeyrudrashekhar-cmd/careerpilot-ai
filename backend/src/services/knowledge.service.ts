import type { PrismaClient } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { AiServiceClient } from './aiServiceClient.service'
import { aiServiceClient } from './aiServiceClient.service'
import type { KnowledgeDocument, KnowledgeSourceType } from '../validation/knowledge.schema'

const MAX_INDEXED_DOCUMENTS_PER_SOURCE = 100

function serialized(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function createDocument(
  sourceType: KnowledgeSourceType,
  sourceId: string,
  title: string,
  sections: Array<[string, unknown]>
): KnowledgeDocument | undefined {
  const rawContent = sections
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `${label}: ${serialized(value)}`)
    .join('\n')
    .trim()
  const truncationNotice = '\n[Source text truncated at indexing limit]'
  const content = rawContent.length > 100_000
    ? `${rawContent.slice(0, 100_000 - truncationNotice.length)}${truncationNotice}`
    : rawContent

  if (!content) return undefined
  return { sourceType, sourceId, title: title.slice(0, 240), content }
}

export interface KnowledgeServiceDependencies {
  database?: PrismaClient
  aiClient?: AiServiceClient
}

export function createKnowledgeService(dependencies: KnowledgeServiceDependencies = {}) {
  const database = dependencies.database ?? prisma
  const aiClient = dependencies.aiClient ?? aiServiceClient

  async function collectUserDocuments(userId: string): Promise<KnowledgeDocument[]> {
    const [profile, skills, resume, roadmaps, applications, matches] = await Promise.all([
      database.profile.findUnique({
        where: { userId },
        select: {
          id: true,
          displayName: true,
          headline: true,
          summary: true,
          location: true,
          targetRole: true,
          websiteUrl: true,
          githubUrl: true,
          linkedinUrl: true,
        },
      }),
      database.userSkill.findMany({
        where: { userId },
        take: MAX_INDEXED_DOCUMENTS_PER_SOURCE,
        orderBy: { updatedAt: 'desc' },
        include: { skill: { select: { name: true, category: true } } },
      }),
      database.resume.findFirst({
        where: { userId, isActive: true },
        select: {
          id: true,
          originalFilename: true,
          analyses: {
            where: { status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              extractedText: true,
              skills: true,
              experienceSummary: true,
              education: true,
              strengths: true,
              improvementSuggestions: true,
            },
          },
        },
      }),
      database.learningRoadmap.findMany({
        where: { userId, status: { not: 'ARCHIVED' } },
        take: MAX_INDEXED_DOCUMENTS_PER_SOURCE,
        orderBy: { updatedAt: 'desc' },
        include: {
          items: {
            orderBy: { order: 'asc' },
            select: { title: true, description: true, priority: true, status: true },
          },
        },
      }),
      database.application.findMany({
        where: { userId },
        take: MAX_INDEXED_DOCUMENTS_PER_SOURCE,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          company: true,
          role: true,
          status: true,
          appliedAt: true,
          notes: true,
          job: {
            select: {
              id: true,
              title: true,
              company: true,
              description: true,
              requiredSkills: true,
              optionalSkills: true,
            },
          },
        },
      }),
      database.jobMatch.findMany({
        where: { userId },
        take: MAX_INDEXED_DOCUMENTS_PER_SOURCE,
        orderBy: { updatedAt: 'desc' },
        select: {
          job: {
            select: {
              id: true,
              title: true,
              company: true,
              description: true,
              requiredSkills: true,
              optionalSkills: true,
            },
          },
        },
      }),
    ])

    const documents: KnowledgeDocument[] = []
    const push = (document: KnowledgeDocument | undefined) => {
      if (document) documents.push(document)
    }

    if (profile) {
      push(createDocument('PROFILE', profile.id, profile.headline ?? profile.targetRole ?? 'Career profile', [
        ['Name', profile.displayName],
        ['Headline', profile.headline],
        ['Summary', profile.summary],
        ['Location', profile.location],
        ['Target role', profile.targetRole],
        ['Website', profile.websiteUrl],
        ['GitHub', profile.githubUrl],
        ['LinkedIn', profile.linkedinUrl],
      ]))
    }

    for (const userSkill of skills) {
      push(createDocument('SKILL', userSkill.id, userSkill.skill.name, [
        ['Skill', userSkill.skill.name],
        ['Category', userSkill.skill.category],
        ['Proficiency', userSkill.proficiency],
        ['Years of experience', userSkill.yearsExperience?.toString()],
        ['Evidence source', userSkill.evidenceSource],
        ['Evidence', userSkill.evidence],
      ]))
    }

    const analysis = resume?.analyses[0]
    if (resume && analysis) {
      push(createDocument('RESUME', resume.id, resume.originalFilename, [
        ['Extracted resume text', analysis.extractedText],
        ['Structured skills', analysis.skills],
        ['Experience summary', analysis.experienceSummary],
        ['Education', analysis.education],
        ['Strengths', analysis.strengths],
        ['Improvement suggestions', analysis.improvementSuggestions],
      ]))
    }

    for (const roadmap of roadmaps) {
      push(createDocument('ROADMAP', roadmap.id, `Learning roadmap: ${roadmap.targetRole}`, [
        ['Target role', roadmap.targetRole],
        ['Skill gaps', roadmap.skillGaps],
        ['Status', roadmap.status],
        ['Learning steps', roadmap.items.map((item) => ({
          title: item.title,
          description: item.description,
          priority: item.priority,
          status: item.status,
        }))],
      ]))
    }

    const relatedJobs = new Map<string, NonNullable<(typeof applications)[number]['job']>>()
    for (const application of applications) {
      push(createDocument('APPLICATION', application.id, `${application.role} at ${application.company}`, [
        ['Company', application.company],
        ['Role', application.role],
        ['Application status', application.status],
        ['Applied at', application.appliedAt?.toISOString()],
        ['Notes', application.notes],
        ['Linked job ID', application.job?.id],
      ]))
      if (application.job) relatedJobs.set(application.job.id, application.job)
    }

    for (const match of matches) {
      if (match.job) relatedJobs.set(match.job.id, match.job)
    }

    for (const job of relatedJobs.values()) {
      push(createDocument('JOB', job.id, `${job.title} at ${job.company}`, [
        ['Job title', job.title],
        ['Company', job.company],
        ['Description', job.description],
        ['Required skills', job.requiredSkills],
        ['Optional skills', job.optionalSkills],
      ]))
    }

    return documents
  }

  return {
    async ingest(userId: string) {
      const documents = await collectUserDocuments(userId)
      return aiClient.ingest(userId, documents)
    },

    status(userId: string) {
      return aiClient.status(userId)
    },

    deleteSource(userId: string, sourceType: KnowledgeSourceType, sourceId: string) {
      return aiClient.deleteSource(userId, sourceType, sourceId)
    },
  }
}

export const knowledgeService = createKnowledgeService()
