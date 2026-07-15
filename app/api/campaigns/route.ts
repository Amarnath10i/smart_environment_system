import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { campaignSchema, paginationSchema, parseBody, parseQuery } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const query = parseQuery(request.url, paginationSchema)
  if (!query.ok) return query.response
  const { page, limit } = query.data

  try {
    const [items, total] = await Promise.all([
      prisma.campaign.findMany({
        // Public listing: names only. Emails are personal data and this
        // endpoint is unauthenticated.
        include: {
          creator: { select: { id: true, name: true } },
          participants: { select: { id: true, name: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.campaign.count(),
    ])

    return NextResponse.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, campaignSchema)
  if (!parsed.ok) return parsed.response

  try {
    const campaign = await prisma.campaign.create({
      // creatorId comes from the verified token, never from the body.
      data: { ...parsed.data, creatorId: auth.user.id },
      include: { creator: { select: { id: true, name: true } } },
    })
    return NextResponse.json(campaign, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}
