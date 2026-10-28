'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { apiClient } from '@/libs/axios';
import type { ApiResponse, HabitLog, UpsertHabitLogPayload } from '@/types';

export function useToggleHabitLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpsertHabitLogPayload) => {
      const { data } = await apiClient.post<ApiResponse<HabitLog>>('/habits/logs', payload);
      return data.data;
    },
    onSuccess: () => {
      // Invalidate all habit-log queries (both single-date and range keys) so
      // every consumer — dashboard, tasks day view, week view — stays in sync.
      queryClient.invalidateQueries({ queryKey: ['habit-logs'] });
      // The server pays xp and coins when this lands, so the hero panel is stale until it reloads.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
  });
}
