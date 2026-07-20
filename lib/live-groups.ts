import { getLiveGroups, type GroupItem } from './environment-feeds'

/**
 * Convert external group item to local group format
 */
export function toLocalGroup(item: GroupItem) {
  return {
    id: `live-${item.id}`,
    name: item.name,
    issue: item.issue,
    creatorId: 0,
    creator: { id: 0, name: item.source },
    members: [],
    _count: { messages: 0, members: item.members || 0 },
    createdAt: item.createdAt || new Date().toISOString(),
    liveUrl: item.url,
    source: item.source,
    location: item.location,
  }
}

/**
 * Re-export for convenience
 */
export { getLiveGroups }
export type { GroupItem }