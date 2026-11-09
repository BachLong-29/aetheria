'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/libs/axios';
import type { ApiResponse, Task, TaskPageMeta, TaskStatus } from '@/types';

interface UseTasksPagedParams {
  offset: number;
  limit: number;
  /** Search by name (case-insensitive). */
  q?: string;
  /** Filter to a single category. */
  tagId?: string;
  /** Filter to one status. */
  status?: TaskStatus;
  /** Server-side order; omit for start date. */
  sort?: 'startDate' | 'name';
}

interface TasksPage {
  tasks: Task[];
  meta: TaskPageMeta | undefined;
}

/** Paginated task list — `GET /api/v1/tasks?offset=&limit=&q=&tagId=&status=&sort=`. */
export function useTasksPaged({ offset, limit, q, tagId, status, sort }: UseTasksPagedParams) {
  const params = new URLSearchParams();
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  if (q) params.set('q', q);
  if (tagId) params.set('tagId', tagId);
  if (status) params.set('status', status);
  if (sort) params.set('sort', sort);

  return useQuery({
    queryKey: ['tasks', 'paged', offset, limit, q, tagId, status, sort],
    queryFn: async (): Promise<TasksPage> => {
      const { data } = await apiClient.get<ApiResponse<Task[]>>(`/tasks?${params.toString()}`);
      return { tasks: data.data ?? [], meta: data.meta as TaskPageMeta | undefined };
    },
    placeholderData: (prev) => prev,
  });
}
