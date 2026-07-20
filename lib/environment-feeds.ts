import { XMLParser } from 'fast-xml-parser'

/**
 * Live environmental campaigns, groups, and fundraisers from real sources.
 *
 * Sources checked:
 * - GlobalGiving API (projects tagged environment/climate)
 * - Change.org RSS (environment petitions as campaigns)
 * - Greenpeace / WWF campaign pages (RSS where available)
 * - Meetup.com groups (environment/climate tags) - via RSS if public
 *
 * All sources are public, no API key required.
 */

export type CampaignSource = {
  name: string
  url: string
  homepage: string
}

export type CampaignItem = {
  id: string
  title: string
  description: string
  url: string
  source: string
  author: string | null
  publishedAt: string | null
  category: string | null
  goal?: number
  raised?: number
  location?: string
  participants?: number
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  isArray: (name) => name === 'item' || name === 'entry' || name === 'project',
})

function toText(v: unknown): string {
  if (v == null) return ''
  let raw: string
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('__cdata' in o) raw = String(o.__cdata)
    else if ('#text' in o) raw = String(o['#text'])
    else return ''
  } else {
    raw = String(v)
  }
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#3[49];/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function firstString(v: unknown): string {
  if (Array.isArray(v)) return toText(v[0])
  return toText(v)
}

// ============================================================================
// CAMPAIGNS: GlobalGiving projects (environment/climate tags) + Change.org petitions
// ============================================================================

const CAMPAIGN_SOURCES: CampaignSource[] = [
  // GlobalGiving: projects tagged "Environment" or "Climate Change"
  // Using their public project feed (no auth needed for basic listing)
  { name: 'GlobalGiving', url: 'https://api.globalgiving.org/api/public/projectservice/projects/search?tag=environment&format=rss', homepage: 'https://www.globalgiving.org/projects/environment/' },
  { name: 'GlobalGiving Climate', url: 'https://api.globalgiving.org/api/public/projectservice/projects/search?tag=climate%20change&format=rss', homepage: 'https://www.globalgiving.org/projects/climate-change/' },
  // Change.org environment petitions RSS
  { name: 'Change.org Environment', url: 'https://www.change.org/rss?category=environment', homepage: 'https://www.change.org/categories/environment' },
  // 350.org campaigns
  { name: '350.org', url: 'https://350.org/feed/', homepage: 'https://350.org/campaigns/' },
  // Sierra Club
  { name: 'Sierra Club', url: 'https://www.sierraclub.org/rss.xml', homepage: 'https://www.sierraclub.org/campaigns' },
]

async function fetchCampaignSource(source: CampaignSource): Promise<CampaignItem[]> {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'EarthPulse/1.0 (+environmental dashboard)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseCampaignFeed(xml, source)
  } catch {
    return []
  }
}

function parseCampaignFeed(xml: string, source: CampaignSource): CampaignItem[] {
  const doc = parser.parse(xml)
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.projects?.project ?? []
  if (!Array.isArray(items)) return []

  return items.flatMap((it: Record<string, unknown>): CampaignItem[] => {
    const title = toText(it.title)
    const link = typeof it.link === 'object' && it.link !== null && '@_href' in (it.link as object)
      ? String((it.link as Record<string, unknown>)['@_href'])
      : toText(it.link)
    if (!title || !link) return []

    const description = toText(it.description ?? it.summary ?? it['content:encoded'] ?? it['project:description'] ?? it['project:summary']).slice(0, 500)
    const date = toText(it.pubDate ?? it.published ?? it.updated ?? it['project:startDate'])
    const parsed = date ? new Date(date) : null

    // Extract goal/raised from GlobalGiving specific fields
    let goal: number | undefined
    let raised: number | undefined
    if (it['project:funding'] && typeof it['project:funding'] === 'object') {
      const funding = it['project:funding'] as Record<string, unknown>
      if ('@_goal' in funding) goal = parseFloat(String(funding['@_goal']))
      if ('@_raised' in funding) raised = parseFloat(String(funding['@_raised']))
    }

    // Location from GlobalGiving
    let location: string | undefined
    if (it['project:country']) location = toText(it['project:country'])
    else if (it['project:region']) location = toText(it['project:region'])

    return [{
      id: link,
      title,
      description,
      url: link,
      source: source.name,
      author: firstString(it['dc:creator'] ?? it.author ?? it['project:organization']) || null,
      publishedAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      category: firstString(it.category ?? it['project:themeName']) || null,
      goal,
      raised,
      location,
    }]
  })
}

// ============================================================================
// GROUPS: Meetup.com environment groups (via RSS where available)
// ============================================================================

export type GroupItem = {
  id: string
  name: string
  issue: string
  url: string
  source: string
  location: string | null
  members: number | null
  createdAt: string | null
}

const GROUP_SOURCES = [
  { name: 'Meetup Climate', url: 'https://www.meetup.com/find/feed/?keywords=climate%20change&location=all', homepage: 'https://www.meetup.com/find/?keywords=climate%20change' },
  { name: 'Meetup Environment', url: 'https://www.meetup.com/find/feed/?keywords=environment&location=all', homepage: 'https://www.meetup.com/find/?keywords=environment' },
  { name: 'Meetup Conservation', url: 'https://www.meetup.com/find/feed/?keywords=conservation&location=all', homepage: 'https://www.meetup.com/find/?keywords=conservation' },
]

async function fetchGroupSource(source: { name: string; url: string; homepage: string }): Promise<GroupItem[]> {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'EarthPulse/1.0 (+environmental dashboard)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseGroupFeed(xml, source)
  } catch {
    return []
  }
}

function parseGroupFeed(xml: string, source: { name: string; url: string; homepage: string }): GroupItem[] {
  const doc = parser.parse(xml)
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? []
  if (!Array.isArray(items)) return []

  return items.flatMap((it: Record<string, unknown>): GroupItem[] => {
    const name = toText(it.title)
    const link = typeof it.link === 'object' && it.link !== null && '@_href' in (it.link as object)
      ? String((it.link as Record<string, unknown>)['@_href'])
      : toText(it.link)
    if (!name || !link) return []

    const description = toText(it.description ?? it.summary).slice(0, 300)
    const date = toText(it.pubDate ?? it.published ?? it.updated)
    const parsed = date ? new Date(date) : null

    // Extract member count if available (Meetup sometimes includes it)
    let members: number | null = null
    const memberMatch = description.match(/(\d+)\s*(members?|people)/i)
    if (memberMatch) members = parseInt(memberMatch[1], 10)

    // Extract location
    let location: string | null = null
    const locationMatch = description.match(/in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i)
    if (locationMatch) location = locationMatch[1]

    return [{
      id: link,
      name,
      issue: description || 'Environmental action group',
      url: link,
      source: source.name,
      location,
      members,
      createdAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    }]
  })
}

// ============================================================================
// FUNDRAISERS: GlobalGiving projects with funding data
// ============================================================================

export type FundraiserItem = {
  id: string
  cause: string
  description: string
  url: string
  source: string
  goal: number
  raised: number
  location: string | null
  category: string | null
  createdAt: string | null
}

const FUNDRAISER_SOURCES = [
  { name: 'GlobalGiving Environment', url: 'https://api.globalgiving.org/api/public/projectservice/projects/search?tag=environment&format=rss', homepage: 'https://www.globalgiving.org/projects/environment/' },
  { name: 'GlobalGiving Climate', url: 'https://api.globalgiving.org/api/public/projectservice/projects/search?tag=climate%20change&format=rss', homepage: 'https://www.globalgiving.org/projects/climate-change/' },
  { name: 'GlobalGiving Wildlife', url: 'https://api.globalgiving.org/api/public/projectservice/projects/search?tag=wildlife&format=rss', homepage: 'https://www.globalgiving.org/projects/wildlife/' },
  { name: 'GlobalGiving Water', url: 'https://api.globalgiving.org/api/public/projectservice/projects/search?tag=water&format=rss', homepage: 'https://www.globalgiving.org/projects/water-sanitation/' },
]

async function fetchFundraiserSource(source: { name: string; url: string; homepage: string }): Promise<FundraiserItem[]> {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'EarthPulse/1.0 (+environmental dashboard)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseFundraiserFeed(xml, source)
  } catch {
    return []
  }
}

function parseFundraiserFeed(xml: string, source: { name: string; url: string; homepage: string }): FundraiserItem[] {
  const doc = parser.parse(xml)
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.projects?.project ?? []
  if (!Array.isArray(items)) return []

  return items.flatMap((it: Record<string, unknown>): FundraiserItem[] => {
    const title = toText(it.title)
    const link = typeof it.link === 'object' && it.link !== null && '@_href' in (it.link as object)
      ? String((it.link as Record<string, unknown>)['@_href'])
      : toText(it.link)
    if (!title || !link) return []

    const description = toText(it.description ?? it.summary ?? it['content:encoded'] ?? it['project:description'] ?? it['project:summary']).slice(0, 500)
    const date = toText(it.pubDate ?? it.published ?? it.updated ?? it['project:startDate'])
    const parsed = date ? new Date(date) : null

    let goal = 0
    let raised = 0
    if (it['project:funding'] && typeof it['project:funding'] === 'object') {
      const funding = it['project:funding'] as Record<string, unknown>
      if ('@_goal' in funding) goal = parseFloat(String(funding['@_goal'])) || 0
      if ('@_raised' in funding) raised = parseFloat(String(funding['@_raised'])) || 0
    }

    let location: string | null = null
    if (it['project:country']) location = toText(it['project:country'])
    else if (it['project:region']) location = toText(it['project:region'])

    return [{
      id: link,
      cause: title,
      description,
      url: link,
      source: source.name,
      goal,
      raised,
      location,
      category: firstString(it.category ?? it['project:themeName']) || null,
      createdAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    }]
  })
}

// ============================================================================
// UNIFIED FETCH FUNCTIONS WITH CACHING
// ============================================================================

const TTL_MS = 30 * 60 * 1000 // 30 minutes (campaigns/groups/fundraisers change slower than news)

type Cache<T> = { at: number; data: T }
const campaignStore = globalThis as unknown as { __campaignCache?: Cache<CampaignItem[]> }
const groupStore = globalThis as unknown as { __groupCache?: Cache<GroupItem[]> }
const fundraiserStore = globalThis as unknown as { __fundraiserCache?: Cache<FundraiserItem[]> }

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>()
  for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item)
  return [...byId.values()]
}

/**
 * Fetch live environmental campaigns (petitions, projects, actions)
 */
export async function getLiveCampaigns(force = false): Promise<CampaignItem[]> {
  const hit = campaignStore.__campaignCache
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data

  const results = await Promise.all(CAMPAIGN_SOURCES.map(fetchCampaignSource))
  const campaigns = dedupeById(results.flat())
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0
      return tb - ta
    })
    .slice(0, 50)

  if (campaigns.length === 0) return hit?.data ?? []
  campaignStore.__campaignCache = { at: Date.now(), data: campaigns }
  return campaigns
}

/**
 * Fetch live environmental groups (community organizations)
 */
export async function getLiveGroups(force = false): Promise<GroupItem[]> {
  const hit = groupStore.__groupCache
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data

  const results = await Promise.all(GROUP_SOURCES.map(fetchGroupSource))
  const groups = dedupeById(results.flat())
    .sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0
      return tb - ta
    })
    .slice(0, 30)

  if (groups.length === 0) return hit?.data ?? []
  groupStore.__groupCache = { at: Date.now(), data: groups }
  return groups
}

/**
 * Fetch live environmental fundraisers (crowdfunding projects)
 */
export async function getLiveFundraisers(force = false): Promise<FundraiserItem[]> {
  const hit = fundraiserStore.__fundraiserCache
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data

  const results = await Promise.all(FUNDRAISER_SOURCES.map(fetchFundraiserSource))
  const fundraisers = dedupeById(results.flat())
    .filter(f => f.goal > 0) // Only show projects with funding goals
    .sort((a, b) => {
      // Sort by urgency: closest to deadline or lowest % funded
      const aProgress = a.goal > 0 ? a.raised / a.goal : 1
      const bProgress = b.goal > 0 ? b.raised / b.goal : 1
      return aProgress - bProgress
    })
    .slice(0, 40)

  if (fundraisers.length === 0) return hit?.data ?? []
  fundraiserStore.__fundraiserCache = { at: Date.now(), data: fundraisers }
  return fundraisers
}