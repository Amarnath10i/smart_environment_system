import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/api-auth'
import { parseBody, parseQuery, sensorQuerySchema, sensorSchema } from '@/lib/validation'

/**
 * Sensors with a window of recent readings, newest last so charts can plot
 * them directly.
 *
 * This used to `take: 1`, which meant the dashboard only ever had a single
 * point per sensor and every trend chart rendered as one dot.
 */
export async function GET(request: NextRequest) {
  const query = parseQuery(request.url, sensorQuerySchema)
  if (!query.ok) return query.response
  const { history } = query.data

  try {
    const sensors = await prisma.sensor.findMany({
      include: {
        data: {
          // Newest-first to take the most recent `history` readings...
          orderBy: { timestamp: 'desc' },
          take: history,
          select: { id: true, value: true, timestamp: true },
        },
      },
      orderBy: { id: 'asc' },
    })

    // ...then reversed per sensor so the series runs oldest -> newest.
    return NextResponse.json(sensors.map((s) => ({ ...s, data: [...s.data].reverse() })))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch sensors' }, { status: 500 })
  }
}

/** Registering hardware is restricted to the roles that own it. */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'technician', 'admin')
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, sensorSchema)
  if (!parsed.ok) return parsed.response

  try {
    const sensor = await prisma.sensor.create({ data: parsed.data })
    return NextResponse.json(sensor, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create sensor' }, { status: 500 })
  }
}
