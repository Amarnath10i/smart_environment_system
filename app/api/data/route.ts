import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/api-auth'
import { publish } from '@/lib/events'
import { parseBody, parseQuery, sensorDataSchema } from '@/lib/validation'
import { z } from 'zod'

const dataQuerySchema = z.object({
  sensorId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
})

/** Readings are public: the dashboard charts them for anonymous visitors. */
export async function GET(request: NextRequest) {
  const query = parseQuery(request.url, dataQuerySchema)
  if (!query.ok) return query.response
  const { sensorId, limit } = query.data

  try {
    const data = await prisma.sensorData.findMany({
      where: sensorId ? { sensorId } : {},
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: { sensor: true },
    })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}

/**
 * Ingest is restricted to the roles that own hardware. Anonymous writes let
 * anyone forge readings, which drive the alert thresholds and the charts.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'technician', 'admin')
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, sensorDataSchema)
  if (!parsed.ok) return parsed.response
  const { sensorId, value } = parsed.data

  try {
    const sensor = await prisma.sensor.findUnique({ where: { id: sensorId }, select: { id: true } })
    if (!sensor) {
      return NextResponse.json({ error: 'Sensor not found' }, { status: 404 })
    }

    const data = await prisma.sensorData.create({ data: { sensorId, value } })

    publish({
      type: 'sensor:data',
      audience: 'public',
      payload: { sensorId, value, timestamp: data.timestamp.toISOString() },
    })

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create data' }, { status: 500 })
  }
}
