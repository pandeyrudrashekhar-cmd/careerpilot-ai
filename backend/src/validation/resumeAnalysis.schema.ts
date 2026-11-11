import { z } from 'zod'

const textList = z.array(z.string().trim().min(1).max(500)).max(100)

export const resumeAnalysisResultSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(120)).max(100),
  experienceSummary: z.string().trim().max(10_000),
  education: z.array(z.object({
    institution: z.string().trim().max(300).nullable(),
    credential: z.string().trim().max(300).nullable(),
    field: z.string().trim().max(300).nullable(),
    startDate: z.string().trim().max(100).nullable(),
    endDate: z.string().trim().max(100).nullable(),
  }).strict()).max(50),
  strengths: textList,
  improvementSuggestions: textList,
}).strict()

export type ResumeAnalysisResult = z.infer<typeof resumeAnalysisResultSchema>

export interface ResumeAnalysisProvider {
  provider: string
  model: string
  analyze(extractedText: string): Promise<ResumeAnalysisResult>
}
