import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { WalletModel } from '@/server/models/wallet.model';
import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { TransactionModel } from '@/server/models/transaction.model';
import {
  asyncHandler,
  createdResponse,
  errorResponse,
  notFoundResponse,
  successResponse,
  unauthorizedResponse,
} from '@/server';
import { validateBody } from '@/server/validate';
import type { ITransaction } from '@/server/models/transaction.model';
import type { Transaction } from '@/types/finance';
import { diacriticRegex } from '@/libs/utils';

const TRANSACTION_TYPES = ['income', 'expense'] as const;

const dateField = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const createSchema = z.object({
  walletId: z.string().min(1),
  categoryId: z.string().min(1),
  type: z.enum(TRANSACTION_TYPES),
  amount: z.number().positive(),
  note: z.string().max(200).trim().optional(),
  date: dateField,
});

export function serialize(t: ITransaction): Transaction {
  return {
    id: t._id.toString(),
    userId: t.userId.toString(),
    walletId: t.walletId.toString(),
    categoryId: t.categoryId.toString(),
    type: t.type,
    amount: t.amount,
    note: t.note,
    date: t.date.toISOString().substring(0, 10),
    source: t.source,
    overdraft: t.overdraft === true,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** +amount for income, -amount for expense. */
function balanceDelta(type: 'income' | 'expense', amount: number): number {
  return type === 'income' ? amount : -amount;
}

/**
 * A wallet is never allowed to go below zero by hand. Typed in, the overdraft
 * is a mistake worth catching at the keyboard; arriving from the bank it is a
 * fact, and the webhook records it with a flag instead — see the SePay route.
 */
export const OVERDRAFT_MESSAGE = 'This would put the wallet below zero';

// GET /api/v1/finance/transactions?walletId=&categoryId=&type=&from=&to=&search=
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(req.url);
  const walletId = searchParams.get('walletId');
  const categoryId = searchParams.get('categoryId');
  const type = searchParams.get('type');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const search = searchParams.get('search');

  await connectDB();

  const filter: Record<string, unknown> = { userId: user.sub };
  if (walletId) filter.walletId = walletId;
  if (categoryId) filter.categoryId = categoryId;
  if (type) filter.type = type;
  if (search) filter.note = { $regex: diacriticRegex(search), $options: 'i' };

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    filter.date = dateFilter;
  }

  const transactions = await TransactionModel.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .limit(500);

  return successResponse(transactions.map(serialize));
});

// POST /api/v1/finance/transactions — always source: 'manual'
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, createSchema);
  if (error) return error;

  await connectDB();

  const wallet = await WalletModel.findOne({ _id: data.walletId, userId: user.sub, active: true });
  if (!wallet) return notFoundResponse('Wallet not found');

  const category = await FinanceCategoryModel.findOne({
    _id: data.categoryId,
    userId: user.sub,
    type: data.type,
  });
  if (!category) return errorResponse('Category not found or type mismatch', 400);

  if (wallet.balance + balanceDelta(data.type, data.amount) < 0) {
    return errorResponse(OVERDRAFT_MESSAGE, 400);
  }

  const transaction = await TransactionModel.create({
    userId: user.sub,
    walletId: data.walletId,
    categoryId: data.categoryId,
    type: data.type,
    amount: data.amount,
    note: data.note,
    date: new Date(data.date),
    source: 'manual',
  });

  await WalletModel.findByIdAndUpdate(data.walletId, {
    $inc: { balance: balanceDelta(data.type, data.amount) },
  });

  return createdResponse(serialize(transaction), 'Transaction created');
});
