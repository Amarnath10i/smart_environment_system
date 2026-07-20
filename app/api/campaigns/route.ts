import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { publish } from '@/lib/events'
import { campaignSchema, paginationSchema, parseBody, parseQuery } from '@/lib/validation'
import { getLiveCampaigns, toLocalCampaign } from '@/lib/live-campaigns'

export async function GET(request: NextRequest) {
  const query = parseQuery(request.url, paginationSchema)
  if (!query.ok) return query.response
  const { page, limit } = query.data

  try {
    // Fetch live campaigns from external sources
    const liveItems = await getLiveCampaigns()
    const liveCampaigns = liveItems.map(toLocalCampaign)

    // Fetch local campaigns from DB
    const [localItems, total] = await Promise.all([
      prisma.campaign.findMany({
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

    // Merge: live first, then local
    const merged = [...liveCampaigns, ...localItems]
    const paginated = merged.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      items: paginated,
      page,
      limit,
      total: merged.length,
      totalPages: Math.ceil(merged.length / limit),
    })
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
      data: { ...parsed.data, creatorId: auth.user.id },
      include: { creator: { select: { id: true, name: true } } },
    })

    publish({ type: 'campaign:new', audience: 'public', payload: { id: campaign.id, title: campaign.title } })

    return NextResponse.json(campaign, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}