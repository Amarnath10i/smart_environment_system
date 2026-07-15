/**
 * Browser-side API helper.
 *
 * Exists so the Bearer token is attached in exactly one place. Every mutating
 * endpoint now derives the caller from that token, so a request sent without
 * it comes back 401 -- which is the whole point: identity is no longer
 * something the page can assert by putting a userId in the body.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

function headers(withBody: boolean): Record<string, string> {
  const h: Record<string, string> = {}
  if (withBody) h['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function toResult<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)

  if (!res.ok) {
    // An expired or tampered token is unrecoverable in the UI: drop it so the
    // app falls back to the sign-in screen instead of looping on 401s.
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.fields)
  }

  return body as T
}

export async function apiGet<T>(path: string): Promise<T> {
  return toResult<T>(await fetch(path, { headers: headers(false) }))
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return toResult<T>(
    await fetch(path, { method: 'POST', headers: headers(true), body: JSON.stringify(body) }),
  )
}

/** Shape returned by the paginated list endpoints. */
export type Page<T> = {
  items: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}
