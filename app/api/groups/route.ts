import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { publish } from '@/lib/events'
import { groupSchema, paginationSchema, parseBody, parseQuery } from '@/lib/validation'
import { getLiveGroups, toLocalGroup } from '@/lib/live-groups'

export async function GET(request: NextRequest) {
  const query = parseQuery(request.url, paginationSchema)
  if (!query.ok) return query.response
  const { page, limit } = query.data

  try {
    // Fetch live groups from external sources
    const liveItems = await getLiveGroups()
    const liveGroups = liveItems.map(toLocalGroup)

    // Fetch local groups from DB
    const [localItems, total] = await Promise.all([
      prisma.group.findMany({
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

    // Merge: live first, then local
    const merged = [...liveGroups, ...localItems]
    const paginated = merged.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      items: paginated,
      page,
      limit,
      total: merged.length,
      totalPages: Math.ceil(merged.length / limit),
    })
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