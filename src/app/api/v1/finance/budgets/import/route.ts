import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { isPastBudgetMonth, PAST_MONTH_MESSAGE } from '@/server/helpers/budget-month';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { BudgetModel } from '@/server/models/budget.model';
import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { asyncHandler, errorResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';
import { listBudgetsWithSpent } from '@/server/services/finance-budget';
import type { TaskColor } from '@/types/task';

const MONTH_RE = /^\d{4}-\d{2}$/;

/** The palette a FinanceCategory is allowed to use. */
const COLORS: TaskColor[] = ['gold', 'mint', 'violet', 'cyan', 'rose', 'amber', 'blue'];

/** Categories created by an import get a colour at random — the sheet has none. */
function randomColor(): TaskColor {
  return COLORS[Math.floor(Math.random() * COLORS.length)] ?? 'gold';
}

const rowSchema = z.object({
  /** Present when the client already matched the line to a category. */
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).max(50).trim(),
  icon: z.string().min(1).max(8).optional(),
  limit: z.number().min(1),
  recurring: z.boolean(),
});

const importSchema = z.object({
  month: z.string().regex(MONTH_RE, 'Month must be "YYYY-MM"'),
  rows: z.array(rowSchema).max(200),
  /** The sheet's total line, stored as the month's overall budget. */
  overall: z.object({ limit: z.number().min(1), recurring: z.boolean() }).optional(),
});

/**
 * POST /api/v1/finance/budgets/import
 *
 * Writes a whole sheet at once. Every row here is one the reader saw in the
 * preview and chose to keep, so an existing budget for the same category and
 * month is overwritten rather than rejected — unlike the single-budget POST,
 * which answers 409 because nobody has looked at the collision yet.
 */
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, importSchema);
  if (error) return error;

  await connectDB();

  if (await isPastBudgetMonth(user.sub, data.month)) {
    return errorResponse(PAST_MONTH_MESSAGE, 400);
  }

  // One read instead of one lookup per row, matched on a normalised name so
  // "  ăn trưa" and "Ăn Trưa" are the same category rather than two.
  const existing = await FinanceCategoryModel.find({ userId: user.sub, type: 'expense' });
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));

  let createdCategories = 0;

  const resolved = await Promise.all(
    data.rows.map(async (row) => {
      if (row.categoryId) {
        const owned = existing.find((c) => c._id.toString() === row.categoryId);
        if (owned) return { id: owned._id, row };
      }

      const match = byName.get(row.name.trim().toLowerCase());
      if (match) return { id: match._id, row };

      const created = await FinanceCategoryModel.create({
        userId: user.sub,
        name: row.name,
        type: 'expense',
        icon: row.icon ?? '📦',
        color: randomColor(),
      });
      byName.set(row.name.trim().toLowerCase(), created);
      createdCategories += 1;

      return { id: created._id, row };
    }),
  );

  const writes = resolved.map(({ id, row }) =>
    BudgetModel.updateOne(
      { userId: user.sub, categoryId: id, month: data.month },
      { $set: { limit: row.limit, recurring: row.recurring } },
      { upsert: true },
    ),
  );

  if (data.overall) {
    writes.push(
      BudgetModel.updateOne(
        // `categoryId: null` is the overall budget — see the Budget model.
        { userId: user.sub, categoryId: null, month: data.month },
        { $set: { limit: data.overall.limit, recurring: data.overall.recurring } },
        { upsert: true },
      ),
    );
  }

  await Promise.all(writes);

  const budgets = await listBudgetsWithSpent(user.sub, data.month);

  return successResponse(
    { budgets, importedCount: writes.length, createdCategories },
    'Budgets imported',
  );
});
