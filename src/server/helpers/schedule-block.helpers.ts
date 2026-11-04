import mongoose from 'mongoose';

import { ScheduleBlockModel } from '@/server/models/schedule-block.model';
import type { ScheduleBlockSource, TaskProgress } from '@/types/schedule-block';

type IdLike = mongoose.Types.ObjectId | string;

interface ProgressAgg {
  _id: mongoose.Types.ObjectId;
  planned: number;
  completed: number;
}

/**
 * Aggregate planned/completed minutes per source for a set of source ids.
 * Returns a map keyed by sourceId string.
 */
export async function getProgressMap(
  userId: IdLike,
  sourceType: ScheduleBlockSource,
  sourceIds: IdLike[],
): Promise<Map<string, { plannedMinutes: number; completedMinutes: number }>> {
  const map = new Map<string, { plannedMinutes: number; completedMinutes: number }>();
  if (sourceIds.length === 0) return map;

  // Aggregation does NOT apply schema casting — convert ids to ObjectId explicitly.
  const uid = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
  const sids = sourceIds.map((id) =>
    typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id,
  );

  const rows = await ScheduleBlockModel.aggregate<ProgressAgg>([
    { $match: { userId: uid, sourceType, sourceId: { $in: sids } } },
    {
      $group: {
        _id: '$sourceId',
        planned: { $sum: '$duration' },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'done'] }, '$duration', 0] },
        },
      },
    },
  ]);

  for (const r of rows) {
    map.set(r._id.toString(), { plannedMinutes: r.planned, completedMinutes: r.completed });
  }
  return map;
}

/** Build a TaskProgress object from aggregated minutes + the task's estimate. */
export function toTaskProgress(
  agg: { plannedMinutes: number; completedMinutes: number } | undefined,
  estimateMinutes: number | undefined,
): TaskProgress {
  const plannedMinutes = agg?.plannedMinutes ?? 0;
  const completedMinutes = agg?.completedMinutes ?? 0;
  const progressPct =
    estimateMinutes && estimateMinutes > 0
      ? Math.min(100, Math.round((completedMinutes / estimateMinutes) * 100))
      : null;
  return { plannedMinutes, completedMinutes, progressPct };
}

/**
 * Mirror a tick onto the task's sessions: `done` blocks count toward progress, so a
 * tick that never reached them left every task at 0%. With `date` only that day's
 * blocks change (a multi-day task ticked once a day); without it, all of them.
 * Un-ticking sends `done` back to `planned` and leaves `missed` alone.
 */
export async function setTaskBlocksDone(
  userId: IdLike,
  taskId: IdLike,
  done: boolean,
  date?: string,
): Promise<void> {
  const filter = {
    userId,
    sourceType: 'task' as const,
    sourceId: taskId,
    ...(date ? { date: new Date(date) } : {}),
  };
  if (done) {
    await ScheduleBlockModel.updateMany(
      { ...filter, status: { $ne: 'done' } },
      { $set: { status: 'done' } },
    );
  } else {
    await ScheduleBlockModel.updateMany(
      { ...filter, status: 'done' },
      { $set: { status: 'planned' } },
    );
  }
}
