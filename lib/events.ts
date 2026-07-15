/**
 * In-process pub/sub backing the SSE stream in app/api/events.
 *
 * Scope: a single Node process. Events reach only the clients connected to
 * *this* instance, which is fine for one dev/single-instance deployment but
 * will not fan out across replicas or Vercel's serverless functions -- that
 * needs a shared broker (Redis pub/sub, Ably, Pusher). Documented rather than
 * abstracted, so the limit is visible at the point of use.
 */

export type AppEvent =
  | { type: 'sensor:data'; audience: 'public'; payload: { sensorId: number; value: number; timestamp: string } }
  | { type: 'alert:new'; audience: 'public'; payload: { id: number; type: string; message: string } }
  | { type: 'donation:new'; audience: 'public'; payload: { fundraiserId: number; amount: number; raised: number; goal: number } }
  | { type: 'campaign:new'; audience: 'public'; payload: { id: number; title: string } }
  | { type: 'group:new'; audience: 'public'; payload: { id: number; name: string } }
  | {
      type: 'message:new'
      // Group chat is members-only, so these carry the group they belong to
      // and the stream filters on it.
      audience: { groupId: number }
      payload: { id: number; groupId: number; content: string; createdAt: string; user: { id: number; name: string | null } }
    }

type Subscriber = (event: AppEvent) => void

// Survives HMR in dev, which would otherwise leave subscribers stranded on a
// discarded module instance (same trick as lib/prisma.ts).
const globalForEvents = globalThis as unknown as { subscribers?: Set<Subscriber> }
const subscribers: Set<Subscriber> = (globalForEvents.subscribers ??= new Set())

/** Registers `fn` for every event. Returns the unsubscribe. */
export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

/**
 * Fire-and-forget. A throwing subscriber (e.g. a socket that closed between
 * the check and the write) must not break the request that published, nor
 * stop delivery to the other subscribers.
 */
export function publish(event: AppEvent): void {
  for (const fn of subscribers) {
    try {
      fn(event)
    } catch (error) {
      console.error('[events] subscriber failed', error)
    }
  }
}

export function subscriberCount(): number {
  return subscribers.size
}
