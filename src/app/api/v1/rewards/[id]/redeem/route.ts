import type { NextRequest } from 'next/server';

import { REWARD_RANK_ORDER, rankMeets } from '@/constants/reward-rank';
import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { serializeRedemption } from '@/server/helpers/serialize-redemption';
import { RedemptionModel } from '@/server/models/redemption.model';
import { RewardModel } from '@/server/models/reward.model';
import { UserProfileModel } from '@/server/models/user-profile.model';
import {
  asyncHandler,
  createdResponse,
  errorResponse,
  notFoundResponse,
  unauthorizedResponse,
} from '@/server';

// POST /api/v1/rewards/:id/redeem — spend coins/gems on one of the user's own rewards.
//
// Mongo here has no transaction, so each step is a conditional update that can only succeed
// while its precondition still holds (`stock > 0`, `coins >= cost`), and a later failure puts
// back what an earlier step took.
export const POST = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  await connectDB();

  const reward = await RewardModel.findOne({ _id: id, userId: user.sub, active: true });
  if (!reward) return notFoundResponse('Reward not found');

  const coinCost = reward.coinCost ?? 0;
  const gemCost = reward.gemCost ?? 0;
  if (reward.status === 'inactive') return errorResponse('Reward is not available', 409);
  if (reward.status === 'sold_out' || reward.stock === 0) {
    return errorResponse('Reward is sold out', 409);
  }
  if (coinCost === 0 && gemCost === 0) return errorResponse('Reward has no price', 409);

  const profile = await UserProfileModel.findOne({ userId: user.sub });
  if (!profile) return notFoundResponse('Profile not found');

  const { minLevel, minRank } = reward.unlockCondition ?? {};
  if (minLevel && profile.level < minLevel) {
    return errorResponse(`Requires level ${minLevel}`, 403);
  }
  if (minRank && !rankMeets(profile.rank, minRank)) {
    return errorResponse(`Requires rank ${minRank} (${REWARD_RANK_ORDER.join(' < ')})`, 403);
  }

  // Take one from the stock first: the unlimited case has nothing to take.
  const limited = reward.stock !== undefined && reward.stock !== null;
  if (limited) {
    const taken = await RewardModel.findOneAndUpdate(
      { _id: reward._id, stock: { $gt: 0 } },
      { $inc: { stock: -1 } },
      { new: true },
    );
    if (!taken) return errorResponse('Reward is sold out', 409);
    if (taken.stock === 0) await RewardModel.updateOne({ _id: reward._id }, { status: 'sold_out' });
  }

  const restoreStock = async () => {
    if (limited) {
      await RewardModel.updateOne(
        { _id: reward._id },
        { $inc: { stock: 1 }, status: reward.status },
      );
    }
  };

  const paid = await UserProfileModel.findOneAndUpdate(
    { userId: user.sub, coins: { $gte: coinCost }, gems: { $gte: gemCost } },
    { $inc: { coins: -coinCost, gems: -gemCost } },
    { new: true },
  );
  if (!paid) {
    await restoreStock();
    return errorResponse('Not enough coins or gems', 402);
  }

  try {
    const redemption = await RedemptionModel.create({
      userId: user.sub,
      rewardId: reward._id,
      name: reward.name,
      icon: reward.icon,
      color: reward.color,
      rarity: reward.rarity,
      coinCost,
      gemCost,
    });
    return createdResponse(
      { redemption: serializeRedemption(redemption), coins: paid.coins, gems: paid.gems },
      'Reward redeemed',
    );
  } catch (err) {
    await UserProfileModel.updateOne(
      { userId: user.sub },
      { $inc: { coins: coinCost, gems: gemCost } },
    );
    await restoreStock();
    throw err;
  }
});
