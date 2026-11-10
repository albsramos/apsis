/**
 * The one place every generated hook goes through (Orval's "mutator").
 * While there is no backend, requests are answered in the browser by the mock server. Set VITE_API_MOCK=false
 * (and proxy /api in vite.config.ts) to talk to a real one; nothing else in the app changes.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

const useMock = import.meta.env.VITE_API_MOCK !== 'false'

export const http = async <T>(url: string, options?: RequestInit): Promise<T> => {
  if (useMock) {
    const { mockFetch } = await import('@/mocks')
    return mockFetch<T>(url, options)
  }
  const res = await fetch(url, options)
  const body: unknown = res.status === 204 ? undefined : await res.json()
  if (!res.ok) {
    const message = (body as { message?: string } | undefined)?.message ?? res.statusText
    throw new ApiRequestError(res.status, message)
  }
  return body as T
}
