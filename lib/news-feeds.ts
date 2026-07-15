import { XMLParser } from 'fast-xml-parser'

/**
 * Live environmental news, pulled from publisher RSS feeds.
 *
 * Why RSS and not a news API: NewsAPI, GNews and the Guardian's own JSON API all
 * need an API key, and a key cannot be shipped in a public repo. These feeds are
 * the publishers' own, need no key, and carry everything the UI shows — headline,
 * summary, author, publisher and link. Every URL here was checked to return 200
 * with real <item> entries; NASA's climate feed and phys.org's were dropped
 * because they now redirect to HTML and 404 respectively.
 *
 * Fetching happens server-side, so the publishers' lack of CORS headers is not a
 * problem — the browser never talks to them directly.
 */

export type FeedSource = { name: string; url: string; homepage: string }

export const FEEDS: FeedSource[] = [
  { name: 'The Guardian', url: 'https://www.theguardian.com/environment/rss', homepage: 'https://www.theguardian.com/environment' },
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', homepage: 'https://www.bbc.com/news/science_and_environment' },
  { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/earth_climate/environmental_science.xml', homepage: 'https://www.sciencedaily.com/news/earth_climate/environmental_science/' },
  { name: 'Grist', url: 'https://grist.org/feed/', homepage: 'https://grist.org' },
]

export type NewsArticle = {
  id: string
  title: string
  summary: string
  url: string
  source: string
  author: string | null
  publishedAt: string | null
  category: string | null
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Feeds wrap HTML summaries in CDATA; keep them as plain strings.
  cdataPropName: '__cdata',
  // A feed with exactly one item must still parse as a list, not a bare object.
  isArray: (name) => name === 'item',
})

/** RSS summaries carry markup and entities; the UI renders plain text. */
function toText(v: unknown): string {
  if (v == null) return ''

  /*
   * An element with XML attributes parses as an object, with its text under
   * '#text' -- e.g. the Guardian's <category domain="...">Climate</category>.
   * Stringifying that directly yielded a literal "[object Object]" in the UI.
   */
  let raw: string
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('__cdata' in o) raw = String(o.__cdata)
    else if ('#text' in o) raw = String(o['#text'])
    else return '' // an object with no text of its own contributes nothing
  } else {
    raw = String(v)
  }
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#3[49];/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function firstString(v: unknown): string {
  if (Array.isArray(v)) return toText(v[0])
  return toText(v)
}

function parseFeed(xml: string, source: FeedSource): NewsArticle[] {
  const doc = parser.parse(xml)
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? []
  if (!Array.isArray(items)) return []

  return items.flatMap((it: Record<string, unknown>): NewsArticle[] => {
    const title = toText(it.title)
    // Atom puts the URL in link/@_href; RSS puts it in the element's text.
    const link = typeof it.link === 'object' && it.link !== null && '@_href' in (it.link as object)
      ? String((it.link as Record<string, unknown>)['@_href'])
      : toText(it.link)
    if (!title || !link) return [] // an item with no headline or link is unusable

    const date = toText(it.pubDate) || toText(it.published) || toText(it.updated)
    const parsed = date ? new Date(date) : null

    return [{
      // Stable across refetches, so React keys and "read" state stay put.
      id: link,
      title,
      summary: toText(it.description ?? it.summary ?? it['content:encoded']).slice(0, 400),
      url: link,
      source: source.name,
      author: firstString(it['dc:creator'] ?? it.author) || null,
      publishedAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      category: firstString(it.category) || null,
    }]
  })
}

/*
 * Cached for 10 minutes, per process.
 *
 * These are other people's servers: refetching all four on every page load would
 * be rude and slow, and RSS updates on the order of hours anyway. globalThis
 * keeps the cache alive across dev-server hot reloads.
 */
const TTL_MS = 10 * 60 * 1000
type Cache = { at: number; articles: NewsArticle[] }
const store = globalThis as unknown as { __newsCache?: Cache }

async function fetchOne(source: FeedSource): Promise<NewsArticle[]> {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'EarthPulse/1.0 (+environmental dashboard)' },
      signal: AbortSignal.timeout(8000), // one slow publisher must not stall the page
    })
    if (!res.ok) return []
    return parseFeed(await res.text(), source)
  } catch {
    // A source being down is normal, not exceptional — the others still render.
    return []
  }
}

/**
 * Live articles, newest first. Returns whatever succeeded: one dead feed costs
 * its own items, never the whole page. Empty means every source failed, which
 * the caller treats as a reason to fall back to stored news.
 */
export async function getLiveNews(force = false): Promise<NewsArticle[]> {
  const hit = store.__newsCache
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.articles

  const results = await Promise.all(FEEDS.map(fetchOne))

  /*
   * De-duplicate by URL. Feeds republish the same story, and a wire piece can
   * appear in more than one of these sources, so the raw concatenation contains
   * repeats — which React reports as duplicate keys, since the URL is the id.
   * First occurrence wins.
   */
  const byUrl = new Map<string, NewsArticle>()
  for (const a of results.flat()) if (!byUrl.has(a.url)) byUrl.set(a.url, a)

  const articles = [...byUrl.values()].sort((a, b) => {
    // Undated items sort last rather than jumping to the top.
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0
    return tb - ta
  })

  if (articles.length === 0) return hit?.articles ?? [] // keep stale over empty
  store.__newsCache = { at: Date.now(), articles }
  return articles
}
