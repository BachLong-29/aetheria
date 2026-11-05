import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { presetRefsError } from '@/server/helpers/preset-refs';
import { TransactionPresetModel } from '@/server/models/transaction-preset.model';
import {
  asyncHandler,
  errorResponse,
  notFoundResponse,
  successResponse,
  unauthorizedResponse,
} from '@/server';
import { validateBody } from '@/server/validate';
import { createPresetSchema, serialize } from '../route';

const updateSchema = createPresetSchema.partial().extend({
  note: createPresetSchema.shape.note.nullable(),
});

// PATCH /api/v1/finance/presets/:id
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  // Judge the preset as it will be after the edit: a new type must still fit its category. A
  // label or amount edit skips this, so a preset whose wallet was since deleted stays editable.
  if (data.type || data.walletId || data.categoryId) {
    const current = await TransactionPresetModel.findOne({ _id: id, userId: user.sub });
    if (!current) return notFoundResponse('Preset not found');
    const refsError = await presetRefsError(
      user.sub,
      data.type ?? current.type,
      data.walletId ?? current.walletId,
      data.categoryId ?? current.categoryId,
    );
    if (refsError) return errorResponse(refsError.message, refsError.status);
  }

  const { note, ...rest } = data;
  const update: Record<string, unknown> = {};
  const set: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rest)) {
    if (val !== undefined) set[key] = val;
  }
  if (note) set.note = note;
  if (Object.keys(set).length > 0) update.$set = set;
  // `null` (or an empty string) clears the note.
  if (note === null || note === '') update.$unset = { note: 1 };

  const preset = await TransactionPresetModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    update,
    { new: true },
  );
  if (!preset) return notFoundResponse('Preset not found');

  return successResponse(serialize(preset), 'Preset updated');
});

// DELETE /api/v1/finance/presets/:id
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  const preset = await TransactionPresetModel.findOneAndDelete({ _id: id, userId: user.sub });
  if (!preset) return notFoundResponse('Preset not found');

  return successResponse(null, 'Preset deleted');
});
