import mongoose from 'mongoose';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { getProgressMap, toTaskProgress } from '@/server/helpers/schedule-block.helpers';
import { TaskModel } from '@/server/models/task.model';
import { asyncHandler, createdResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody, validateSearchParams } from '@/server/validate';
import type { Task } from '@/types/task';
import type { PaginationMeta } from '@/types/api';
import type { ITask } from '@/server/models/task.model';
import { diacriticRegex } from '@/libs/utils';

const TASK_COLORS = ['gold', 'mint', 'violet', 'cyan', 'rose', 'amber', 'blue'] as const;

const dateField = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const createSchema = z.object({
  name: z.string().min(1).max(100),
  note: z.string().max(500).optional(),
  tagId: z.string().min(1),
  color: z.enum(TASK_COLORS),
  icon: z.string().min(1),
  duration: z.number().int().min(1).max(1440).optional(),
  startDate: dateField.optional(),
  endDate: dateField.optional(),
  /** Habit ObjectId — marks this task as a one-day replacement for that habit */
  habitRef: z.string().optional(),
  /** Project ObjectId — marks this task as belonging to a project */
  projectId: z.string().optional(),
  dependencies: z.array(z.string()).optional().default([]),
  attachments: z.array(z.string().url()).max(3).optional().default([]),
});

const querySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  /** Filter to a single project's tasks (skips date filter). */
  projectId: z.string().optional(),
  /** Filter to a single category. Combinable with pagination. */
  tagId: z.string().optional(),
  /** Search by name (case-insensitive). Skips date filter, sorts by createdAt desc. */
  q: z.string().optional(),
  /** Max number of results. Applied when q is set or no date range is given. */
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /**
   * Number of results to skip. Presence of this param (even `0`) opts into
   * paginated mode: skip/limit applied and `total`/page meta returned.
   * Omit entirely for the legacy "everything matching the filter" behavior.
   */
  offset: z.coerce.number().int().min(0).optional(),
  /** Paginated order: by start date (default), or by creation time, newest or oldest first. */
  sort: z.enum(['startDate', 'createdAt', '-createdAt']).optional(),
});

/** Overlap filter for tasks whose [startDate, endDate] range intersects [start, end]. */
function buildDateOrFilter(start?: string, end?: string): Record<string, unknown>[] | null {
  if (!start && !end) return null;

  // All dates are stored as UTC midnight (new Date("YYYY-MM-DD")).
  // Add 1 day to the end bound so the query-end day is included ($lt exclusive).
  const qStart = start ? new Date(start) : null;
  const qEndExclusive = end ? new Date(new Date(end).getTime() + 86_400_000) : null;

  // ── Single-day tasks (no endDate) — startDate within [qStart, qEnd] ─────────
  const singleDayFilter: Record<string, unknown> = { endDate: { $exists: false } };
  const startRange: Record<string, Date> = {};
  if (qStart) startRange.$gte = qStart;
  if (qEndExclusive) startRange.$lt = qEndExclusive;
  if (Object.keys(startRange).length > 0) singleDayFilter.startDate = startRange;

  // ── Multi-day tasks (has endDate) — range overlaps [qStart, qEnd] ───────────
  //   startDate < qEndExclusive  AND  endDate >= qStart
  const endDateFilter: Record<string, unknown> = { $exists: true };
  if (qStart) endDateFilter.$gte = qStart;

  const multiDayFilter: Record<string, unknown> = { endDate: endDateFilter };
  if (qEndExclusive) multiDayFilter.startDate = { $lt: qEndExclusive };

  return [singleDayFilter, multiDayFilter];
}

function serialize(t: ITask): Task {
  return {
    id: t._id.toString(),
    userId: t.userId.toString(),
    name: t.name,
    note: t.note,
    tagId: t.tagId,
    color: t.color,
    icon: t.icon,
    status: t.status,
    duration: t.duration,
    startDate: t.startDate?.toISOString().substring(0, 10),
    endDate: t.endDate?.toISOString().substring(0, 10),
    habitRef: t.habitRef?.toString(),
    projectId: t.projectId?.toString(),
    attachments: t.attachments ?? [],
    dependencies: t.dependencies.map((d) => d.toString()),
    active: t.active,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Serialize tasks and attach derived schedule-block progress to each. */
async function serializeWithProgress(userId: string, tasks: ITask[]): Promise<Task[]> {
  const ids = tasks.map((t) => t._id);
  const progressMap = await getProgressMap(userId, 'task', ids);
  return tasks.map((t) => ({
    ...serialize(t),
    progress: toTaskProgress(progressMap.get(t._id.toString()), t.duration),
  }));
}

// GET /api/v1/tasks?start=YYYY-MM-DD&end=YYYY-MM-DD
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  // ✓ Use req.nextUrl.searchParams — not req directly
  const { data: query, error: queryError } = await validateSearchParams(
    req.nextUrl.searchParams,
    querySchema,
  );
  if (queryError) return queryError;

  await connectDB();

  const filter: Record<string, unknown> = { userId: user.sub, active: true };

  // ── Project mode — all tasks of a single project, no date filtering ───────────
  if (query?.projectId) {
    filter.projectId = query.projectId;
    const tasks = await TaskModel.find(filter).sort({ createdAt: 1 });
    return successResponse(await serializeWithProgress(user.sub, tasks));
  }

  // ── Paginated list mode — explicit `offset` opts into skip/limit + total count.
  // Combinable with q/tagId/start/end. Legacy callers that never send `offset`
  // fall through to the unpaginated modes below, completely unaffected.
  if (query?.offset !== undefined) {
    if (query?.q) filter.name = { $regex: diacriticRegex(query.q), $options: 'i' };
    if (query?.tagId) filter.tagId = query.tagId;
    const dateOr = buildDateOrFilter(query?.start, query?.end);
    if (dateOr) filter.$or = dateOr;

    const limit = query?.limit ?? 20;
    const offset = query.offset;

    const [tasks, total] = await Promise.all([
      TaskModel.find(filter)
        .sort(
          query.sort === 'createdAt'
            ? { createdAt: 1 }
            : query.sort === '-createdAt'
              ? { createdAt: -1 }
              : { startDate: 1 },
        )
        .skip(offset)
        .limit(limit),
      TaskModel.countDocuments(filter),
    ]);

    const meta: PaginationMeta = {
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: offset + tasks.length < total,
      hasPrevPage: offset > 0,
    };

    return successResponse(await serializeWithProgress(user.sub, tasks), 'Success', meta);
  }

  // ── Search / recent-list mode (q or limit without date range) ────────────────
  const isSearchMode = query?.q || (query?.limit && !query?.start && !query?.end);

  if (isSearchMode) {
    if (query?.q) {
      filter.name = { $regex: diacriticRegex(query.q), $options: 'i' };
    }
    const tasks = await TaskModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(query?.limit ?? 10);
    return successResponse(await serializeWithProgress(user.sub, tasks));
  }

  // ── Date-range mode ───────────────────────────────────────────────────────────
  const dateOr = buildDateOrFilter(query?.start, query?.end);
  if (dateOr) filter.$or = dateOr;

  const tasks = await TaskModel.find(filter).sort({ startDate: 1 });

  return successResponse(await serializeWithProgress(user.sub, tasks));
});

// POST /api/v1/tasks
export const POST = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data, error } = await validateBody(req, createSchema);
  if (error) return error;

  await connectDB();

  const startDate = data.startDate ? new Date(data.startDate) : undefined;
  const endDate = data.endDate ? new Date(data.endDate) : undefined;

  if (startDate && endDate && endDate < startDate) {
    return successResponse(null, 'endDate must be >= startDate');
  }

  const task = await TaskModel.create({
    userId: user.sub,
    name: data.name,
    note: data.note,
    tagId: data.tagId,
    color: data.color,
    icon: data.icon,
    duration: data.duration,
    startDate,
    endDate,
    habitRef: data.habitRef ? new mongoose.Types.ObjectId(data.habitRef) : undefined,
    projectId: data.projectId ? new mongoose.Types.ObjectId(data.projectId) : undefined,
    dependencies: data.dependencies,
    attachments: data.attachments,
  });

  return createdResponse(serialize(task), 'Task created successfully');
});
