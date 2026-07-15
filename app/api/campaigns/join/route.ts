import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { joinCampaignSchema, parseBody } from '@/lib/validation'
import { publish } from '@/lib/events'

/**
 * Joins the *caller* to a campaign. The body carries only the campaign id:
 * taking a userId here previously let anyone enrol anyone else.
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, joinCampaignSchema)
  if (!parsed.ok) return parsed.response

  try {
    const campaign = await prisma.campaign.update({
      where: { id: parsed.data.campaignId },
      data: { participants: { connect: { id: auth.user.id } } },
      include: { _count: { select: { participants: true } } },
    })
    publish({ type: 'campaign:join', audience: 'public', payload: { id: campaign.id } })
    return NextResponse.json(campaign)
  } catch (error) {
    // P2025: the campaign id does not exist.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to join campaign' }, { status: 500 })
  }
}
