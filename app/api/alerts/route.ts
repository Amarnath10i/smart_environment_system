import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/api-auth'
import { alertSchema, parseBody } from '@/lib/validation'

/** Alerts are public: the dashboard shows them to anonymous visitors. */
export async function GET() {
  try {
    const alerts = await prisma.alert.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20,
      include: { sensor: { select: { type: true, location: true } } },
    })
    return NextResponse.json(alerts)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
  }
}

/**
 * Raising an alert is restricted: an anonymous caller could otherwise spam
 * "critical" notices at every user of the dashboard.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'technician', 'analyst', 'admin')
  if (!auth.ok) return auth.response

  const parsed = await parseBody(request, alertSchema)
  if (!parsed.ok) return parsed.response
  const { type, message, sensorId } = parsed.data

  try {
    if (sensorId) {
      const sensor = await prisma.sensor.findUnique({ where: { id: sensorId }, select: { id: true } })
      if (!sensor) {
        return NextResponse.json({ error: 'Sensor not found' }, { status: 404 })
      }
    }

    const alert = await prisma.alert.create({
      data: { type, message, ...(sensorId ? { sensorId } : {}) },
    })
    return NextResponse.json(alert, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 })
  }
}
