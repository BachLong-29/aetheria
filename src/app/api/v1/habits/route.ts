import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { REPEATED_DAY_MESSAGE, slotsHaveUniqueDays } from '@/server/helpers/habit-schedule';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { HabitModel } from '@/server/models/habit.model';
import { asyncHandler, createdResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';
import type { Habit } from '@/types/habit';
import type { IHabit } from '@/server/models/habit.model';

const HABIT_COLORS = ['gold', 'mint', 'violet', 'cyan', 'rose', 'amber', 'blue'] as const;
const HABIT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const scheduleEntrySchema = z.object({
  days: z.array(z.enum(HABIT_DAYS)).min(1, 'Each time slot needs at least one day'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM (24-hour)'),
});

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  schedule: z
    .array(scheduleEntrySchema)
    .min(1, 'At least one schedule entry is required')
    .refine(slotsHaveUniqueDays, REPEATED_DAY_MESSAGE),
  duration: z.number().int().min(1).max(1440).optional(),
  note: z.string().max(500).optional(),
  tagId: z.string().min(1, 'Tag is required'),
  color: z.enum(HABIT_COLORS),
  icon: z.string().min(1, 'Icon is required'),
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

// GET /api/v1/habits
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();

  // Return all habits (active + inactive); the panel dims inactive ones.
  // Paused habits stay excluded from quests/stats/search via their own active:true filters.
  const habits = await HabitModel.find({ userId: user.sub }).sort({ createdAt: 1 });

  return successResponse(habits.map(serialize));
});

// POST /api/v1/habits
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, createSchema);
  if (error) return error;

  await connectDB();

  const habit = await HabitModel.create({
    userId: user.sub,
    name: data.name,
    schedule: data.schedule,
    duration: data.duration,
    note: data.note,
    tagId: data.tagId,
    color: data.color,
    icon: data.icon,
  });

  return createdResponse(serialize(habit), 'Habit created successfully');
});
