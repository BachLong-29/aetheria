import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { FinanceGoalModel } from '@/server/models/finance-goal.model';
import { listGoalsWithProgress } from '@/server/services/finance-goals';
import { asyncHandler, createdResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';

const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().min(1).max(8),
  color: z.enum(['gold', 'mint', 'violet', 'cyan', 'rose', 'amber', 'blue']).default('gold'),
  targetAmount: z.number().min(1),
  targetDate: z.string().regex(DAY_RE).optional(),
});

// GET /api/v1/finance/goals?month=YYYY-MM&today=YYYY-MM-DD[&includeArchived=true]
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(req.url);
  const serverToday = new Date().toISOString().substring(0, 10);
  const todayParam = searchParams.get('today');
  const today = todayParam && DAY_RE.test(todayParam) ? todayParam : serverToday;
  const monthParam = searchParams.get('month');
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : today.substring(0, 7);

  await connectDB();

  const includeArchived = searchParams.get('includeArchived') === 'true';
  const goals = await listGoalsWithProgress(user.sub, month, today, includeArchived);
  return successResponse(goals);
});

// POST /api/v1/finance/goals
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, createSchema);
  if (error) return error;

  await connectDB();

  const goal = await FinanceGoalModel.create({
    userId: user.sub,
    name: data.name,
    icon: data.icon,
    color: data.color,
    targetAmount: data.targetAmount,
    targetDate: data.targetDate ? new Date(`${data.targetDate}T00:00:00.000Z`) : undefined,
  });

  const today = new Date().toISOString().substring(0, 10);
  const goals = await listGoalsWithProgress(user.sub, today.substring(0, 7), today);
  const created = goals.find((g) => g.id === goal._id.toString());

  return createdResponse(created, 'Goal created');
});
