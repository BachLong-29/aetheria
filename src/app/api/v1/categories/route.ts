import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { isDuplicateKeyError } from '@/server/helpers/duplicate-key';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { CategoryModel } from '@/server/models/category.model';
import {
  asyncHandler,
  createdResponse,
  errorResponse,
  successResponse,
  unauthorizedResponse,
} from '@/server';
import { validateBody } from '@/server/validate';
import type { Category } from '@/types/category';
import type { ICategory } from '@/server/models/category.model';

const DEFAULT_CATEGORIES = ['Morning Routine', 'Healthy Lifestyle', 'Work'];

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50).trim(),
});

function serialize(c: ICategory): Category {
  return {
    id: c._id.toString(),
    userId: c.userId.toString(),
    name: c.name,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// GET /api/v1/categories — seed defaults on first call
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();

  let categories = await CategoryModel.find({ userId: user.sub }).sort({ createdAt: 1 });

  if (categories.length === 0) {
    await CategoryModel.insertMany(DEFAULT_CATEGORIES.map((name) => ({ userId: user.sub, name })));
    categories = await CategoryModel.find({ userId: user.sub }).sort({ createdAt: 1 });
  }

  return successResponse(categories.map(serialize));
});

// POST /api/v1/categories
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, createSchema);
  if (error) return error;

  await connectDB();

  try {
    const category = await CategoryModel.create({
      userId: user.sub,
      name: data.name,
    });
    return createdResponse(serialize(category), 'Category created');
  } catch (err) {
    if (isDuplicateKeyError(err))
      return errorResponse(`A category named "${data.name}" already exists.`, 409);
    throw err;
  }
});
