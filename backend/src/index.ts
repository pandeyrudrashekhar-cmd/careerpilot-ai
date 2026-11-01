import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

const app = express()
const PORT = process.env.PORT || 3001

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors())
app.use(express.json())

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'careerpilot-backend',
    timestamp: new Date().toISOString(),
  })
})

// ─── API Routes (placeholder — to be implemented in Phase 2) ─────────────────
app.get('/api', (_req, res) => {
  res.json({
    message: 'CareerPilot AI Backend API',
    version: '0.1.0',
    docs: '/api/docs',
  })
})

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`)
})

export default app
