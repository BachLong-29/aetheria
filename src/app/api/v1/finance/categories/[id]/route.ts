import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { BudgetModel } from '@/server/models/budget.model';
import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { TransactionModel } from '@/server/models/transaction.model';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';

import { serialize } from '../route';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// `type` is deliberately absent: flipping income↔expense would leave every existing
// transaction filed under a category that no longer matches its own type.
const updateSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  icon: z.string().min(1).optional(),
  color: z.enum(['gold', 'mint', 'violet', 'cyan', 'rose', 'amber', 'blue']).optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  excludeFromTotals: z.boolean().optional(),
});

// PATCH /api/v1/finance/categories/:id
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  const category = await FinanceCategoryModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    { $set: data },
    { new: true },
  );
  if (!category) return notFoundResponse('Category not found');

  return successResponse(serialize(category), 'Category updated');
});

// DELETE /api/v1/finance/categories/:id[?dryRun=true]
// `dryRun` answers "what would stop this delete?" without deleting anything, so the UI can warn
// before the user confirms. The real delete re-checks the same rules.
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';

  await connectDB();

  const [transactions, budgets] = await Promise.all([
    TransactionModel.countDocuments({ userId: user.sub, categoryId: id }),
    BudgetModel.countDocuments({
      userId: user.sub,
      categoryId: id,
      month: { $gte: currentMonthKey() },
    }),
  ]);

  if (dryRun) {
    const exists = await FinanceCategoryModel.exists({ _id: id, userId: user.sub });
    if (!exists) return notFoundResponse('Category not found');
    return successResponse({
      canDelete: transactions === 0 && budgets === 0,
      transactions,
      budgets,
    });
  }

  if (transactions > 0) {
    return NextResponse.json(
      {
        success: false,
        message: 'Cannot delete: this category is used by one or more transactions.',
      },
      { status: 409 },
    );
  }

  if (budgets > 0) {
    return NextResponse.json(
      {
        success: false,
        message: 'Cannot delete: this category has a budget set for the current or a future month.',
      },
      { status: 409 },
    );
  }

  const category = await FinanceCategoryModel.findOneAndDelete({ _id: id, userId: user.sub });
  if (!category) return notFoundResponse('Category not found');

  return successResponse(null, 'Category deleted');
});
