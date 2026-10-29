/** What an action just paid out, and where it left the hero. Sent only when something was paid. */
export interface ProgressReward {
  xp: number;
  coins: number;
  gems: number;
  /** Level and rank after the payout. */
  level: number;
  rank: string;
  /** Consecutive days with something finished, counting today. */
  streak: number;
  /** True when the daily xp cap held back some or all of this payout. */
  capped?: boolean;
  leveledUp: boolean;
  /** Set when this payout moved the hero up a rank. */
  promotedRank?: string;
}
