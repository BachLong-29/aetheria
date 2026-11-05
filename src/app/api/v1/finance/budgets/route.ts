import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { isPastBudgetMonth, PAST_MONTH_MESSAGE } from '@/server/helpers/budget-month';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { BudgetModel } from '@/server/models/budget.model';
import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { listBudgetsWithSpent } from '@/server/services/finance-budget';
import { generateBudgetNotifications } from '@/server/services/budget-notifications';
import {
  asyncHandler,
  createdResponse,
  errorResponse,
  notFoundResponse,
  successResponse,
  unauthorizedResponse,
} from '@/server';
import { validateBody } from '@/server/validate';

const MONTH_RE = /^\d{4}-\d{2}$/;

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const createSchema = z.object({
  categoryId: z.string().min(1).optional(),
  month: z.string().regex(MONTH_RE, 'Month must be "YYYY-MM"'),
  limit: z.number().min(1),
  recurring: z.boolean().optional(),
});

// GET /api/v1/finance/budgets?month=YYYY-MM — default current month
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get('month');
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : currentMonthKey();

  await connectDB();

  // Lazily materialise "Budget Exceeded" notifications for the current month (best-effort)
  try {
    await generateBudgetNotifications(user.sub);
  } catch (err) {
    console.error('[budgets] notification generation failed', err);
  }

  const budgets = await listBudgetsWithSpent(user.sub, month);
  return successResponse(budgets);
});

// POST /api/v1/finance/budgets
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, createSchema);
  if (error) return error;

  await connectDB();

  if (await isPastBudgetMonth(user.sub, data.month)) {
    return errorResponse(PAST_MONTH_MESSAGE, 400);
  }

  if (data.categoryId) {
    const category = await FinanceCategoryModel.findOne({
      _id: data.categoryId,
      userId: user.sub,
      type: 'expense',
    });
    if (!category) return notFoundResponse('Expense category not found');
  }

  const existing = await BudgetModel.findOne({
    userId: user.sub,
    categoryId: data.categoryId ?? null,
    month: data.month,
  });
  if (existing) return errorResponse('A budget already exists for this category and month', 409);

  const budget = await BudgetModel.create({
    userId: user.sub,
    categoryId: data.categoryId,
    month: data.month,
    limit: data.limit,
    recurring: data.recurring ?? false,
  });

  const monthBudgets = await listBudgetsWithSpent(user.sub, data.month);
  const created = monthBudgets.find((b) => b.id === budget._id.toString());

  return createdResponse(created, 'Budget created');
});
