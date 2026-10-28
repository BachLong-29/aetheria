'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { apiClient } from '@/libs/axios';
import type { ApiResponse, Task, UpdateTaskPayload } from '@/types';

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateTaskPayload & { id: string }) => {
      const { data } = await apiClient.patch<ApiResponse<Task>>(`/tasks/${id}`, payload);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      // Single-task caches (e.g. the search / notification edit flows) would
      // otherwise serve the pre-edit task for the default 60s stale window.
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleBlocks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
      // The server pays xp and coins when this lands, so the hero panel is stale until it reloads.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
  });
}
