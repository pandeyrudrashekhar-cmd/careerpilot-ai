const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api'

interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
}

export async function apiRequest<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })

  const payload = await response.json() as ApiResponse<T>
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.message || `Request failed (${response.status}).`)
  }

  return payload.data
}

export async function apiRequestWithoutData(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })

  const payload = await response.json() as { success: boolean; message?: string }
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || `Request failed (${response.status}).`)
  }
}
