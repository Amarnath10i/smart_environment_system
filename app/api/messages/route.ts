import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { publish } from '@/lib/events'
import { messageQuerySchema, messageSchema, parseBody, parseQuery } from '@/lib/validation'

/** True when `userId` is the creator of, or a member of, `groupId`. */
async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      OR: [{ creatorId: userId }, { members: { some: { id: userId } } }],
    },
    select: { id: true },
  })
  return group !== null
}

/**
 * Group chat is members-only. This previously required no auth at all, and
 * omitting groupId returned every message in every group.
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth.ok) return auth.response

  const query = parseQuery(request.url, messageQuerySchema)
  if (!query.ok) return query.response
  const { groupId, page, limit } = query.data

  try {
    if (!(await isGroupMember(groupId, auth.user.id))) {
      return NextResponse.json({ error: 'You are not a member of this group' }, { status: 403 })
    }

    const [rows, total] = await Promise.all([
      prisma.message.findMany({
        where: { groupId },
        include: { user: { select: { id: true, name: true } } },
        // Newest-first so page 1 is the recent tail of a long chat...
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.message.count({ where: { groupId } }),
    ])

    // ...then flipped back to chronological for display.
    return NextResponse.json({
      items: rows.reverse(),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, messageSchema)
  if (!parsed.ok) return parsed.response
  const { content, groupId } = parsed.data

  try {
    if (!(await isGroupMember(groupId, auth.user.id))) {
      return NextResponse.json({ error: 'You are not a member of this group' }, { status: 403 })
    }

    const message = await prisma.message.create({
      // Author is the token holder, never a body field.
      data: { content, groupId, userId: auth.user.id },
      include: { user: { select: { id: true, name: true } } },
    })

    publish({
      type: 'message:new',
      audience: { groupId },
      payload: {
        id: message.id,
        groupId,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        user: message.user,
      },
    })

    return NextResponse.json(message, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
