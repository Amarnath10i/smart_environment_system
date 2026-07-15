import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { publish } from '@/lib/events'
import { groupSchema, paginationSchema, parseBody, parseQuery } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const query = parseQuery(request.url, paginationSchema)
  if (!query.ok) return query.response
  const { page, limit } = query.data

  try {
    const [items, total] = await Promise.all([
      prisma.group.findMany({
        // Public listing: names only. Emails are personal data and this
        // endpoint is unauthenticated.
        include: {
          creator: { select: { id: true, name: true } },
          members: { select: { id: true, name: true } },
          _count: { select: { messages: true, members: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.group.count(),
    ])

    return NextResponse.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, groupSchema)
  if (!parsed.ok) return parsed.response

  try {
    const group = await prisma.group.create({
      // The creator joins their own group, so they can post to it immediately.
      data: {
        ...parsed.data,
        creatorId: auth.user.id,
        members: { connect: { id: auth.user.id } },
      },
      include: { creator: { select: { id: true, name: true } } },
    })

    publish({ type: 'group:new', audience: 'public', payload: { id: group.id, name: group.name } })

    return NextResponse.json(group, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
  }
}
