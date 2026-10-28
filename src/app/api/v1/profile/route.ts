import mongoose from 'mongoose';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { UserProfileModel } from '@/server/models/user-profile.model';
import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { UserSettingModel } from '@/server/models/user-setting.model';
import { resolveCashLogCategoryIds } from '@/server/services/cash-log-notifications';
import { asyncHandler, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';
import type { IUserProfile } from '@/server/models/user-profile.model';
import type { IUserSetting } from '@/server/models/user-setting.model';
import type { UserProfileData, UserSettingData, CombinedProfileResponse } from '@/types/profile';

const statsSchema = z.object({
  discipline: z.number().min(1).max(10),
  wisdom: z.number().min(1).max(10),
  endurance: z.number().min(1).max(10),
  composition: z.number().min(1).max(10),
  serenity: z.number().min(1).max(10),
});

const updateSchema = z.object({
  heroName: z.string().max(40).optional(),
  title: z.string().max(60).optional(),
  handle: z.string().max(24).optional(),
  pronouns: z.string().max(24).optional(),
  region: z.string().max(40).optional(),
  sigil: z.string().max(2).optional(),
  motto: z.string().max(120).optional(),
  classId: z.string().optional(),
  companionId: z.string().optional(),
  accent: z.string().optional(),
  stats: statsSchema.optional(),
  statPool: z.number().min(10).max(50).optional(),
  primaryFocus: z.array(z.string()).max(4).optional(),
  badges: z.array(z.string()).max(4).optional(),
  // level, xp, xpNext, streak, coins, gems and rank are not accepted here: the server pays and
  // levels the hero (see `awardProgress`), so a client can't write its own balance.
  morningRitual: z.boolean().optional(),
  nightlyReview: z.boolean().optional(),
  streakProtection: z.number().min(0).max(3).optional(),
  questDifficulty: z.enum(['gentle', 'rising', 'harsh']).optional(),
  seasonalRites: z.boolean().optional(),
  autoReclaim: z.boolean().optional(),
  language: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  compactMode: z.boolean().optional(),
  dailyCapacityMinutes: z.number().min(60).max(1440).optional(),
  cashLogEnabled: z.boolean().optional(),
  cashLogTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
    .optional(),
  cashLogCategoryIds: z.array(z.string().min(1)).optional(),
});

function serializeProfile(p: IUserProfile): UserProfileData {
  return {
    id: p._id.toString(),
    userId: p.userId.toString(),
    heroName: p.heroName,
    title: p.title,
    handle: p.handle,
    pronouns: p.pronouns,
    region: p.region,
    sigil: p.sigil,
    motto: p.motto,
    classId: p.classId,
    companionId: p.companionId,
    accent: p.accent,
    stats: {
      discipline: p.stats.discipline,
      wisdom: p.stats.wisdom,
      endurance: p.stats.endurance,
      composition: p.stats.composition,
      serenity: p.stats.serenity,
    },
    statPool: p.statPool,
    primaryFocus: p.primaryFocus,
    badges: p.badges,
    joined: p.joined,
    level: p.level,
    xp: p.xp,
    xpNext: p.xpNext,
    streak: p.streak,
    coins: p.coins,
    gems: p.gems,
    rank: p.rank,
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * Async because the cash-log category defaults are derived from the user's own
 * finance categories: until they first save the setting, the picker should
 * open with the obvious ones already ticked rather than empty.
 */
async function serializeSetting(s: IUserSetting): Promise<UserSettingData> {
  return {
    id: s._id.toString(),
    userId: s.userId.toString(),
    morningRitual: s.morningRitual,
    nightlyReview: s.nightlyReview,
    streakProtection: s.streakProtection,
    questDifficulty: s.questDifficulty,
    seasonalRites: s.seasonalRites,
    autoReclaim: s.autoReclaim,
    language: s.language,
    timezone: s.timezone,
    theme: s.theme,
    compactMode: s.compactMode,
    dailyCapacityMinutes: s.schedule?.dailyCapacityMinutes ?? 600,
    cashLogEnabled: s.cashLog?.enabled ?? true,
    cashLogTime: s.cashLog?.time ?? '22:00',
    cashLogCategoryIds: (
      await (async () => {
        const categories = await FinanceCategoryModel.find({ userId: s.userId, type: 'expense' })
          .select('_id name')
          .lean();
        return resolveCashLogCategoryIds(s.cashLog?.categoryIds, categories);
      })()
    ).map((id) => id.toString()),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// GET /api/v1/profile — returns combined profile + settings
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();

  const [profile, settings] = await Promise.all([
    UserProfileModel.findOneAndUpdate(
      { userId: user.sub },
      { $setOnInsert: { userId: user.sub } },
      { upsert: true, new: true },
    ),
    UserSettingModel.findOneAndUpdate(
      { userId: user.sub },
      { $setOnInsert: { userId: user.sub } },
      { upsert: true, new: true },
    ),
  ]);

  const response: CombinedProfileResponse = {
    profile: serializeProfile(profile),
    settings: await serializeSetting(settings),
  };

  return successResponse(response);
});

// PUT /api/v1/profile — updates profile + settings atomically
export const PUT = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  const profileFields: Record<string, unknown> = {};
  const settingFields: Record<string, unknown> = {};

  const profileKeys = [
    'heroName',
    'title',
    'handle',
    'pronouns',
    'region',
    'sigil',
    'motto',
    'classId',
    'companionId',
    'accent',
    'stats',
    'statPool',
    'primaryFocus',
    'badges',
  ] as const;

  const settingKeys = [
    'morningRitual',
    'nightlyReview',
    'streakProtection',
    'questDifficulty',
    'seasonalRites',
    'autoReclaim',
    'language',
    'timezone',
    'theme',
    'compactMode',
  ] as const;
  if (data.cashLogEnabled !== undefined) settingFields['cashLog.enabled'] = data.cashLogEnabled;
  if (data.cashLogTime !== undefined) settingFields['cashLog.time'] = data.cashLogTime;
  if (data.cashLogCategoryIds !== undefined) {
    settingFields['cashLog.categoryIds'] = data.cashLogCategoryIds.map(
      (id) => new mongoose.Types.ObjectId(id),
    );
  }
  if (data.dailyCapacityMinutes !== undefined) {
    settingFields['schedule.dailyCapacityMinutes'] = data.dailyCapacityMinutes;
  }

  for (const key of profileKeys) {
    if (data[key] !== undefined) profileFields[key] = data[key];
  }
  for (const key of settingKeys) {
    if (data[key] !== undefined) settingFields[key] = data[key];
  }

  const [profile, settings] = await Promise.all([
    UserProfileModel.findOneAndUpdate(
      { userId: user.sub },
      { $set: profileFields },
      { upsert: true, new: true },
    ),
    UserSettingModel.findOneAndUpdate(
      { userId: user.sub },
      { $set: settingFields },
      { upsert: true, new: true },
    ),
  ]);

  const response: CombinedProfileResponse = {
    profile: serializeProfile(profile),
    settings: await serializeSetting(settings),
  };

  return successResponse(response, 'Profile updated successfully');
});
