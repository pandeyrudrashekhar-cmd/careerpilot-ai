import path from 'node:path'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import { ApiError } from '../utils/ApiError'

export const supportedResumeTypes = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

export function isSupportedResumeFile(filename: string, mimeType: string): boolean {
  const extension = path.extname(filename).toLowerCase() as keyof typeof supportedResumeTypes
  return supportedResumeTypes[extension] === mimeType
}

export function getResumeExtension(filename: string): '.pdf' | '.docx' {
  const extension = path.extname(filename).toLowerCase()
  if (extension === '.pdf' || extension === '.docx') return extension
  throw new ApiError(400, 'Only PDF and DOCX resumes are supported')
}

export function validateResumeFileContent(
  filename: string,
  mimeType: string,
  buffer: Buffer
): void {
  if (!isSupportedResumeFile(filename, mimeType)) {
    throw new ApiError(400, 'File extension and MIME type must match a supported resume format')
  }

  const extension = getResumeExtension(filename)
  const isPdf = extension === '.pdf'
    && buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  const isDocx = extension === '.docx'
    && buffer.length >= 4
    && buffer[0] === 0x50
    && buffer[1] === 0x4b
    && buffer[2] === 0x03
    && buffer[3] === 0x04

  if (!isPdf && !isDocx) {
    throw new ApiError(400, 'File content does not match the declared resume format')
  }
}

export async function extractResumeText(filename: string, buffer: Buffer): Promise<string> {
  const extension = getResumeExtension(filename)

  try {
    const text = extension === '.pdf'
      ? (await pdfParse(buffer)).text
      : (await mammoth.extractRawText({ buffer })).value
    const normalizedText = text.replace(/\u0000/g, '').trim()
    if (!normalizedText) {
      throw new ApiError(422, 'No readable text was found in the resume')
    }
    return normalizedText
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(422, 'Resume text could not be extracted from this file')
  }
}
