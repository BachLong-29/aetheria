import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { UserSettingModel } from '@/server/models/user-setting.model';
import { asyncHandler, successResponse, unauthorizedResponse } from '@/server';
import { validateBody, validateSearchParams } from '@/server/validate';

/** Oldest images fall off past this many, so the picker stays a quick grid. */
const MAX_LIBRARY = 30;

const urlSchema = z.object({
  url: z.string().trim().url().startsWith('https://').max(500),
});

/** The images the user has uploaded and kept, newest first. Empty until they upload one. */
async function readLibrary(userId: string): Promise<string[]> {
  const settings = await UserSettingModel.findOne({ userId }, { iconLibrary: 1 }).lean();
  return settings?.iconLibrary ?? [];
}

// GET /api/v1/icon-library — uploaded icon images kept for reuse, newest first
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();
  return successResponse(await readLibrary(user.sub));
});

// POST /api/v1/icon-library — keep an upload; one already kept moves to the front
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, urlSchema);
  if (error) return error;

  await connectDB();

  // Two steps because one update cannot both $pull and $push the same array.
  await UserSettingModel.updateOne({ userId: user.sub }, { $pull: { iconLibrary: data.url } });
  const settings = await UserSettingModel.findOneAndUpdate(
    { userId: user.sub },
    { $push: { iconLibrary: { $each: [data.url], $position: 0, $slice: MAX_LIBRARY } } },
    { upsert: true, new: true, projection: { iconLibrary: 1 } },
  ).lean();

  return successResponse(settings?.iconLibrary ?? []);
});

// DELETE /api/v1/icon-library?url=… — forget one image (the file itself stays: tasks may use it)
export const DELETE = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = validateSearchParams(req.nextUrl.searchParams, urlSchema);
  if (error) return error;

  await connectDB();

  const settings = await UserSettingModel.findOneAndUpdate(
    { userId: user.sub },
    { $pull: { iconLibrary: data.url } },
    { new: true, projection: { iconLibrary: 1 } },
  ).lean();

  return successResponse(settings?.iconLibrary ?? []);
});
