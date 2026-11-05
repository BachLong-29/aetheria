/** What a failed penalty costs at one tier. */
export interface PenaltyEscalation {
  xpLoss: number;
  coinLoss: number;
  streakBreak: boolean;
  rankDemote: boolean;
  /** Taken off the stats on the client only; the server does not store it. */
  statLoss: number;
}

/**
 * The cost of failing a penalty, by tier (index 0 = tier 1). The server applies it, the
 * dashboard mirrors it on its own state and the penalty modal shows it — read it from here
 * so the modal can never promise a different loss than the one taken.
 */
export const PENALTY_ESCALATIONS: readonly PenaltyEscalation[] = [
  { xpLoss: 100, coinLoss: 20, streakBreak: false, rankDemote: false, statLoss: 2 },
  { xpLoss: 200, coinLoss: 40, streakBreak: true, rankDemote: false, statLoss: 5 },
  { xpLoss: 350, coinLoss: 80, streakBreak: true, rankDemote: true, statLoss: 8 },
  { xpLoss: 500, coinLoss: 120, streakBreak: true, rankDemote: true, statLoss: 12 },
];

/** The escalation for a tier; tiers past the last keep the last one. */
export function penaltyEscalationFor(tier: number): PenaltyEscalation {
  const last = PENALTY_ESCALATIONS.length - 1;
  return PENALTY_ESCALATIONS[Math.min(Math.max(tier, 1) - 1, last)] as PenaltyEscalation;
}
