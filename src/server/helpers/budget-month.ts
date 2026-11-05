import type mongoose from 'mongoose';

import { UserSettingModel } from '@/server/models/user-setting.model';
import { dayKeyIn } from '@/server/services/progress';

type IdLike = mongoose.Types.ObjectId | string;

/** True when `month` ("YYYY-MM") is before the user's current month, in their timezone. */
export async function isPastBudgetMonth(userId: IdLike, month: string): Promise<boolean> {
  const setting = await UserSettingModel.findOne({ userId }).select('timezone').lean();
  const current = dayKeyIn(setting?.timezone || 'UTC').slice(0, 7);
  return month < current;
}

export const PAST_MONTH_MESSAGE = 'Budgets can no longer be set for a month that has passed';
