'use client'

import { useEffect, useRef } from 'react'
import { getToken } from '@/lib/api-client'

type Handler = (eventType: string, payload: unknown) => void

/**
 * Subscribes to /api/events for the life of the component.
 *
 * Uses fetch + ReadableStream rather than EventSource. EventSource cannot set
 * an Authorization header, which would force the token into the query string
 * where it lands in access logs and browser history. The cost is that
 * reconnection is ours to implement (EventSource gives it for free), so there
 * is a backoff loop below.
 */
export function useEventStream(onEvent: Handler, enabled = true, reconnectKey: unknown = 0) {
  // Kept in a ref so a new inline handler on each render does not tear down
  // and rebuild the connection.
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    let stopped = false
    let attempt = 0

    const run = async () => {
      while (!stopped) {
        try {
          const token = getToken()
          const res = await fetch('/api/events', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          })
          if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`)

          attempt = 0
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
          let buffer = ''

          while (!stopped) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += value
            // SSE frames are separated by a blank line; the last chunk may be
            // a partial frame, so it stays in the buffer.
            const frames = buffer.split('\n\n')
            buffer = frames.pop() ?? ''

            for (const frame of frames) {
              let name = 'message'
              const data: string[] = []

              for (const line of frame.split('\n')) {
                if (line.startsWith(':')) continue // heartbeat
                if (line.startsWith('event:')) name = line.slice(6).trim()
                else if (line.startsWith('data:')) data.push(line.slice(5).trim())
              }

              if (!data.length) continue
              try {
                handlerRef.current(name, JSON.parse(data.join('\n')))
              } catch {
                // A frame we cannot parse must not kill the stream.
              }
            }
          }
        } catch {
          if (stopped || controller.signal.aborted) return
        }

        if (stopped) return
        // Back off so a server restart does not get hammered by every tab.
        attempt += 1
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000)
        await new Promise((r) => setTimeout(r, delay))
      }
    }

    void run()

    return () => {
      stopped = true
      controller.abort()
    }
    // reconnectKey forces a fresh connection: the server resolves group
    // membership once at connect, so joining a group needs a new stream
    // before its chat will arrive.
  }, [enabled, reconnectKey])
}
