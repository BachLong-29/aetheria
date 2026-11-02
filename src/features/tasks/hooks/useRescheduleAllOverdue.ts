'use client';

import { useCallback, useState } from 'react';

import { useUpdateTask } from '@/features/dashboard/hooks/useUpdateTask';
import { apiClient } from '@/libs/axios';
import type { ApiResponse, ScheduleBlock } from '@/types';

import type { OverdueItem } from './useOverdueReview';

export interface RescheduleAllResult {
  /** Tasks whose date moved. */
  movedIds: string[];
  /** Tasks that failed and are still overdue. */
  failedCount: number;
  /** Scheduled sessions of the moved tasks, still pinned to their old days. */
  blockIds: string[];
}

/**
 * Moves every given overdue task to one date. Requests run in parallel and
 * settle independently, so one failure never undoes the others.
 */
export function useRescheduleAllOverdue() {
  const { mutateAsync: updateTask } = useUpdateTask();
  const [isPending, setIsPending] = useState(false);

  const rescheduleAll = useCallback(
    async (items: OverdueItem[], newStartDate: string): Promise<RescheduleAllResult> => {
      setIsPending(true);
      try {
        const results = await Promise.allSettled(
          items.map((item) => updateTask({ id: item.id, startDate: newStartDate, endDate: null })),
        );
        const movedIds = items
          .filter((_, i) => results[i]?.status === 'fulfilled')
          .map((i) => i.id);

        // Sessions are looked up after the move, only for tasks that moved. A failed
        // lookup just skips the prompt — the dates themselves are already saved.
        const blockLists = await Promise.allSettled(
          movedIds.map((id) =>
            apiClient.get<ApiResponse<ScheduleBlock[]>>(
              `/schedule-blocks?sourceType=task&sourceId=${id}`,
            ),
          ),
        );
        const blockIds = blockLists.flatMap((r) =>
          r.status === 'fulfilled' ? (r.value.data.data ?? []).map((b) => b.id) : [],
        );

        return { movedIds, failedCount: items.length - movedIds.length, blockIds };
      } finally {
        setIsPending(false);
      }
    },
    [updateTask],
  );

  return { rescheduleAll, isPending };
}
