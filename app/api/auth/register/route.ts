import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { signToken, toRole } from '@/lib/auth'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { parseBody, registerSchema } from '@/lib/validation'

const MAX_SIGNUPS = 5
const WINDOW_MS = 60 * 60 * 1000

export async function POST(request: NextRequest) {
  // Validation is what stops an empty or one-character password being hashed
  // and stored: the schema requires 8+ characters and a real email.
  const parsed = await parseBody(request, registerSchema)
  if (!parsed.ok) return parsed.response
  const { email, password, name } = parsed.data

  const limit = rateLimit(`register:${clientIp(request)}`, MAX_SIGNUPS, WINDOW_MS)
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds)

  try {
    const hashedPassword = bcrypt.hashSync(password, 10)
    const verifyToken = crypto.randomBytes(32).toString('hex')

    const user = await prisma.user.create({
      // role is hardcoded: it must never be settable from the request body,
      // or anyone could register straight into 'admin'.
      data: { email, password: hashedPassword, name, role: 'public', verifyToken, isVerified: false },
    })

    if (process.env.SMTP_USER) {
      try {
        const { sendVerificationEmail } = await import('@/lib/email')
        await sendVerificationEmail(email, verifyToken, name || email)
      } catch (e) {
        console.warn('Email send failed (check SMTP config):', e)
      }
    }

    const token = signToken({ id: user.id, email: user.email, role: toRole(user.role) })
    return NextResponse.json(
      {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, isVerified: user.isVerified },
        token,
        message: process.env.SMTP_USER
          ? 'Account created! Check your email to verify.'
          : 'Account created successfully!',
      },
      { status: 201 },
    )
  } catch (error) {
    // P2002: the unique constraint on email.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 400 })
  }
}
