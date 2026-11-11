import { config } from './config/env'
import app from './app'

const server = app.listen(config.port, () => {
  console.info(`[server] CareerPilot AI backend listening at http://localhost:${config.port}`)
})

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`[server] Failed to start: ${error.message}`)
  process.exitCode = 1
})

let isShuttingDown = false

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  console.info(`[server] Received ${signal}; shutting down gracefully`)

  server.close((error) => {
    if (error) {
      console.error('[server] Error while shutting down:', error.message)
      process.exitCode = 1
      return
    }

    console.info('[server] Shutdown complete')
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
