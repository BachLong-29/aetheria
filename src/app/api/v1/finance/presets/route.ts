import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { presetRefsError } from '@/server/helpers/preset-refs';
import {
  MAX_TRANSACTION_PRESETS,
  TransactionPresetModel,
} from '@/server/models/transaction-preset.model';
import {
  asyncHandler,
  createdResponse,
  errorResponse,
  successResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '@/server';
import { validateBody } from '@/server/validate';
import type { ITransactionPreset } from '@/server/models/transaction-preset.model';
import type { TransactionPreset } from '@/types/finance';

export const createPresetSchema = z.object({
  label: z.string().trim().min(1, 'Name is required').max(16),
  type: z.enum(['income', 'expense']),
  amount: z.number().int().positive().max(999_999_999_999),
  walletId: z.string().min(1),
  categoryId: z.string().min(1),
  note: z.string().trim().max(100).optional(),
});

export function serialize(p: ITransactionPreset): TransactionPreset {
  return {
    id: p._id.toString(),
    label: p.label,
    type: p.type,
    amount: p.amount,
    walletId: p.walletId.toString(),
    categoryId: p.categoryId.toString(),
    note: p.note || undefined,
  };
}

// GET /api/v1/finance/presets
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();

  const presets = await TransactionPresetModel.find({ userId: user.sub }).sort({ createdAt: 1 });

  return successResponse(presets.map(serialize));
});

// POST /api/v1/finance/presets — at most MAX_TRANSACTION_PRESETS per user
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, createPresetSchema);
  if (error) return error;

  await connectDB();

  const refsError = await presetRefsError(user.sub, data.type, data.walletId, data.categoryId);
  if (refsError) return errorResponse(refsError.message, refsError.status);

  const limitError = () =>
    validationErrorResponse({ _: [`At most ${MAX_TRANSACTION_PRESETS} presets`] });

  if (
    (await TransactionPresetModel.countDocuments({ userId: user.sub })) >= MAX_TRANSACTION_PRESETS
  ) {
    return limitError();
  }

  const preset = await TransactionPresetModel.create({
    userId: user.sub,
    ...data,
    note: data.note || undefined,
  });

  // Count-then-create leaves a gap two devices can slip through. Count again once written; the
  // newest rows are the ones over the cap, so only a preset past the limit removes itself.
  const kept = await TransactionPresetModel.find({ userId: user.sub })
    .sort({ createdAt: 1, _id: 1 })
    .limit(MAX_TRANSACTION_PRESETS)
    .select('_id')
    .lean();
  if (!kept.some((p) => p._id.equals(preset._id))) {
    await TransactionPresetModel.deleteOne({ _id: preset._id });
    return limitError();
  }

  return createdResponse(serialize(preset), 'Preset created');
});
