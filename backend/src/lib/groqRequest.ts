const RETRY_DELAY_MS = 300
const MAX_ATTEMPTS = 2

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

export async function requestGroq(
  fetchImplementation: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = 60_000
): Promise<Response> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImplementation(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS) return response
      lastError = new Error(`Groq returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
      if (attempt === MAX_ATTEMPTS) throw error
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt))
  }

  throw lastError instanceof Error ? lastError : new Error('Groq request failed')
}
