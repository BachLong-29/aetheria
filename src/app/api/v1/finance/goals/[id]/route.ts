import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { FinanceGoalModel } from '@/server/models/finance-goal.model';
import { GoalContributionModel } from '@/server/models/goal-contribution.model';
import { listGoalsWithProgress, syncGoalStatus } from '@/server/services/finance-goals';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().min(1).max(8).optional(),
  color: z.enum(['gold', 'mint', 'violet', 'cyan', 'rose', 'amber', 'blue']).optional(),
  targetAmount: z.number().min(1).optional(),
  targetDate: z.string().regex(DAY_RE).nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

// PATCH /api/v1/finance/goals/:id
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  const goal = await FinanceGoalModel.findOne({ _id: id, userId: user.sub });
  if (!goal) return notFoundResponse('Goal not found');

  if (data.name !== undefined) goal.name = data.name;
  if (data.icon !== undefined) goal.icon = data.icon;
  if (data.color !== undefined) goal.color = data.color;
  if (data.targetAmount !== undefined) goal.targetAmount = data.targetAmount;
  if (data.targetDate !== undefined) {
    goal.targetDate = data.targetDate ? new Date(`${data.targetDate}T00:00:00.000Z`) : undefined;
  }
  if (data.status !== undefined) goal.status = data.status;
  await goal.save();

  // A changed target can flip the goal in or out of "completed".
  await syncGoalStatus(user.sub, goal._id.toString());

  const today = new Date().toISOString().substring(0, 10);
  const goals = await listGoalsWithProgress(user.sub, today.substring(0, 7), today, true);
  return successResponse(goals.find((g) => g.id === goal._id.toString()) ?? null, 'Goal updated');
});

// DELETE /api/v1/finance/goals/:id — also drops its contributions; they mean nothing alone
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  const goal = await FinanceGoalModel.findOneAndDelete({ _id: id, userId: user.sub });
  if (!goal) return notFoundResponse('Goal not found');

  await GoalContributionModel.deleteMany({ userId: user.sub, goalId: id });

  return successResponse(null, 'Goal deleted');
});
