import { getLiveFundraisers, type FundraiserItem } from './environment-feeds'

/**
 * Convert external fundraiser item to local fundraiser format
 */
export function toLocalFundraiser(item: FundraiserItem) {
  return {
    id: `live-${item.id}`,
    cause: item.cause,
    description: item.description,
    goal: item.goal,
    raised: item.raised,
    creatorId: 0,
    creator: { id: 0, name: item.source },
    _count: { donations: 0 },
    createdAt: item.createdAt || new Date().toISOString(),
    liveUrl: item.url,
    source: item.source,
    location: item.location,
    category: item.category,
  }
}

/**
 * Re-export for convenience
 */
export { getLiveFundraisers }
export type { FundraiserItem }