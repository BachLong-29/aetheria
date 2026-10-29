import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { GoalModel } from '@/server/models/goal.model';
import { awardProgress } from '@/server/services/progress';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';
import { serialize } from '../../route';

const toggleSchema = z.object({
  milestoneId: z.string().min(1),
});

// PATCH /api/v1/goals/:id/milestone — toggle a single milestone's done state
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const { data, error } = await validateBody(req, toggleSchema);
  if (error) return error;

  await connectDB();

  const goal = await GoalModel.findOne({ _id: id, userId: user.sub, active: true });
  if (!goal) return notFoundResponse('Goal not found');

  const milestone = goal.milestones.find(
    (m) => (m as unknown as { _id: { toString(): string } })._id.toString() === data.milestoneId,
  );
  if (!milestone) return notFoundResponse('Milestone not found');

  milestone.done = !milestone.done;

  const total = goal.milestones.length;
  const done = goal.milestones.filter((m) => m.done).length;
  goal.progress = total ? done / total : 0;

  if (goal.progress >= 1) {
    if (goal.status !== 'completed') {
      goal.status = 'completed';
      goal.completedDate = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  } else if (goal.status === 'completed') {
    goal.status = 'in-progress';
    goal.completedDate = undefined;
  } else if (goal.status === 'not-started' && done > 0) {
    goal.status = 'in-progress';
  }

  await goal.save();

  // The last milestone completes the goal, which pays like marking it completed does.
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

  return successResponse(
    reward ? { ...serialize(goal), reward } : serialize(goal),
    'Milestone toggled',
  );
});
