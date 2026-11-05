import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { deactivateProjectTasks } from '@/server/helpers/schedule-block.helpers';
import { ProjectModel } from '@/server/models/project.model';
import { asyncHandler, notFoundResponse, successResponse, unauthorizedResponse } from '@/server';
import { serialize } from '../../route';

// PATCH /api/v1/projects/:id/archive — archive project AND hide its child tasks
export const PATCH = asyncHandler(async (req: NextRequest, ctx) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await ctx.params;

  await connectDB();

  const project = await ProjectModel.findOneAndUpdate(
    { _id: id, userId: user.sub },
    { $set: { status: 'archived', active: false } },
    { new: true },
  );

  if (!project) return notFoundResponse('Project not found');

  // Cascade: hide every child task and drop its sessions
  await deactivateProjectTasks(user.sub, project._id);

  return successResponse(serialize(project), 'Project archived');
});
