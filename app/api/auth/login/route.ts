import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, toRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    const user = await prisma.user.findUnique({
      where: { email },
    })
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const token = signToken({ id: user.id, email: user.email, role: toRole(user.role) })
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token })
  } catch (error) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}