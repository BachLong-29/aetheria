import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { TaskLogModel, type ITaskLog } from '@/server/models/task-log.model';
import { awardProgress } from '@/server/services/progress';
import { asyncHandler, successResponse, unauthorizedResponse } from '@/server';
import { validateBody, validateSearchParams } from '@/server/validate';
import { TASK_COINS, TASK_XP } from '@/constants/progress';
import type { TaskLog } from '@/types/task-log';

// ─── Serializer ───────────────────────────────────────────────────────────────

function serialize(log: ITaskLog): TaskLog {
  return {
    id: log._id.toString(),
    taskId: log.taskId.toString(),
    userId: log.userId.toString(),
    date: log.date.toISOString().substring(0, 10),
    note: log.note,
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
  };
}

// ─── GET /api/v1/task-logs?date=YYYY-MM-DD ───────────────────────────────────
// Returns all task logs for the authenticated user on a given date.

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data: query, error } = await validateSearchParams(req.nextUrl.searchParams, querySchema);
  if (error) return error;

  await connectDB();

  const start = new Date(query.date);
  const end = new Date(query.date);
  end.setDate(end.getDate() + 1);

  const logs = await TaskLogModel.find({
    userId: user.sub,
    date: { $gte: start, $lt: end },
  });

  return successResponse(logs.map(serialize));
});

// ─── POST /api/v1/task-logs — toggle ─────────────────────────────────────────
// Creates a log if none exists for the day; deletes it if one already exists.

const toggleSchema = z.object({
  taskId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  note: z.string().max(200).optional(),
});

export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, toggleSchema);
  if (error) return error;

  await connectDB();

  const start = new Date(data.date);
  const end = new Date(data.date);
  end.setDate(end.getDate() + 1);

  const existing = await TaskLogModel.findOne({
    userId: user.sub,
    taskId: data.taskId,
    date: { $gte: start, $lt: end },
  });

  // Toggle: remove if exists, create if not
  if (existing) {
    await existing.deleteOne();
    return successResponse(null, 'Task log removed');
  }

  const log = await TaskLogModel.create({
    userId: user.sub,
    taskId: data.taskId,
    date: start,
    note: data.note,
  });

  // A day's log pays that day once; removing it and logging again does not pay twice.
  const reward = await awardProgress(user.sub, {
    kind: 'task-log',
    refId: data.taskId,
    date: data.date,
    xp: TASK_XP,
    coins: TASK_COINS,
  });

  return successResponse(
    reward ? { ...serialize(log), reward } : serialize(log),
    'Task log created',
  );
});
