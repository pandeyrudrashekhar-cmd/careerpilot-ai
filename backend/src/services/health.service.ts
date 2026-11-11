export function getHealthStatus() {
  return {
    status: 'healthy' as const,
    service: 'careerpilot-backend' as const,
  }
}
