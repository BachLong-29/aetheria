/**
 * What finishing things pays out, and how the hero levels up. Server-owned: the client shows
 * these numbers but never writes them to the profile (see `src/server/services/progress.ts`).
 */
export const TASK_XP = 60;
export const TASK_COINS = 15;

export const HABIT_XP = 30;
export const HABIT_COINS = 10;

/** Gems a hero-rank-S quest pays on top of its own xp and coins. */
export const S_QUEST_GEMS = 5;

export const PENALTY_COMPLETE_XP = 50;
export const PENALTY_COMPLETE_COINS = 10;

/**
 * The most xp a day's ordinary work (tasks, habits, quests) can pay. Past it the work still
 * counts for the streak but pays nothing, so items made just to be ticked can't be farmed.
 * Goals and penalties are one-off payouts and sit outside it.
 */
export const DAILY_XP_CAP = 1000;

/** Each level needs this much more xp than the last. */
export const LEVEL_XP_GROWTH = 1.3;

export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;

/** Minimum level required to auto-promote to each rank */
export const RANK_LEVEL_THRESHOLDS: Partial<Record<(typeof RANKS)[number], number>> = {
  E: 5,
  D: 10,
  C: 20,
  B: 35,
  A: 55,
  S: 80,
};
