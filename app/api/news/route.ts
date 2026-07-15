import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLiveNews, type NewsArticle } from '@/lib/news-feeds'
import { clientIp, tooManyRequests, rateLimit } from '@/lib/rate-limit'

/*
 * Live news, straight from publisher RSS.
 *
 * Rows in the News table are the fallback, not the source: they are seed data
 * and never change, so serving them meant the tab was permanently stale. They
 * still matter when every feed is unreachable (offline, or all four down),
 * which is why they are kept rather than dropped.
 */

// Never cached by Next -- the point of the tab is that it is current. The
// 10-minute cache inside getLiveNews is what protects the publishers' servers.
export const dynamic = 'force-dynamic'

function fromDb(rows: { id: number; title: string; content: string; source: string; createdAt: Date }[]): NewsArticle[] {
  return rows.map((r) => ({
    id: `db-${r.id}`,
    title: r.title,
    summary: r.content,
    url: '', // stored rows have no link; the UI hides "Read full article" for these
    source: r.source,
    author: null,
    publishedAt: r.createdAt.toISOString(),
    category: null,
  }))
}

export async function GET(req: NextRequest) {
  // Forcing a refetch reaches four external servers, so it is throttled harder
  // than an ordinary read.
  const force = new URL(req.url).searchParams.get('refresh') === '1'
  if (force) {
    const rl = rateLimit(`news-refresh:${clientIp(req)}`, 5, 60_000)
    if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds)
  }

  try {
    const live = await getLiveNews(force)
    if (live.length > 0) {
      return NextResponse.json({ articles: live, live: true, fetchedAt: new Date().toISOString() })
    }
  } catch {
    // fall through to stored news
  }

  try {
    const rows = await prisma.news.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ articles: fromDb(rows), live: false, fetchedAt: new Date().toISOString() })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 })
  }
}
