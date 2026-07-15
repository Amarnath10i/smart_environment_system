import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { donationSchema, parseBody } from '@/lib/validation'

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, donationSchema)
  if (!parsed.ok) return parsed.response
  const { fundraiserId, amount, method } = parsed.data

  try {
    // One transaction: the old code created the donation and then bumped
    // `raised` in a separate call, so a failure in between recorded a donation
    // that the total never reflected.
    const result = await prisma.$transaction(async (tx) => {
      const exists = await tx.fundraiser.findUnique({
        where: { id: fundraiserId },
        select: { id: true },
      })
      if (!exists) return null

      const donation = await tx.donation.create({
        // Donor is the token holder. This used to be a body field, so anyone
        // could attribute a donation to any user.
        data: { fundraiserId, amount, method, userId: auth.user.id },
      })

      const fundraiser = await tx.fundraiser.update({
        where: { id: fundraiserId },
        data: { raised: { increment: amount } },
        select: { id: true, cause: true, raised: true, goal: true },
      })

      return { donation, fundraiser }
    })

    if (!result) {
      return NextResponse.json({ error: 'Fundraiser not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Donation failed' }, { status: 500 })
  }
}
