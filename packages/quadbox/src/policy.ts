/** Current supported Chrome workspace. Account stream allowance is a separate runtime gate. */
export const CURRENT_MANAGED_FEED_LIMIT = 4;
export function canAddManagedFeed(currentCount: number): boolean {
  return Number.isInteger(currentCount) && currentCount >= 0 && currentCount < CURRENT_MANAGED_FEED_LIMIT;
}
