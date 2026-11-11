import multer from 'multer'
import { config } from '../config/env'
import { isSupportedResumeFile } from '../services/resumeFile.service'
import { ApiError } from '../utils/ApiError'

export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.resumeMaxSizeBytes,
    files: 1,
    fields: 0,
  },
  fileFilter: (_request, file, callback) => {
    if (!isSupportedResumeFile(file.originalname, file.mimetype)) {
      callback(new ApiError(400, 'Only matching PDF and DOCX resume files are supported'))
      return
    }
    callback(null, true)
  },
})
