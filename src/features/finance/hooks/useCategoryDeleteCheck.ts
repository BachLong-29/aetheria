'use client';

import { useQuery } from '@tanstack/react-query';

import { financeEndpoints } from '@/services/endpoints/finance';

/** Asks the API what would block deleting a category, without deleting it. */
export function useCategoryDeleteCheck(id: string | undefined) {
  return useQuery({
    queryKey: ['finance', 'categories', 'delete-check', id],
    queryFn: async () => {
      const { data } = await financeEndpoints.checkCategoryDelete(id as string);
      return data.data;
    },
    enabled: !!id,
    // Usage changes as the user works; never reuse an old answer for a delete decision.
    staleTime: 0,
    gcTime: 0,
  });
}
