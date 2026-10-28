/** Hero ranks from lowest to highest — the order `Reward.unlockCondition.minRank` is compared in. */
export const REWARD_RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;

/**
 * Whether `current` reaches `required`. A `required` outside the ladder (rewards saved before
 * the F→S convention, e.g. "Silver") is not enforced: nobody could ever reach it.
 */
export function rankMeets(current: string, required: string): boolean {
  const need = REWARD_RANK_ORDER.indexOf(required as (typeof REWARD_RANK_ORDER)[number]);
  if (need === -1) return true;
  const have = REWARD_RANK_ORDER.indexOf(current as (typeof REWARD_RANK_ORDER)[number]);
  return have >= need;
}
