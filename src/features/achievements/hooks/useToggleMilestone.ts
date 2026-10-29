'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { goalEndpoints } from '@/services/endpoints/goals';

export function useToggleMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, milestoneId }: { goalId: string; milestoneId: string }) => {
      const { data } = await goalEndpoints.toggleMilestone(goalId, milestoneId);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      // Finishing a goal pays xp and coins on the server.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
  });
}
