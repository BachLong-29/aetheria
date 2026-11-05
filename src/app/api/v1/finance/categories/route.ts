import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { asyncHandler, createdResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';
import type { IFinanceCategory } from '@/server/models/finance-category.model';
import type { FinanceCategory } from '@/types/finance';

const FINANCE_CATEGORY_TYPES = ['income', 'expense'] as const;
const FINANCE_CATEGORY_COLORS = [
  'gold',
  'mint',
  'violet',
  'cyan',
  'rose',
  'amber',
  'blue',
] as const;

const DEFAULT_CATEGORIES: {
  name: string;
  type: 'income' | 'expense';
  icon: string;
  color: (typeof FINANCE_CATEGORY_COLORS)[number];
}[] = [
  { name: 'Ăn uống', type: 'expense', icon: '🍜', color: 'amber' },
  { name: 'Di chuyển', type: 'expense', icon: '🚗', color: 'cyan' },
  { name: 'Mua sắm', type: 'expense', icon: '🛍', color: 'violet' },
  { name: 'Hoá đơn', type: 'expense', icon: '🧾', color: 'rose' },
  { name: 'Giải trí', type: 'expense', icon: '🎮', color: 'blue' },
  { name: 'Sức khoẻ', type: 'expense', icon: '💊', color: 'mint' },
  { name: 'Khác', type: 'expense', icon: '📦', color: 'gold' },
  { name: 'Chưa phân loại', type: 'expense', icon: '❔', color: 'violet' },
  { name: 'Lương', type: 'income', icon: '💼', color: 'mint' },
  { name: 'Thưởng', type: 'income', icon: '🎁', color: 'gold' },
  { name: 'Khác', type: 'income', icon: '📥', color: 'cyan' },
  { name: 'Chưa phân loại', type: 'income', icon: '❔', color: 'violet' },
];

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50).trim(),
  type: z.enum(FINANCE_CATEGORY_TYPES),
  icon: z.string().min(1),
  color: z.enum(FINANCE_CATEGORY_COLORS),
  keywords: z.array(z.string().trim().min(1)).optional(),
  excludeFromTotals: z.boolean().optional(),
});

export function serialize(c: IFinanceCategory): FinanceCategory {
  return {
    id: c._id.toString(),
    userId: c.userId.toString(),
    name: c.name,
    type: c.type,
    icon: c.icon,
    color: c.color,
    keywords: c.keywords ?? [],
    excludeFromTotals: c.excludeFromTotals === true,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// GET /api/v1/finance/categories?type=expense — seed defaults on first call
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  await connectDB();

  const count = await FinanceCategoryModel.countDocuments({ userId: user.sub });
  if (count === 0) {
    await FinanceCategoryModel.insertMany(
      DEFAULT_CATEGORIES.map((c) => ({ userId: user.sub, ...c })),
    );
  }

  const filter: Record<string, unknown> = { userId: user.sub };
  if (type) filter.type = type;

  const categories = await FinanceCategoryModel.find(filter).sort({ createdAt: 1 });

  return successResponse(categories.map(serialize));
});

// POST /api/v1/finance/categories
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, createSchema);
  if (error) return error;

  await connectDB();

  const category = await FinanceCategoryModel.create({
    userId: user.sub,
    name: data.name,
    type: data.type,
    icon: data.icon,
    color: data.color,
    keywords: data.keywords ?? [],
    excludeFromTotals: data.excludeFromTotals ?? false,
  });

  return createdResponse(serialize(category), 'Category created');
});
