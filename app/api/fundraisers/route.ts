import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { fundraiserSchema, paginationSchema, parseBody, parseQuery } from '@/lib/validation'
import { publish } from '@/lib/events'

export async function GET(request: NextRequest) {
  const query = parseQuery(request.url, paginationSchema)
  if (!query.ok) return query.response
  const { page, limit } = query.data

  try {
    const [items, total] = await Promise.all([
      prisma.fundraiser.findMany({
        include: {
          creator: { select: { id: true, name: true } },
          _count: { select: { donations: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.fundraiser.count(),
    ])

    return NextResponse.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch fundraisers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, fundraiserSchema)
  if (!parsed.ok) return parsed.response

  try {
    const fundraiser = await prisma.fundraiser.create({
      // creatorId comes from the verified token, never the body.
      data: { ...parsed.data, creatorId: auth.user.id },
      include: { creator: { select: { id: true, name: true } } },
    })
    publish({ type: 'fundraiser:new', audience: 'public', payload: { id: fundraiser.id, cause: fundraiser.cause } })
    return NextResponse.json(fundraiser, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create fundraiser' }, { status: 500 })
  }
}
