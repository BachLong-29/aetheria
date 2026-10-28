import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { QuestModel } from '@/server/models/quest.model';
import { ScheduleBlockModel } from '@/server/models/schedule-block.model';
import { awardProgress, todayKey } from '@/server/services/progress';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';
import { S_QUEST_GEMS } from '@/constants/progress';
import type { Quest } from '@/types/quest';
import type { IQuest } from '@/server/models/quest.model';

const updateSchema = z
  .object({
    done: z.boolean().optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((d) => d.done !== undefined || d.dueDate !== undefined, {
    message: 'Must provide done or dueDate',
  });

function serialize(q: IQuest): Quest {
  return {
    id: q._id.toString(),
    userId: q.userId.toString(),
    title: q.title,
    desc: q.desc,
    type: q.type,
    difficulty: q.difficulty,
    xp: q.xp,
    coins: q.coins,
    done: q.done,
    tags: q.tags,
    dueDate: q.dueDate.toISOString(),
    dueTime: q.dueTime,
    completedAt: q.completedAt?.toISOString(),
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

// PATCH /api/v1/quests/:id
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  const patch: Record<string, unknown> = {};
  if (data.done !== undefined) {
    patch.done = data.done;
    patch.completedAt = data.done ? new Date() : null;
  }
  if (data.dueDate) {
    patch.dueDate = new Date(data.dueDate);
  }

  const quest = await QuestModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    { $set: patch },
    { new: true },
  );

  if (!quest) return notFoundResponse('Quest not found');

  const reward = data.done
    ? await awardProgress(user.sub, {
        kind: 'quest',
        refId: quest._id.toString(),
        date: todayKey(),
        xp: quest.xp,
        coins: quest.coins,
        gems: quest.difficulty === 'S' ? S_QUEST_GEMS : 0,
      })
    : null;

  return successResponse(
    reward ? { ...serialize(quest), reward } : serialize(quest),
    'Quest updated',
  );
});

// DELETE /api/v1/quests/:id
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  // Quest carries no `active` flag the way Task and Event do, and four separate
  // queries read it — a soft delete would mean teaching every one of them to
  // filter. A quest is a day's challenge, not a record worth keeping.
  const quest = await QuestModel.findOneAndDelete({ _id: id, userId: user.sub });
  if (!quest) return notFoundResponse('Quest not found');

  // Blocks outliving their quest are invisible (buildCalendar skips them) but
  // still occupy the day's capacity, so they go too.
  await ScheduleBlockModel.deleteMany({
    userId: user.sub,
    sourceType: 'quest',
    sourceId: quest._id,
  });

  return successResponse(null, 'Quest deleted successfully');
});
