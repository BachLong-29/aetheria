import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { deactivateProjectTasks } from '@/server/helpers/schedule-block.helpers';
import { ProjectModel } from '@/server/models/project.model';
import { TaskModel } from '@/server/models/task.model';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { validateBody } from '@/server/validate';
import type { ITask } from '@/server/models/task.model';
import type { Task } from '@/types/task';
import { serialize } from '../route';

const PROJECT_COLORS = ['gold', 'mint', 'violet', 'cyan', 'rose', 'amber', 'blue'] as const;
const PROJECT_PRIORITIES = ['high', 'medium', 'low'] as const;

const dateField = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  color: z.enum(PROJECT_COLORS).optional(),
  icon: z.string().min(1).optional(),
  priority: z.enum(PROJECT_PRIORITIES).optional(),
  startDate: dateField.optional().nullable(),
  deadline: dateField.optional().nullable(),
  xp: z.number().int().min(0).optional(),
  coins: z.number().int().min(0).optional(),
});

function serializeTask(t: ITask): Task {
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
    deferReason: t.deferReason,
    attachments: t.attachments ?? [],
    dependencies: t.dependencies.map((d) => d.toString()),
    active: t.active,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// GET /api/v1/projects/:id — project detail + its active tasks
export const GET = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  const project = await ProjectModel.findOne({ _id: id, userId: user.sub });
  if (!project) return notFoundResponse('Project not found');

  const tasks = await TaskModel.find({
    userId: user.sub,
    projectId: id,
    active: true,
  }).sort({ createdAt: 1 });

  const done = tasks.filter((t) => t.status === 'done').length;
  const dto = serialize(project, { done, total: tasks.length });

  return successResponse({ ...dto, tasks: tasks.map(serializeTask) });
});

// PUT /api/v1/projects/:id
export const PUT = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;
  const { data, error } = await validateBody(req, updateSchema);
  if (error) return error;

  await connectDB();

  const setData: Record<string, unknown> = {};
  const unsetData: Record<string, 1> = {};

  const { startDate, deadline, description, ...rest } = data;
  for (const [key, val] of Object.entries(rest)) {
    if (val !== undefined) setData[key] = val;
  }

  if (description === null) unsetData.description = 1;
  else if (description !== undefined) setData.description = description;

  if (startDate === null) unsetData.startDate = 1;
  else if (startDate) setData.startDate = new Date(startDate);

  if (deadline === null) unsetData.deadline = 1;
  else if (deadline) setData.deadline = new Date(deadline);

  const updateOp: Record<string, unknown> = {};
  if (Object.keys(setData).length > 0) updateOp.$set = setData;
  if (Object.keys(unsetData).length > 0) updateOp.$unset = unsetData;

  const project = await ProjectModel.findOneAndUpdate({ _id: id, userId: user.sub }, updateOp, {
    new: true,
  });

  if (!project) return notFoundResponse('Project not found');

  const tasks = await TaskModel.find({ userId: user.sub, projectId: id, active: true });
  const done = tasks.filter((t) => t.status === 'done').length;

  return successResponse(serialize(project, { done, total: tasks.length }), 'Project updated');
});

// DELETE /api/v1/projects/:id — soft delete (also hides child tasks)
export const DELETE = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  const project = await ProjectModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    { $set: { active: false, status: 'archived' } },
    { new: true },
  );

  if (!project) return notFoundResponse('Project not found');

  await deactivateProjectTasks(user.sub, project._id);

  return successResponse(null, 'Project deleted');
});
