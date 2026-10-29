import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { GoalModel } from '@/server/models/goal.model';
import { awardProgress } from '@/server/services/progress';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';
import { serialize } from '../route';

const GOAL_CATS = ['career', 'health', 'learning', 'finance', 'personal'] as const;
const GOAL_RANKS = ['S', 'A', 'B', 'C', 'D'] as const;
const GOAL_PRIORITIES = ['high', 'medium', 'low'] as const;
const GOAL_STATUSES = ['not-started', 'in-progress', 'completed', 'archived'] as const;

const DEFAULT_RANK_REWARD = { xp: 420, coins: 110 };
const RANK_REWARD: Record<string, { xp: number; coins: number }> = {
  S: { xp: 880, coins: 240 },
  A: { xp: 560, coins: 150 },
  B: DEFAULT_RANK_REWARD,
  C: { xp: 300, coins: 80 },
  D: { xp: 180, coins: 50 },
};

const milestoneSchema = z.object({
  label: z.string().min(1).max(200),
  done: z.boolean().default(false),
});

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  cat: z.enum(GOAL_CATS).optional(),
  rank: z.enum(GOAL_RANKS).optional(),
  priority: z.enum(GOAL_PRIORITIES).optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  targetDate: z.string().optional(),
  desc: z.string().max(500).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  linkedTrophy: z.string().optional().nullable(),
  milestones: z.array(milestoneSchema).optional(),
});

// PUT /api/v1/goals/:id
export const PUT = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  const patch: Record<string, unknown> = { ...data };

  // Recompute xp/coins if rank changed
  if (data.rank) {
    const reward = RANK_REWARD[data.rank] ?? DEFAULT_RANK_REWARD;
    patch.xp = reward.xp;
    patch.coins = reward.coins;
  }

  // If marking completed, set completedDate; if uncompleting, clear it
  if (data.status === 'completed') {
    patch.completedDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    patch.progress = 1;
  } else if (data.status) {
    patch.completedDate = undefined;
  }

  const goal = await GoalModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    { $set: patch },
    { new: true },
  );

  if (!goal) return notFoundResponse('Goal not found');

  // Pays once ever: reopening a goal and finishing it again is not a second reward.
  const reward =
    goal.status === 'completed'
      ? await awardProgress(user.sub, {
          kind: 'goal',
          refId: goal._id.toString(),
          date: 'once',
          xp: goal.xp,
          coins: goal.coins,
        })
      : null;

  return successResponse(reward ? { ...serialize(goal), reward } : serialize(goal), 'Goal updated');
});

// DELETE /api/v1/goals/:id  (soft delete — sets active: false)
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  const goal = await GoalModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    { active: false },
    { new: true },
  );

  if (!goal) return notFoundResponse('Goal not found');

  return successResponse(null, 'Goal deleted');
});
