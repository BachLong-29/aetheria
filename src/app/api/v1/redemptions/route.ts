import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { serializeRedemption } from '@/server/helpers/serialize-redemption';
import { RedemptionModel } from '@/server/models/redemption.model';
import { asyncHandler, successResponse, unauthorizedResponse } from '@/server';

// GET /api/v1/redemptions — what the user has redeemed, newest first.
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();
  const items = await RedemptionModel.find({ userId: user.sub }).sort({ createdAt: -1 }).limit(200);
  return successResponse(items.map(serializeRedemption));
});
