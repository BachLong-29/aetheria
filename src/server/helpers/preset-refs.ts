import mongoose from 'mongoose';

import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { WalletModel } from '@/server/models/wallet.model';
import type { TransactionType } from '@/types/finance';

type IdLike = mongoose.Types.ObjectId | string;

/**
 * A preset's wallet and category must be the caller's own, the wallet still live and the
 * category of the preset's type — the same test `POST /transactions` applies when it is used.
 * Returns the message for the first thing that fails, or null when both hold.
 */
export async function presetRefsError(
  userId: IdLike,
  type: TransactionType,
  walletId: IdLike,
  categoryId: IdLike,
): Promise<{ message: string; status: 400 | 404 } | null> {
  if (!mongoose.isValidObjectId(walletId)) return { message: 'Wallet not found', status: 404 };
  if (!mongoose.isValidObjectId(categoryId)) {
    return { message: 'Category not found or type mismatch', status: 400 };
  }

  const wallet = await WalletModel.exists({ _id: walletId, userId, active: true });
  if (!wallet) return { message: 'Wallet not found', status: 404 };

  const category = await FinanceCategoryModel.exists({ _id: categoryId, userId, type });
  if (!category) return { message: 'Category not found or type mismatch', status: 400 };

  return null;
}
