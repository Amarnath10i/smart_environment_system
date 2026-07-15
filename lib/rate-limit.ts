import { NextResponse } from 'next/server'

/**
 * Fixed-window rate limiter.
 *
 * Scope: in-memory, per-process. It resets on restart and does not coordinate
 * across replicas, so it raises the cost of online password guessing rather
 * than being an authoritative control. A shared store (Redis) is the upgrade
 * path if this ever runs on more than one instance.
 */

type Window = { count: number; resetAt: number }

const globalForRateLimit = globalThis as unknown as { rateLimitHits?: Map<string, Window> }
const hits: Map<string, Window> = (globalForRateLimit.rateLimitHits ??= new Map())

/** Bounds memory: expired windows are dropped on each sweep. */
function sweep(now: number) {
  if (hits.size < 5000) return
  for (const [key, window] of hits) {
    if (window.resetAt <= now) hits.delete(key)
  }
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = hits.get(key)
  if (!existing || existing.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  existing.count += 1
  const allowed = existing.count <= limit
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  }
}

/**
 * Best-effort client identity. Behind a proxy this trusts x-forwarded-for,
 * which a direct caller can spoof -- acceptable for throttling, not for
 * anything security-critical on its own.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many attempts. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}
