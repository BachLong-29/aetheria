'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { apiClient } from '@/libs/axios';
import type { ApiResponse, Quest } from '@/types';

interface UpdateQuestStatusPayload {
  id: string;
  done: boolean;
}

export function useUpdateQuestStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, done }: UpdateQuestStatusPayload) => {
      const { data } = await apiClient.patch<ApiResponse<Quest>>(`/quests/${id}`, { done });
      return data.data;
    },
    onSuccess: () => {
      // Without this a ticked quest stayed done only in whichever view was
      // clicked; the week view, the calendar and the shared agenda all kept
      // serving the pre-tick state.
      queryClient.invalidateQueries({ queryKey: queryKeys.quests.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
      // The server pays xp and coins when this lands, so the hero panel is stale until it reloads.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
  });
}
