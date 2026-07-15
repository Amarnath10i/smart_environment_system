import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { joinGroupSchema, parseBody } from '@/lib/validation'

/**
 * Joins the *caller* to a group. The body carries only the group id: taking a
 * userId here previously let anyone add anyone else to any group.
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, joinGroupSchema)
  if (!parsed.ok) return parsed.response

  try {
    const group = await prisma.group.update({
      where: { id: parsed.data.groupId },
      data: { members: { connect: { id: auth.user.id } } },
      include: { _count: { select: { members: true } } },
    })
    return NextResponse.json(group)
  } catch (error) {
    // P2025: the group id does not exist.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to join group' }, { status: 500 })
  }
}
