import jwt from 'jsonwebtoken'

export type Role = 'admin' | 'analyst' | 'public' | 'technician'

export type TokenPayload = {
  id: number
  email: string
  role: Role
}

const TOKEN_TTL = '7d'

const ROLES: readonly Role[] = ['admin', 'analyst', 'public', 'technician']

/**
 * Narrows the free-form role column to a known Role. SQLite has no enum, so a
 * row can hold anything; an unrecognised value falls back to the least
 * privileged role rather than being trusted as-is.
 */
export function toRole(value: string): Role {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : 'public'
}

/**
 * Refuses a guessable secret. This previously defaulted to the literal string
 * 'secret', which let anyone mint a valid admin token.
 */
function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret === 'secret' || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set to a random string of at least 32 characters. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    )
  }
  return secret
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL })
}

/**
 * Returns the payload, or null for any token that is malformed, expired,
 * signed with the wrong key, or missing the fields we depend on — so callers
 * get one falsy path instead of a throw that is easy to forget to catch.
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret())
    if (typeof decoded !== 'object' || decoded === null) return null

    const { id, email, role } = decoded as Record<string, unknown>
    if (typeof id !== 'number' || typeof email !== 'string' || typeof role !== 'string') return null

    return { id, email, role: toRole(role) }
  } catch {
    return null
  }
}
