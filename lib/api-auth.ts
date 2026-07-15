import { NextResponse } from 'next/server'
import { verifyToken, type Role, type TokenPayload } from '@/lib/auth'

/**
 * Reads the caller's identity from the Authorization header.
 *
 * Routes must use this instead of taking a userId/creatorId from the request
 * body: a body field is chosen by the caller, so it lets anyone act as anyone.
 */
export function getAuth(request: Request): TokenPayload | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  return verifyToken(header.slice(7).trim())
}

/**
 * Either the caller's identity, or a 401 to return:
 *
 *   const auth = requireAuth(request)
 *   if (!auth.ok) return auth.response
 *   // auth.user.id is now trustworthy
 */
export function requireAuth(
  request: Request,
): { ok: true; user: TokenPayload } | { ok: false; response: NextResponse } {
  const user = getAuth(request)
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    }
  }
  return { ok: true, user }
}

/** As requireAuth, plus a 403 unless the caller holds one of `roles`. */
export function requireRole(
  request: Request,
  ...roles: Role[]
): { ok: true; user: TokenPayload } | { ok: false; response: NextResponse } {
  const auth = requireAuth(request)
  if (!auth.ok) return auth

  if (!roles.includes(auth.user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'You do not have permission to perform this action' },
        { status: 403 },
      ),
    }
  }
  return auth
}
