'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { apiClient } from '@/libs/axios';
import type { ApiResponse, TaskLog, ToggleTaskLogPayload } from '@/types';

/** Toggles a TaskLog entry: creates if absent, deletes if present (same as HabitLog toggle). */
export function useToggleTaskLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ToggleTaskLogPayload) => {
      const { data } = await apiClient.post<ApiResponse<TaskLog | null>>('/task-logs', payload);
      return data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-logs', variables.date] });
      // The server marks that day's sessions done (or planned again), which moves task progress.
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleBlocks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
      // The server pays xp and coins when this lands, so the hero panel is stale until it reloads.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
  });
}
