'use client';

import type { AxiosError } from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/libs/axios';
import { useUIStore } from '@/stores/ui.store';
import type { ApiResponse, Category } from '@/types';

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data } = await apiClient.patch<ApiResponse<Category>>(`/categories/${id}`, { name });
      return data.data;
    },
    // A taken name comes back 409 with a message that says so; show it wherever the form is.
    onError: (err) => {
      const message = (err as AxiosError<{ message?: string }>).response?.data?.message;
      addToast({ type: 'error', message: message ?? "Couldn't save that category." });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}
