import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { config } from './config/env'
import { errorHandler } from './middleware/errorHandler'
import { notFound } from './middleware/notFound'
import { requestLogger } from './middleware/requestLogger'
import rootRouter from './routes/root.routes'
import healthRouter from './routes/health.routes'
import profileRouter from './routes/profile.routes'
import resumeRouter from './routes/resume.routes'
import jobRouter from './routes/job.routes'
import matchRouter from './routes/match.routes'
import roadmapRouter from './routes/roadmap.routes'
import applicationRouter from './routes/application.routes'
import interviewRouter from './routes/interview.routes'
import knowledgeRouter from './routes/knowledge.routes'
import copilotRouter from './routes/copilot.routes'

const app = express()

app.use(helmet())
app.use(cors({ origin: config.frontendUrl }))
app.use(requestLogger)
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

app.use('/', rootRouter)
app.use('/api', healthRouter)
app.use('/api/profile', profileRouter)
app.use('/api/resumes', resumeRouter)
app.use('/api/jobs', jobRouter)
app.use('/api/matches', matchRouter)
app.use('/api/roadmaps', roadmapRouter)
app.use('/api/applications', applicationRouter)
app.use('/api/interviews', interviewRouter)
app.use('/api/knowledge', knowledgeRouter)
app.use('/api/copilot', copilotRouter)

app.use(notFound)
app.use(errorHandler)

export default app
