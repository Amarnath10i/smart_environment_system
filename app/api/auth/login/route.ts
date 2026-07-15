import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, toRole } from '@/lib/auth'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { loginSchema, parseBody } from '@/lib/validation'

const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60 * 1000

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, loginSchema)
  if (!parsed.ok) return parsed.response
  const { email, password } = parsed.data

  // Keyed on IP *and* email: an attacker rotating emails from one address is
  // still throttled, and one victim's account cannot be locked out from
  // elsewhere by exhausting a purely email-keyed budget.
  const limit = rateLimit(`login:${clientIp(request)}:${email.toLowerCase()}`, MAX_ATTEMPTS, WINDOW_MS)
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds)

  try {
    const user = await prisma.user.findUnique({ where: { email } })

    // Same generic message whether the email is unknown or the password is
    // wrong, so this cannot be used to enumerate registered accounts.
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const token = signToken({ id: user.id, email: user.email, role: toRole(user.role) })
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    })
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
