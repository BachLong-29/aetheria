import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { serializeRedemption } from '@/server/helpers/serialize-redemption';
import { RedemptionModel } from '@/server/models/redemption.model';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';

const updateSchema = z.object({ used: z.boolean() });

// PATCH /api/v1/redemptions/:id — mark a redeemed reward as used (or not yet).
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();
  const redemption = await RedemptionModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    data.used ? { usedAt: new Date() } : { $unset: { usedAt: 1 } },
    { new: true },
  );
  if (!redemption) return notFoundResponse('Redemption not found');

  return successResponse(serializeRedemption(redemption), 'Redemption updated');
});
