import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { NotificationModel, type NotificationType } from '@/server/models/notification.model';
import { TaskModel } from '@/server/models/task.model';
import { visibleNow } from '@/server/helpers/notification-visibility';
import { enforceNotificationCap } from '@/server/services/notification-cleanup';
import { generateCashLogNotifications } from '@/server/services/cash-log-notifications';
import { generateScheduleNotifications } from '@/server/services/schedule-notifications';
import { asyncHandler, createdResponse, successResponse, unauthorizedResponse } from '@/server';
import mongoose from 'mongoose';

// GET /api/v1/notifications
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();

  // Lazily materialise schedule-derived notifications (best-effort)
  try {
    await generateScheduleNotifications(user.sub);
  } catch (err) {
    console.error('[notifications] schedule generation failed', err);
  }

  // Same deal for the end-of-day cash reminder. Separate try/catch so one
  // generator failing never costs the reader the other's notifications.
  try {
    await generateCashLogNotifications(user.sub);
  } catch (err) {
    console.error('[notifications] cash-log generation failed', err);
  }

  const now = new Date();
  const notifications = await NotificationModel.find({
    userId: new mongoose.Types.ObjectId(user.sub),
    ...visibleNow(now),
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  // Backfill entityId for legacy "Quest Failed" notifications that were created
  // before entityId support was added. Parse task name from message, look up the
  // archived task, and persist the entityId so future clicks work correctly.
  // Batched into one find + N updates instead of one findOne per notification.
  const legacyFailed = notifications
    .map((n) => ({
      n,
      taskName:
        n.type === 'system' && !n.entityId && n.title === '☠ Quest Failed'
          ? n.message?.match(/^"(.+)" was abandoned/)?.[1]
          : undefined,
    }))
    .filter((x): x is { n: (typeof notifications)[number]; taskName: string } => !!x.taskName);

  if (legacyFailed.length > 0) {
    const names = [...new Set(legacyFailed.map((x) => x.taskName))];
    const tasks = await TaskModel.find({
      name: { $in: names },
      userId: new mongoose.Types.ObjectId(user.sub),
      active: false,
    }).lean();
    const taskByName = new Map(tasks.map((t) => [t.name, t._id.toString()]));

    await Promise.all(
      legacyFailed.map(({ n, taskName }) => {
        const entityId = taskByName.get(taskName);
        if (!entityId) return null;
        n.entityId = entityId;
        return NotificationModel.updateOne({ _id: n._id }, { $set: { entityId } });
      }),
    );
  }

  return successResponse(notifications);
});

// POST /api/v1/notifications
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();

  const body = (await req.json()) as {
    type: NotificationType;
    title: string;
    message: string;
    expiresAt?: string;
    entityId?: string;
    /** Exact-match idempotency key — preferred over the day+type+title fallback below. */
    dedupeKey?: string;
  };

  const uid = new mongoose.Types.ObjectId(user.sub);

  // Server-side dedupe. Prefer an explicit dedupeKey (exact match, caller
  // controls the semantics); otherwise fall back to a same-day heuristic
  // scoped by type AND title so unrelated same-type notifications on the
  // same day don't get mistaken for each other.
  if (body.dedupeKey) {
    const existing = await NotificationModel.findOne({ userId: uid, dedupeKey: body.dedupeKey });
    if (existing) return successResponse(existing);
  } else if (body.expiresAt) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const existing = await NotificationModel.findOne({
      userId: uid,
      type: body.type,
      title: body.title,
      createdAt: { $gte: dayStart },
    });
    if (existing) return successResponse(existing);
  }

  const notification = await NotificationModel.create({
    userId: uid,
    type: body.type,
    title: body.title,
    message: body.message,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    entityId: body.entityId,
    dedupeKey: body.dedupeKey,
  });

  // Keep the table bounded — prefers evicting already-read notifications so
  // an unread one is never silently lost (see enforceNotificationCap).
  await enforceNotificationCap(uid);

  return createdResponse(notification);
});
