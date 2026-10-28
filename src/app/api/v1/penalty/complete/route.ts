import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { PenaltyLogModel } from '@/server/models/penalty-log.model';
import { awardProgress } from '@/server/services/progress';
import { PENALTY_COMPLETE_COINS, PENALTY_COMPLETE_XP } from '@/constants/progress';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';

// POST /api/v1/penalty/complete — mark the active penalty as completed
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();

  const penalty = await PenaltyLogModel.findOneAndUpdate(
    { userId: user.sub, status: 'pending' },
    { $set: { status: 'completed' } },
    { new: true },
  );

  if (!penalty) return notFoundResponse('No active penalty found');

  const reward = await awardProgress(user.sub, {
    kind: 'penalty',
    refId: penalty._id.toString(),
    date: 'once',
    xp: PENALTY_COMPLETE_XP,
    coins: PENALTY_COMPLETE_COINS,
  });

  return successResponse(reward ? { ...penalty.toObject(), reward } : penalty, 'Penalty completed');
});
