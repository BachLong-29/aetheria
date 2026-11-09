import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { NotificationModel } from '@/server/models/notification.model';
import { asyncHandler, successResponse, unauthorizedResponse } from '@/server';
import mongoose from 'mongoose';

// PUT /api/v1/notifications/read-all
export const PUT = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();

  await NotificationModel.updateMany(
    {
      userId: new mongoose.Types.ObjectId(user.sub),
      isRead: false,
      // A reminder not yet due is not on screen, so "read all" must not swallow it.
      $or: [{ notifyAt: { $exists: false } }, { notifyAt: { $lte: new Date() } }],
    },
    { $set: { isRead: true } },
  );

  return successResponse({ ok: true });
});
