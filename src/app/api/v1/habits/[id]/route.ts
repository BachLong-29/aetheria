import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { REPEATED_DAY_MESSAGE, slotsHaveUniqueDays } from '@/server/helpers/habit-schedule';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { releaseUploads } from '@/server/helpers/upload-cleanup';
import { HabitModel } from '@/server/models/habit.model';
import { HabitLogModel } from '@/server/models/habit-log.model';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';
import type { Habit } from '@/types/habit';
import type { IHabit } from '@/server/models/habit.model';

const HABIT_COLORS = ['gold', 'mint', 'violet', 'cyan', 'rose', 'amber', 'blue'] as const;
const HABIT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const scheduleEntrySchema = z.object({
  days: z.array(z.enum(HABIT_DAYS)).min(1),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24-hour)'),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  schedule: z
    .array(scheduleEntrySchema)
    .min(1)
    .refine(slotsHaveUniqueDays, REPEATED_DAY_MESSAGE)
    .optional(),
  duration: z.number().int().min(1).max(1440).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  tagId: z.string().min(1).optional(),
  color: z.enum(HABIT_COLORS).optional(),
  icon: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

function serialize(h: IHabit): Habit {
  return {
    id: h._id.toString(),
    userId: h.userId.toString(),
    name: h.name,
    schedule: h.schedule.map((e) => ({ days: e.days, time: e.time })),
    duration: h.duration,
    note: h.note,
    tagId: h.tagId,
    color: h.color,
    icon: h.icon,
    active: h.active,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

// PATCH /api/v1/habits/:id
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  const before =
    data.icon !== undefined
      ? await HabitModel.findOne({ _id: id, userId: user.sub }).select('icon').lean()
      : null;

  const habit = await HabitModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    { $set: data },
    { new: true },
  );

  if (!habit) return notFoundResponse('Habit not found');

  if (before) await releaseUploads(user.sub, [before.icon]);

  return successResponse(serialize(habit), 'Habit updated');
});

// DELETE /api/v1/habits/:id — hard delete (permanent), cascades to its logs
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  const habit = await HabitModel.findOneAndDelete({ _id: id, userId: user.sub });

  if (!habit) return notFoundResponse('Habit not found');

  await HabitLogModel.deleteMany({ userId: user.sub, habitId: id });
  await releaseUploads(user.sub, [habit.icon]);

  return successResponse(null, 'Habit deleted');
});
