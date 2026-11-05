import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { isDuplicateKeyError } from '@/server/helpers/duplicate-key';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { CategoryModel } from '@/server/models/category.model';
import { EventModel } from '@/server/models/event.model';
import { HabitModel } from '@/server/models/habit.model';
import { TaskModel } from '@/server/models/task.model';
import {
  asyncHandler,
  errorResponse,
  notFoundResponse,
  successResponse,
  unauthorizedResponse,
} from '@/server';
import { validateBody } from '@/server/validate';
import type { Category } from '@/types/category';
import type { ICategory } from '@/server/models/category.model';

const updateSchema = z.object({
  name: z.string().min(1).max(50).trim(),
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

// PATCH /api/v1/categories/:id
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  try {
    const category = await CategoryModel.findOneAndUpdate(
      { _id: id, userId: user.sub },
      { name: data.name },
      { new: true },
    );

    if (!category) return notFoundResponse('Category not found');

    return successResponse(serialize(category), 'Category updated');
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return errorResponse(`A category named "${data.name}" already exists.`, 409);
    }
    throw err;
  }
});

// DELETE /api/v1/categories/:id
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  // Override rows carry no tagId of their own, so only series/one-off rows count.
  const [habits, tasks, events] = await Promise.all([
    HabitModel.countDocuments({ userId: user.sub, tagId: id, active: true }),
    TaskModel.countDocuments({ userId: user.sub, tagId: id, active: true }),
    EventModel.countDocuments({ userId: user.sub, tagId: id, active: true }),
  ]);
  const usedBy = [
    habits > 0 && `${habits} habit${habits > 1 ? 's' : ''}`,
    tasks > 0 && `${tasks} task${tasks > 1 ? 's' : ''}`,
    events > 0 && `${events} event${events > 1 ? 's' : ''}`,
  ].filter(Boolean);
  if (usedBy.length > 0) {
    return NextResponse.json(
      {
        success: false,
        message: `Cannot delete: this category is used by ${usedBy.join(', ')}.`,
      },
      { status: 409 },
    );
  }

  const category = await CategoryModel.findOneAndDelete({ _id: id, userId: user.sub });
  if (!category) return notFoundResponse('Category not found');

  return successResponse(null, 'Category deleted');
});
