import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { WalletModel } from '@/server/models/wallet.model';
import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { TransactionModel } from '@/server/models/transaction.model';
import {
  asyncHandler,
  errorResponse,
  notFoundResponse,
  successResponse,
  unauthorizedResponse,
} from '@/server';
import { validateBody } from '@/server/validate';
import { crossesBelowZero, OVERDRAFT_MESSAGE, serialize } from '../route';

const TRANSACTION_TYPES = ['income', 'expense'] as const;

const dateField = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const updateSchema = z.object({
  walletId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  amount: z.number().positive().optional(),
  note: z.string().max(200).trim().optional().nullable(),
  date: dateField.optional(),
  /** Clearing it accepts an auto transaction that had overdrawn the wallet. */
  overdraft: z.boolean().optional(),
});

function balanceDelta(type: 'income' | 'expense', amount: number): number {
  return type === 'income' ? amount : -amount;
}

// PATCH /api/v1/finance/transactions/:id
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  const existing = await TransactionModel.findOne({ _id: id, userId: user.sub });
  if (!existing) return notFoundResponse('Transaction not found');

  const nextWalletId = data.walletId ?? existing.walletId.toString();
  const nextCategoryId = data.categoryId ?? existing.categoryId.toString();
  const nextType = data.type ?? existing.type;
  const nextAmount = data.amount ?? existing.amount;

  if (data.walletId) {
    const wallet = await WalletModel.findOne({
      _id: data.walletId,
      userId: user.sub,
      active: true,
    });
    if (!wallet) return notFoundResponse('Wallet not found');
  }

  if (data.categoryId || data.type) {
    const category = await FinanceCategoryModel.findOne({
      _id: nextCategoryId,
      userId: user.sub,
      type: nextType,
    });
    if (!category) return errorResponse('Category not found or type mismatch', 400);
  }

  // An edit can overdraw just as easily as a new row — raising an expense, or
  // moving it to a thinner wallet. Checked against the balance the edit would
  // leave behind, which on the same wallet means undoing the old effect first.
  const target = await WalletModel.findOne({ _id: nextWalletId, userId: user.sub });
  if (!target) return notFoundResponse('Wallet not found');

  const sameWallet = existing.walletId.toString() === nextWalletId;
  const after =
    target.balance -
    (sameWallet ? balanceDelta(existing.type, existing.amount) : 0) +
    balanceDelta(nextType, nextAmount);
  if (crossesBelowZero(target.balance, after)) return errorResponse(OVERDRAFT_MESSAGE, 400);

  // Reverse the old effect on the old wallet, apply the new effect on the (possibly new) wallet
  await WalletModel.findByIdAndUpdate(existing.walletId, {
    $inc: { balance: -balanceDelta(existing.type, existing.amount) },
  });
  await WalletModel.findByIdAndUpdate(nextWalletId, {
    $inc: { balance: balanceDelta(nextType, nextAmount) },
  });

  const setData: Record<string, unknown> = {
    walletId: nextWalletId,
    categoryId: nextCategoryId,
    type: nextType,
    amount: nextAmount,
  };
  const unsetData: Record<string, 1> = {};

  if (data.note === null) unsetData.note = 1;
  else if (data.note !== undefined) setData.note = data.note;

  if (data.date) setData.date = new Date(data.date);
  if (data.overdraft !== undefined) setData.overdraft = data.overdraft;

  const updateOp: Record<string, unknown> = { $set: setData };
  if (Object.keys(unsetData).length > 0) updateOp.$unset = unsetData;

  const transaction = await TransactionModel.findByIdAndUpdate(id, updateOp, { new: true });
  if (!transaction) return notFoundResponse('Transaction not found');

  return successResponse(serialize(transaction), 'Transaction updated');
});

// DELETE /api/v1/finance/transactions/:id — hard delete, reverse wallet balance
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  const transaction = await TransactionModel.findOne({ _id: id, userId: user.sub });
  if (!transaction) return notFoundResponse('Transaction not found');

  // Removing income takes money back out, which can overdraw just as spending
  // does. Checked before the row is gone, so nothing is lost on a refusal.
  const wallet = await WalletModel.findById(transaction.walletId);
  if (
    wallet &&
    crossesBelowZero(
      wallet.balance,
      wallet.balance - balanceDelta(transaction.type, transaction.amount),
    )
  ) {
    return errorResponse(OVERDRAFT_MESSAGE, 400);
  }

  await TransactionModel.deleteOne({ _id: transaction._id });
  await WalletModel.findByIdAndUpdate(transaction.walletId, {
    $inc: { balance: -balanceDelta(transaction.type, transaction.amount) },
  });

  return successResponse(null, 'Transaction deleted');
});
