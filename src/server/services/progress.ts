import mongoose from 'mongoose';

import { DAILY_XP_CAP, LEVEL_XP_GROWTH, RANKS, RANK_LEVEL_THRESHOLDS } from '@/constants/progress';
import { ProgressAwardModel } from '@/server/models/progress-award.model';
import type { ProgressAwardKind } from '@/server/models/progress-award.model';
import { UserSettingModel } from '@/server/models/user-setting.model';
import { UserProfileModel } from '@/server/models/user-profile.model';
import { syncStreak } from '@/server/services/streak';
import type { IUserProfile } from '@/server/models/user-profile.model';
import type { ProgressReward } from '@/types/progress';

type Rank = (typeof RANKS)[number];

/** Kinds counted against the daily cap — ordinary work, not one-off payouts. */
const CAPPED_KINDS: ProgressAwardKind[] = ['task', 'task-log', 'habit', 'quest'];

/** Kinds that can finish a day's list; goals and penalties are one-off and do not count. */
const STREAK_KINDS: ProgressAwardKind[] = CAPPED_KINDS;

/** Safety stop: no real award crosses this many levels at once. */
const MAX_LEVELS_PER_AWARD = 50;

interface AwardInput {
  kind: ProgressAwardKind;
  refId: string;
  /** `YYYY-MM-DD` to pay once per day, or `once` to pay once ever. */
  date: string;
  xp: number;
  coins: number;
  gems?: number;
}

/** `YYYY-MM-DD` of now, for things that pay once per day on the day they are finished. */
export const todayKey = () => new Date().toISOString().slice(0, 10);

/** `YYYY-MM-DD` of now in `timeZone`; a stored zone can be anything, so a bad one reads as UTC. */
export function dayKeyIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function rankForLevel(level: number): Rank {
  const ladder = Object.entries(RANK_LEVEL_THRESHOLDS) as [Rank, number][];
  let best: Rank = 'F';
  for (const [rank, min] of ladder) {
    if (level >= min && RANKS.indexOf(rank) > RANKS.indexOf(best)) best = rank;
  }
  return best;
}

/**
 * Pays xp, coins and gems for something the user finished, once. A repeat call for the same
 * thing (tick, untick, tick) finds the ledger row and returns `null` without paying again.
 * Mongo here has no transaction, so the payout is `$inc` (atomic) and each level-up is a
 * conditional update that only applies while the profile still looks the way it was read.
 */
export async function awardProgress(
  userId: string,
  { kind, refId, date, xp, coins, gems = 0 }: AwardInput,
): Promise<ProgressReward | null> {
  const setting = await UserSettingModel.findOne({ userId }).select('timezone');
  const day = dayKeyIn(setting?.timezone || 'UTC');

  // The daily cap trims what is paid; the ledger row is still written (with what was paid), so
  // ticking the same item again never gets a second chance at it.
  let paid = { xp, coins, gems };
  let capped = false;
  if (CAPPED_KINDS.includes(kind)) {
    const [spent] = await ProgressAwardModel.aggregate<{ total: number }>([
      { $match: { userId: new mongoose.Types.ObjectId(userId), day, kind: { $in: CAPPED_KINDS } } },
      { $group: { _id: null, total: { $sum: '$xp' } } },
    ]);
    const room = Math.max(0, DAILY_XP_CAP - (spent?.total ?? 0));
    if (room < xp) {
      const ratio = xp > 0 ? room / xp : 0;
      paid = { xp: room, coins: Math.floor(coins * ratio), gems: Math.floor(gems * ratio) };
      capped = true;
    }
  }

  try {
    await ProgressAwardModel.create({ userId, kind, refId, date, day, ...paid });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      // Paid before, but this tick may be the one that finishes the day (tick, untick, tick).
      if (STREAK_KINDS.includes(kind)) await syncStreak(userId, day, true);
      return null;
    }
    throw err;
  }

  let profile: IUserProfile | null;
  try {
    profile = await UserProfileModel.findOneAndUpdate(
      { userId },
      { $inc: paid },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    // Nothing was paid, so don't leave a ledger row that would block the next try.
    await ProgressAwardModel.deleteOne({ userId, kind, refId, date });
    throw err;
  }

  // After the payout, so a first-ever award has a profile to count the day on.
  const streak = STREAK_KINDS.includes(kind)
    ? await syncStreak(userId, day, true)
    : (profile?.streak ?? 0);

  let levelsGained = 0;
  while (profile && profile.xp >= profile.xpNext && levelsGained < MAX_LEVELS_PER_AWARD) {
    const leveled: IUserProfile | null = await UserProfileModel.findOneAndUpdate(
      { userId, level: profile.level, xpNext: profile.xpNext, xp: { $gte: profile.xpNext } },
      {
        $inc: { xp: -profile.xpNext, level: 1 },
        $set: { xpNext: Math.round(profile.xpNext * LEVEL_XP_GROWTH) },
      },
      { new: true },
    );
    if (!leveled) {
      // Another award levelled first: take what it left and stop; it finishes the climb.
      profile = await UserProfileModel.findOne({ userId });
      break;
    }
    profile = leveled;
    levelsGained += 1;
  }

  let promotedRank: string | undefined;
  if (profile) {
    const qualified = rankForLevel(profile.level);
    if (RANKS.indexOf(qualified) > RANKS.indexOf(profile.rank as Rank)) {
      profile = await UserProfileModel.findOneAndUpdate(
        { userId },
        { $set: { rank: qualified } },
        { new: true },
      );
      promotedRank = qualified;
    }
  }

  return {
    ...paid,
    level: profile?.level ?? 1,
    rank: profile?.rank ?? 'E',
    streak,
    capped: capped || undefined,
    leveledUp: levelsGained > 0,
    promotedRank,
  };
}
