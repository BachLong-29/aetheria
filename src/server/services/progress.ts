import { LEVEL_XP_GROWTH, RANKS, RANK_LEVEL_THRESHOLDS } from '@/constants/progress';
import { ProgressAwardModel } from '@/server/models/progress-award.model';
import type { ProgressAwardKind } from '@/server/models/progress-award.model';
import { UserProfileModel } from '@/server/models/user-profile.model';
import type { IUserProfile } from '@/server/models/user-profile.model';
import type { ProgressReward } from '@/types/progress';

type Rank = (typeof RANKS)[number];

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
  try {
    await ProgressAwardModel.create({ userId, kind, refId, date, xp, coins, gems });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null;
    throw err;
  }

  let profile: IUserProfile | null;
  try {
    profile = await UserProfileModel.findOneAndUpdate(
      { userId },
      { $inc: { xp, coins, gems } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    // Nothing was paid, so don't leave a ledger row that would block the next try.
    await ProgressAwardModel.deleteOne({ userId, kind, refId, date });
    throw err;
  }

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
    xp,
    coins,
    gems,
    level: profile?.level ?? 1,
    rank: profile?.rank ?? 'E',
    leveledUp: levelsGained > 0,
    promotedRank,
  };
}
