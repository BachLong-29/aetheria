'use client';

import { useQuery } from '@tanstack/react-query';

import { financeEndpoints } from '@/services/endpoints/finance';

import { todayKey } from '../utils';

/** `includeArchived` adds the archived goals — only the Goals page, which can restore them, asks. */
export function useGoals(month: string, includeArchived = false) {
  const today = todayKey();

  return useQuery({
    queryKey: ['finance', 'goals', month, today, includeArchived],
    queryFn: async () => {
      const { data } = await financeEndpoints.listGoals(month, today, includeArchived);
      return data.data ?? [];
    },
  });
}
