import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { signToken, toRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json()
    const hashedPassword = bcrypt.hashSync(password, 10)
    const verifyToken = crypto.randomBytes(32).toString('hex')
    
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, role: 'public', verifyToken, isVerified: false },
    })

    // Try to send verification email (non-blocking)
    if (process.env.SMTP_USER) {
      try {
        const { sendVerificationEmail } = await import('@/lib/email')
        await sendVerificationEmail(email, verifyToken, name || email)
      } catch (e) {
        console.warn('Email send failed (check SMTP config):', e)
      }
    }

    const token = signToken({ id: user.id, email: user.email, role: toRole(user.role) })
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, isVerified: user.isVerified },
      token,
      message: process.env.SMTP_USER ? 'Account created! Check your email to verify.' : 'Account created successfully!'
    })
  } catch (error: any) {
    if (error.code === 'P2002') return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    return NextResponse.json({ error: 'Registration failed' }, { status: 400 })
  }
}
