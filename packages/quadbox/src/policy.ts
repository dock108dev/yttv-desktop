/** Current supported Chrome workspace. Account stream allowance is a separate runtime gate. */
export const CURRENT_MANAGED_FEED_LIMIT = 4;
export const MANAGED_FEED_COUNTS = Object.freeze(Array.from({ length: CURRENT_MANAGED_FEED_LIMIT }, (_, i) => i + 1));
export function isManagedFeedCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= CURRENT_MANAGED_FEED_LIMIT;
}
export function canAddManagedFeed(currentCount: number): boolean {
  return Number.isInteger(currentCount) && currentCount >= 0 && currentCount < CURRENT_MANAGED_FEED_LIMIT;
}
