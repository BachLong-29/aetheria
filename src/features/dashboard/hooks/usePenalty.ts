'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/libs/axios';
import { queryKeys } from '@/constants/query-keys';
import type { ApiResponse } from '@/types';

export interface PenaltyUnfinishedItem {
  id: string;
  title: string;
  difficulty?: string;
}

export interface PenaltyLog {
  _id: string;
  userId: string;
  tier: number;
  status: 'pending' | 'completed';
  source: 'quest' | 'task';
  triggeredDate: string;
  unfinished: PenaltyUnfinishedItem[];
}

/** Fetch the current pending penalty (null if none). */
export function usePenalty() {
  return useQuery({
    queryKey: queryKeys.penalty.active(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<PenaltyLog | null>>('/penalty');
      return data.data;
    },
  });
}

/** Create a new penalty with the list of unfinished items. */
export function useCreatePenalty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { items: PenaltyUnfinishedItem[]; source: 'quest' | 'task' }) => {
      const { data } = await apiClient.post<ApiResponse<PenaltyLog>>('/penalty', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.penalty.active() });
    },
  });
}

/** Mark the active penalty as completed. */
export function useCompletePenalty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<ApiResponse<PenaltyLog>>('/penalty/complete');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.penalty.active() });
      // The server pays xp and coins when this lands, so the hero panel is stale until it reloads.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
  });
}

/** Apply consequences and escalate penalty tier. Also invalidates profile so CharacterPanel refreshes. */
export function useFailPenalty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<ApiResponse<PenaltyLog>>('/penalty/fail');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.penalty.active() });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.me() });
    },
  });
}
