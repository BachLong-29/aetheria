import type { PaginationMeta } from './api';
import type { TaskProgress } from './schedule-block';

export type TaskStatus = 'todo' | 'in_progress' | 'pending' | 'waiting' | 'done';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'todo',
  'in_progress',
  'pending',
  'waiting',
  'done',
];
export type TaskColor = 'gold' | 'mint' | 'violet' | 'cyan' | 'rose' | 'amber' | 'blue';

export interface Task {
  id: string;
  userId: string;
  name: string;
  note?: string;
  tagId: string;
  color: TaskColor;
  icon: string;
  status: TaskStatus;
  /** Estimated duration in minutes */
  duration?: number;
  /** Optional — omit for floating/backlog tasks with no scheduled date */
  startDate?: string;
  /** Optional — omit for open-ended / point-in-time tasks */
  endDate?: string;
  /** Habit ID this task replaces for the startDate day */
  habitRef?: string;
  /** Project ID this task belongs to — omitted for standalone tasks */
  projectId?: string;
  /** Reason the task was deferred to a later date */
  deferReason?: string;
  attachments: string[];
  dependencies: string[];
  active: boolean;
  /** Derived from schedule blocks — present in list responses, omitted otherwise */
  progress?: TaskProgress;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload {
  name: string;
  note?: string;
  tagId: string;
  color: TaskColor;
  icon: string;
  /** Estimated duration in minutes */
  duration?: number;
  /** Optional — omit to create a floating/backlog task with no scheduled date */
  startDate?: string;
  /** Defaults to startDate when omitted */
  endDate?: string;
  /** Habit ObjectId this task is replacing */
  habitRef?: string;
  /** Project ObjectId this task belongs to */
  projectId?: string;
  dependencies?: string[];
  attachments?: string[];
}

export interface UpdateTaskPayload {
  name?: string;
  note?: string;
  tagId?: string;
  color?: TaskColor;
  icon?: string;
  status?: TaskStatus;
  /** null to remove the duration */
  duration?: number | null;
  /** null to remove the scheduled date and make the task a floating/backlog item */
  startDate?: string | null;
  endDate?: string | null;
  /** null to clear the defer reason */
  deferReason?: string | null;
  /** Project ObjectId — null to detach the task from its project */
  projectId?: string | null;
  dependencies?: string[];
  active?: boolean;
  attachments?: string[];
}

/** Page meta of `GET /tasks?offset=` — counts ignore the `status` filter so every chip stays accurate. */
export interface TaskPageMeta extends PaginationMeta {
  statusCounts: Record<TaskStatus, number>;
}
