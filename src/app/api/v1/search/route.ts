import { z } from 'zod';
import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { TaskModel } from '@/server/models/task.model';
import { HabitModel } from '@/server/models/habit.model';
import { QuestModel } from '@/server/models/quest.model';
import { ProjectModel } from '@/server/models/project.model';
import { asyncHandler, successResponse, unauthorizedResponse } from '@/server';
import { validateSearchParams } from '@/server/validate';
import type { GlobalSearchResult, SearchHit } from '@/types/search';
import { diacriticRegex } from '@/libs/utils';

const querySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required'),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

// Quest documents have no icon — fall back to a glyph per quest type.
const QUEST_TYPE_ICON: Record<string, string> = {
  focus: '🎯',
  habit: '🔁',
  reflect: '📓',
  admin: '🗂',
  create: '🎨',
  health: '💪',
  break: '☕',
};

// GET /api/v1/search?q=<term>&limit=<n>
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { data: query, error } = validateSearchParams(req.nextUrl.searchParams, querySchema);
  if (error) return error;

  await connectDB();

  const limit = query?.limit ?? 5;
  const rx = { $regex: diacriticRegex(query?.q ?? ''), $options: 'i' };
  const userId = user.sub;

  const [tasks, habits, quests, projects] = await Promise.all([
    TaskModel.find({ userId, active: true, name: rx }).sort({ updatedAt: -1 }).limit(limit),
    HabitModel.find({ userId, active: true, name: rx }).sort({ updatedAt: -1 }).limit(limit),
    QuestModel.find({ userId, title: rx }).sort({ updatedAt: -1 }).limit(limit),
    ProjectModel.find({ userId, active: true, name: rx }).sort({ updatedAt: -1 }).limit(limit),
  ]);

  const result: GlobalSearchResult = {
    tasks: tasks.map(
      (t): SearchHit => ({
        id: t._id.toString(),
        type: 'task',
        label: t.name,
        icon: t.icon,
        color: t.color,
        href: '/tasks',
      }),
    ),
    habits: habits.map(
      (h): SearchHit => ({
        id: h._id.toString(),
        type: 'habit',
        label: h.name,
        icon: h.icon,
        color: h.color,
        href: '/dashboard?tab=habits',
      }),
    ),
    quests: quests.map(
      (q): SearchHit => ({
        id: q._id.toString(),
        type: 'quest',
        label: q.title,
        icon: QUEST_TYPE_ICON[q.type] ?? '⚔️',
        color: 'violet',
        href: '/dashboard?tab=quests',
      }),
    ),
    projects: projects.map(
      (p): SearchHit => ({
        id: p._id.toString(),
        type: 'project',
        label: p.name,
        icon: p.icon,
        color: p.color,
        href: `/projects/${p._id.toString()}`,
      }),
    ),
  };

  return successResponse(result);
});
