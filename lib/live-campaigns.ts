import { getLiveCampaigns, type CampaignItem } from './environment-feeds'

/**
 * Convert external campaign item to local campaign format
 */
export function toLocalCampaign(item: CampaignItem) {
  return {
    id: `live-${item.id}`,
    title: item.title,
    description: item.description,
    creatorId: 0,
    creator: { id: 0, name: item.source },
    participants: [],
    _count: { participants: 0 },
    createdAt: item.publishedAt || new Date().toISOString(),
    liveUrl: item.url,
    source: item.source,
    location: item.location,
    goal: item.goal,
    raised: item.raised,
  }
}

/**
 * Re-export for convenience
 */
export { getLiveCampaigns }
export type { CampaignItem }