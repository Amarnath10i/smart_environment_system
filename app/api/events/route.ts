import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuth } from '@/lib/api-auth'
import { subscribe, type AppEvent } from '@/lib/events'

// A stream must never be prerendered or cached, and needs a real Node runtime.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HEARTBEAT_MS = 25_000

/**
 * Server-Sent Events stream of live activity.
 *
 * Anonymous callers get the public events (sensor readings, alerts, donations,
 * new campaigns/groups). Authenticated callers additionally get chat from the
 * groups they belong to. Auth is optional so the public dashboard can stream
 * without a login.
 */
export async function GET(request: NextRequest) {
  const user = getAuth(request)

  // Membership is resolved once, at connect. A group joined later will not
  // stream until the client reconnects -- the frontend reconnects on join.
  let memberGroupIds = new Set<number>()
  if (user) {
    const groups = await prisma.group.findMany({
      where: { OR: [{ creatorId: user.id }, { members: { some: { id: user.id } } }] },
      select: { id: true },
    })
    memberGroupIds = new Set(groups.map((g) => g.id))
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let open = true

      const send = (chunk: string) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Client vanished between the abort event and this write.
          open = false
        }
      }

      const sendEvent = (event: AppEvent) => {
        send(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`)
      }

      const visible = (event: AppEvent) =>
        event.audience === 'public' || memberGroupIds.has(event.audience.groupId)

      const unsubscribe = subscribe((event) => {
        if (visible(event)) sendEvent(event)
      })

      // Comment frames keep intermediaries from closing an idle connection.
      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)

      const cleanup = () => {
        if (!open) return
        open = false
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      }

      // Without this the subscriber and interval leak for every closed tab.
      request.signal.addEventListener('abort', cleanup)

      send(`retry: 3000\n\n`)
      send(`event: ready\ndata: ${JSON.stringify({ authenticated: Boolean(user) })}\n\n`)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tells nginx not to buffer the stream into uselessness.
      'X-Accel-Buffering': 'no',
    },
  })
}
