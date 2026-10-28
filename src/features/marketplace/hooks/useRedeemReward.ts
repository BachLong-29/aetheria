'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/libs/axios';
import type { ApiResponse, RedeemResult } from '@/types';

export function useRedeemReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rewardId: string) => {
      const { data } = await apiClient.post<ApiResponse<RedeemResult>>(
        `/rewards/${rewardId}/redeem`,
      );
      return data.data;
    },
    // Stock changed and the balance moved, so the list and the profile are both stale.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
