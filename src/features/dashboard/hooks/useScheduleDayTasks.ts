import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import { useProjects } from '@/features/projects/hooks/useProjects';
import {
  useCreateScheduleBlock,
  useScheduleBlocks,
  useUpdateScheduleBlock,
} from '@/features/schedule/hooks/useScheduleBlocks';
import {
  habitToUITask,
  isHabitScheduledForDate,
  questToUITask,
  slotToDefaultTime,
  taskToUITask,
} from '@/features/tasks/data/adapters';
import { type UITask } from '@/features/tasks/data/mock';
import { offsetToISO, toLocalDate } from '@/features/tasks/utils/date.utils';
import type { ScheduleBlock, TaskColor, UpdateTaskPayload } from '@/types';

import { useCreateTask } from './useCreateTask';
import { useHabitLogs } from './useHabitLogs';
import { useHabitLogsRange } from './useHabitLogsRange';
import { useHabits } from './useHabits';
import { useQuests } from './useQuests';
import { useTaskLogs } from './useTaskLogs';
import { useTasks } from './useTasks';
import { useToggleHabitLog } from './useToggleHabitLog';
import { useToggleTaskLog } from './useToggleTaskLog';
import { useUpdateQuestStatus } from './useUpdateQuestStatus';
import { useUpdateTask } from './useUpdateTask';

// A stable reference for "no data yet" — the `= []` destructuring default below
// creates a brand-new array on every render while `data` is undefined (query
// loading/disabled/erroring), which makes every useMemo/useEffect keyed off it
// think its dependency changed on every render. Combined with the setTasks
// effect below (which has no other change-guard), that was enough to hit
// React's "Maximum update depth exceeded" whenever any one of these queries
// stayed unresolved. `never[]` is a safe stand-in for any `T[]` default.
const EMPTY_ARRAY: never[] = [];

interface UseScheduleDayTasksParams {
  /** Selected day, "YYYY-MM-DD". */
  date: string;
  showTasks?: boolean;
  showQuests?: boolean;
  showHabits?: boolean;
  /**
   * Which projects to resolve labels from. Dashboard only cares about active
   * campaigns; the full task page shows every project. Default `'active'`.
   */
  projectScope?: 'active' | 'all';
  /**
   * How the selected-day task list is sourced:
   *  - `'api'`   → a dedicated `useTasks(date, date)` query (default).
   *  - `'client'`→ filtered client-side from the already-loaded baseline, so
   *    navigating dates triggers no extra request.
   */
  dayTasksSource?: 'api' | 'client';
  /**
   * Keep backlog tasks (no `startDate`, parked on day 0) visible on the selected
   * day instead of replacing them. The full task page needs this so backlog stays
   * searchable; the dashboard schedule does not. Default `false`.
   */
  preserveBacklog?: boolean;
  /**
   * Only surface tasks that have a schedule *block* on the selected day. When
   * `true`, day-assigned-but-untimed tasks (startDate only, no block) are hidden
   * so the day view shows exclusively time-scheduled work. Default `false`.
   */
  requireBlock?: boolean;
  /** Invoked when {@link onEdit} is called for a habit-sourced item. */
  onEditHabit?: (task: UITask) => void;
  /**
   * Called with the reward whenever an item is ticked *done* here, so the host can credit the
   * character and show the XP toast — the same treatment completing it from the quest panel gets.
   * Ticking an item back off never takes the reward away.
   */
}

interface DayProgress {
  done: number;
  total: number;
  pct: number;
}

interface UseScheduleDayTasksResult {
  /** Full merged ledger for the loaded range (all sources). */
  tasks: UITask[];
  /** `tasks` filtered by the quests/habits display toggles. */
  visibleTasks: UITask[];
  /** Task schedule blocks for the current week — drives side-panel placement. */
  weekTaskBlocks: ScheduleBlock[];
  selectedDate: Date;
  isFetchingDayTasks: boolean;
  /** A habit→task reschedule create is in flight. */
  isRescheduling: boolean;
  /** Selected-day completion stats for the header bar. */
  progress: DayProgress;
  editingTask: UITask | null;
  isSavingEdit: boolean;
  onToggleDone: (id: string) => void;
  onCompleteTask: (id: string) => void;
  onMoveToSlot: (id: string, slot: UITask['slot'], day?: number) => void;
  onRescheduleHabit: (habitTask: UITask, newTime: string) => void;
  onEdit: (task: UITask) => void;
  onSaveEdit: (id: string, payload: UpdateTaskPayload, onSuccess: () => void) => void;
  onCloseEdit: () => void;
  /** Optimistically prepend a locally-created item (e.g. a forged quest). */
  prependTask: (task: UITask) => void;
}

/**
 * Data + mutation layer for the schedule day view: fetches tasks / quests /
 * habits / blocks for the current week and selected day, merges them into a
 * single {@link UITask} ledger, keeps a local working copy for optimistic
 * edits, and exposes the handlers that drive the day grid.
 */
export function useScheduleDayTasks({
  date,
  showTasks = true,
  showQuests = true,
  showHabits = true,
  projectScope = 'active',
  dayTasksSource = 'api',
  preserveBacklog = false,
  requireBlock = false,
  onEditHabit,
}: UseScheduleDayTasksParams): UseScheduleDayTasksResult {
  const todayStr = toLocalDate(new Date());

  // ── Controlled date ────────────────────────────────────────────────────────
  const selectedDate = useMemo(() => new Date(date + 'T12:00:00'), [date]);
  const selectedDateStr = date;
  const selectedOffset = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86_400_000);
  }, [selectedDate]);

  // ── Current week range (Mon–Sun) for habit log cache ──────────────────────
  const currentWeekStart = useMemo(() => {
    const today = new Date();
    const monBased = (today.getDay() + 6) % 7;
    const d = new Date(today);
    d.setDate(today.getDate() - monBased);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const logRangeFrom = useMemo(() => toLocalDate(currentWeekStart), [currentWeekStart]);
  const logRangeTo = useMemo(() => {
    const d = new Date(currentWeekStart);
    d.setDate(currentWeekStart.getDate() + 6);
    return toLocalDate(d);
  }, [currentWeekStart]);

  // ── API data ───────────────────────────────────────────────────────────────
  const { data: apiTasks = EMPTY_ARRAY } = useTasks();
  // Quests are due-dated, so fetch the selected day's — the default (no args) only ever
  // returns today's, which left other days quest-less.
  const { data: apiQuestsRaw = EMPTY_ARRAY } = useQuests(selectedDateStr, selectedDateStr);
  const { data: apiProjects = EMPTY_ARRAY } = useProjects(
    projectScope === 'all' ? undefined : projectScope,
  );
  const { data: apiHabits = EMPTY_ARRAY } = useHabits();
  const { data: apiTaskLogs = EMPTY_ARRAY } = useTaskLogs(todayStr);
  const { data: weekHabitLogs = EMPTY_ARRAY } = useHabitLogsRange(logRangeFrom, logRangeTo);

  // Selected-day task list. In 'api' mode a dedicated query fetches it; in
  // 'client' mode we derive it from the already-loaded baseline (no extra call).
  const useApiDay = dayTasksSource === 'api';
  const { data: apiDayTasks = EMPTY_ARRAY, isFetching } = useTasks(
    selectedDateStr,
    selectedDateStr,
    { enabled: useApiDay },
  );
  const clientDayTasks = useMemo(
    () =>
      apiTasks.filter((t) => {
        // Backlog (no startDate) isn't tied to any day → excluded from placement.
        if (!t.startDate) return false;
        const end = t.endDate ?? t.startDate;
        return selectedDateStr >= t.startDate && selectedDateStr <= end;
      }),
    [apiTasks, selectedDateStr],
  );
  const apiTasksForDay = useApiDay ? apiDayTasks : clientDayTasks;
  const isFetchingDayTasks = useApiDay ? isFetching : false;

  const { data: apiTaskLogsForDay = EMPTY_ARRAY } = useTaskLogs(selectedDateStr);
  const { data: apiHabitLogsForDay = EMPTY_ARRAY } = useHabitLogs(selectedDateStr);

  const { data: weekTaskBlocks = EMPTY_ARRAY } = useScheduleBlocks({
    from: logRangeFrom,
    to: logRangeTo,
    sourceType: 'task',
  });
  const { data: dayTaskBlocks = EMPTY_ARRAY } = useScheduleBlocks({
    from: selectedDateStr,
    to: selectedDateStr,
    sourceType: 'task',
  });

  const blockMap = useMemo(() => {
    const m = new Map<string, ScheduleBlock>();
    for (const b of [...weekTaskBlocks, ...dayTaskBlocks]) {
      const key = `${b.sourceId}|${b.date}`;
      const cur = m.get(key);
      if (!cur || b.startTime < cur.startTime) m.set(key, b);
    }
    return m;
  }, [weekTaskBlocks, dayTaskBlocks]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateTask = useUpdateTask();
  const updateQuestStatus = useUpdateQuestStatus();
  const toggleHabitLog = useToggleHabitLog();
  const toggleTaskLog = useToggleTaskLog();
  const createTask = useCreateTask();
  const createBlock = useCreateScheduleBlock();
  const updateBlock = useUpdateScheduleBlock();

  // ── Project metadata ───────────────────────────────────────────────────────
  const projectMeta = useMemo(
    () => new Map(apiProjects.map((p) => [p.id, { name: p.name, icon: p.icon, color: p.color }])),
    [apiProjects],
  );

  const withProject = useMemo(
    () =>
      (ui: UITask): UITask => {
        const meta = ui.projectId ? projectMeta.get(ui.projectId) : undefined;
        if (!meta) return ui;
        return { ...ui, projectName: meta.name, projectIcon: meta.icon, projectColor: meta.color };
      },
    [projectMeta],
  );

  // ── Cancelled habit ID sets ────────────────────────────────────────────────
  const cancelledHabitIds = useMemo(
    () =>
      new Set(
        apiTasks.flatMap((t) => (t.habitRef && t.startDate === todayStr ? [t.habitRef] : [])),
      ),
    [apiTasks, todayStr],
  );

  const cancelledHabitIdsForDay = useMemo(
    () =>
      new Set(
        apiTasks.flatMap((t) =>
          t.habitRef && t.startDate === selectedDateStr ? [t.habitRef] : [],
        ),
      ),
    [apiTasks, selectedDateStr],
  );

  // ── Merge API → UITask[] ───────────────────────────────────────────────────
  const apiMerged = useMemo<UITask[]>(() => {
    const tasks = apiTasks.map((t) => {
      const log = apiTaskLogs.find((l) => l.taskId === t.id);
      const blockTime = blockMap.get(`${t.id}|${t.startDate}`)?.startTime;
      return withProject(taskToUITask(t, log, blockTime));
    });
    const quests = apiQuestsRaw.map((q) => questToUITask(q));
    const habits = apiHabits
      .filter((h) => h.active)
      .flatMap((h) =>
        Array.from({ length: 7 }, (_, i) => {
          const d = new Date(currentWeekStart);
          d.setDate(currentWeekStart.getDate() + i);
          if (!isHabitScheduledForDate(h, d)) return null;
          const ds = toLocalDate(d);
          const log = weekHabitLogs.find(
            (l) => l.habitId === h.id && toLocalDate(new Date(l.date)) === ds,
          );
          const cancelled = ds === todayStr && cancelledHabitIds.has(h.id);
          const ui = habitToUITask(h, log, cancelled, d);
          return { ...ui, id: `habit-${h.id}-${ds}` };
        }).filter((x): x is UITask => x !== null),
      );
    return [...tasks, ...quests, ...habits];
  }, [
    apiTasks,
    apiTaskLogs,
    apiQuestsRaw,
    apiHabits,
    weekHabitLogs,
    cancelledHabitIds,
    currentWeekStart,
    todayStr,
    withProject,
    blockMap,
  ]);

  // ── Local tasks state ──────────────────────────────────────────────────────
  const apiLoadedRef = useRef(false);
  const [tasks, setTasks] = useState<UITask[]>(() => []);

  /**
   * Ticks the user has made that the server has not confirmed yet.
   *
   * The merge effect below rebuilds `tasks` from the query caches, and one of
   * its dependencies is `isFetchingDayTasks` — which flips the moment a
   * mutation invalidates. So the rebuild runs *while* the caches still hold
   * pre-tick data, wiping the optimistic value, and only the refetch landing
   * afterwards puts it back: checked, unchecked, checked.
   *
   * Holding the intent here lets every rebuild re-apply it until the server
   * agrees, so the box never travels backwards.
   */
  const pendingDoneRef = useRef(new Map<string, boolean>());

  useEffect(() => {
    if (apiMerged.length === 0) return;

    // Earliest task block per task on the selected day — drives placement + time.
    const dayBlockByTask = new Map<string, ScheduleBlock>();
    for (const b of dayTaskBlocks) {
      const cur = dayBlockByTask.get(b.sourceId);
      if (!cur || b.startTime < cur.startTime) dayBlockByTask.set(b.sourceId, b);
    }
    // Task ids with a known block anywhere in the loaded range (week + day).
    // A scheduled single-day task lives on its block's day, not its startDate.
    const taskIdsWithBlock = new Set<string>([
      ...weekTaskBlocks.map((b) => b.sourceId),
      ...dayTaskBlocks.map((b) => b.sourceId),
    ]);

    // 1. Span-based items: tasks shown by their date range rather than a specific
    //    session block. A task spans only when it has NO scheduled block at all —
    //    single-day tasks fall back to their startDate, multi-day tasks fall back
    //    to their full range. Once a task has sessions, it appears solely on the
    //    days those sessions land on (handled by blockItems below), so an in-range
    //    day with no session no longer shows the task.
    const spanItems: UITask[] =
      isFetchingDayTasks || requireBlock
        ? []
        : apiTasksForDay
            .filter((t) => !taskIdsWithBlock.has(t.id))
            .map((t) => {
              const log = apiTaskLogsForDay.find((l) => l.taskId === t.id);
              const blockTime = blockMap.get(`${t.id}|${selectedDateStr}`)?.startTime;
              const ui = taskToUITask(t, log, blockTime);
              const done = ui.isMultiDay ? !!log || t.status === 'done' : t.status === 'done';
              return withProject({ ...ui, day: selectedOffset, done });
            });

    // 2. Block-scheduled items: any task with a block on the selected day, placed
    //    at the block's time — even when its startDate is a different day.
    const placedIds = new Set(spanItems.map((u) => u.sourceId));
    const blockItems: UITask[] = [...dayBlockByTask.values()].flatMap((b) => {
      if (placedIds.has(b.sourceId)) return [];
      const t = apiTasks.find((x) => x.id === b.sourceId);
      if (!t) return [];
      const log = apiTaskLogsForDay.find((l) => l.taskId === t.id);
      const ui = taskToUITask(t, log, b.startTime);
      const done = ui.isMultiDay ? !!log || t.status === 'done' : t.status === 'done';
      return [withProject({ ...ui, day: selectedOffset, startTime: b.startTime, done })];
    });

    const dayTaskItems: UITask[] = [...spanItems, ...blockItems];

    const isViewingToday = selectedOffset === 0;
    const habitItemsForDay: UITask[] = isViewingToday
      ? []
      : apiHabits
          .filter((h) => h.active && isHabitScheduledForDate(h, selectedDate))
          .map((h) => {
            const log = apiHabitLogsForDay.find((l) => l.habitId === h.id);
            const cancelled = cancelledHabitIdsForDay.has(h.id);
            return habitToUITask(h, log, cancelled, selectedDate);
          });

    // Always source the selected day's task items from the block-aware
    // dayTaskItems. The raw apiMerged ledger is date-range based (multi-day
    // active tasks are clamped to day 0), so falling back to it would bypass
    // the requireBlock filtering and leak dated-but-unplanned tasks onto the
    // selected day. When the day has no items, the filtered base already
    // removes them and dayTaskItems/habitItemsForDay are empty.
    const merged = [
      ...apiMerged.filter((t) => {
        // Replace day-placed tasks for this day. When preserveBacklog is set,
        // backlog items (no startDate) are kept so they stay searchable.
        if (t.source === 'task' && t.day === selectedOffset && (!preserveBacklog || !!t.startDate))
          return false;
        if (!isViewingToday && t.source === 'habit') return false;
        return true;
      }),
      ...dayTaskItems,
      ...habitItemsForDay,
    ];

    // Re-apply any tick the server has not caught up with, and drop the ones
    // it has — an entry that matches is no longer doing any work.
    const pending = pendingDoneRef.current;
    const settled =
      pending.size === 0
        ? merged
        : merged.map((t) => {
            const want = pending.get(t.id);
            if (want === undefined) return t;
            if (t.done === want) {
              pending.delete(t.id);
              return t;
            }
            return { ...t, done: want, progress: want ? 1 : t.progress };
          });

    startTransition(() => setTasks(settled));
    apiLoadedRef.current = true;
  }, [
    apiMerged,
    apiTasks,
    apiTasksForDay,
    apiTaskLogsForDay,
    isFetchingDayTasks,
    apiHabits,
    apiHabitLogsForDay,
    cancelledHabitIdsForDay,
    selectedDate,
    selectedDateStr,
    selectedOffset,
    withProject,
    blockMap,
    dayTaskBlocks,
    weekTaskBlocks,
    preserveBacklog,
    requireBlock,
  ]);

  // ── Editing flow ───────────────────────────────────────────────────────────
  const [editingTask, setEditingTask] = useState<UITask | null>(null);

  /** Optimistically prepend a locally-created item (e.g. a forged quest). */
  function prependTask(task: UITask) {
    setTasks((ts) => [task, ...ts]);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function onToggleDone(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    if (task.isMultiDay && task.source === 'task' && task.sourceId) {
      const nextLogged = !task.loggedToday;
      setTasks((ts) =>
        ts.map((t) => (t.id === id ? { ...t, loggedToday: nextLogged, done: nextLogged } : t)),
      );
      pendingDoneRef.current.set(id, nextLogged);
      toggleTaskLog.mutate(
        { taskId: task.sourceId, date: selectedDateStr },
        // A failed write must be allowed to show through on the next rebuild.
        { onError: () => pendingDoneRef.current.delete(id) },
      );
      if (nextLogged && task.status === 'todo') {
        updateTask.mutate({ id: task.sourceId, status: 'in_progress' });
      }
      return;
    }

    const nextDone = !task.done;
    setTasks((ts) =>
      ts.map((t) =>
        t.id === id ? { ...t, done: nextDone, progress: nextDone ? 1 : t.progress } : t,
      ),
    );
    pendingDoneRef.current.set(id, nextDone);
    const forgetPending = { onError: () => pendingDoneRef.current.delete(id) };

    if (task.source === 'quest' && task.sourceId) {
      updateQuestStatus.mutate({ id: task.sourceId, done: nextDone }, forgetPending);
    } else if (task.source === 'task' && task.sourceId) {
      updateTask.mutate({ id: task.sourceId, status: nextDone ? 'done' : 'todo' }, forgetPending);
    } else if (task.source === 'habit' && task.sourceId) {
      const habitDate = offsetToISO(task.day);
      toggleHabitLog.mutate(
        { habitId: task.sourceId, date: habitDate, done: nextDone },
        forgetPending,
      );
    }
  }

  function onCompleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task?.sourceId) return;
    setTasks((ts) =>
      ts.map((t) => (t.id === id ? { ...t, done: true, progress: 1, status: 'done' } : t)),
    );
    pendingDoneRef.current.set(id, true);
    updateTask.mutate(
      { id: task.sourceId, status: 'done' },
      { onError: () => pendingDoneRef.current.delete(id) },
    );
  }

  function onMoveToSlot(id: string, slot: UITask['slot'], day = 0) {
    const newStartTime = slotToDefaultTime(slot);
    setTasks((ts) =>
      ts.map((t) => (t.id === id ? { ...t, slot, day, startTime: newStartTime } : t)),
    );
    const task = tasks.find((t) => t.id === id);
    if (task?.source === 'task' && task.sourceId) {
      const targetDate = offsetToISO(day);
      const existing = blockMap.get(`${task.sourceId}|${targetDate}`);
      if (existing) {
        updateBlock.mutate({ id: existing.id, startTime: newStartTime });
      } else {
        createBlock.mutate({
          sourceType: 'task',
          sourceId: task.sourceId,
          date: targetDate,
          startTime: newStartTime,
          duration: task.est ?? 60,
        });
      }
    }
  }

  function onRescheduleHabit(habitTask: UITask, newTime: string) {
    if (!habitTask.sourceId) return;
    const hour = parseInt(newTime.split(':')[0] ?? '0', 10);
    const slot: UITask['slot'] =
      hour < 10 ? 'morning' : hour < 13 ? 'deep' : hour < 17 ? 'afternoon' : 'evening';

    const tempId = `reschedule-${habitTask.sourceId}-${Date.now()}`;
    const newTask: UITask = {
      ...habitTask,
      id: tempId,
      sourceId: tempId,
      source: 'task',
      slot,
      startTime: newTime,
      habitRef: habitTask.sourceId,
      cancelled: false,
      done: false,
      deadline: `Today · ${newTime}`,
    };
    setTasks((ts) => [
      ...ts.map((t) => (t.id === habitTask.id ? { ...t, cancelled: true } : t)),
      newTask,
    ]);
    createTask.mutate(
      {
        name: habitTask.title.replace(/^\S+\s+/, ''),
        icon: habitTask.icon ?? '◉',
        color: (habitTask.color ?? 'gold') as TaskColor,
        tagId: habitTask.tagId ?? 'habit',
        startDate: todayStr,
        duration: habitTask.est,
        habitRef: habitTask.sourceId,
      },
      {
        onSuccess: (created) => {
          if (created?.id) {
            createBlock.mutate({
              sourceType: 'task',
              sourceId: created.id,
              date: todayStr,
              startTime: newTime,
              duration: habitTask.est ?? 30,
            });
          }
        },
        onError: () => {
          setTasks((ts) => [
            ...ts.filter((t) => t.id !== tempId),
            ...ts.map((t) => (t.id === habitTask.id ? { ...t, cancelled: false } : t)),
          ]);
        },
      },
    );
  }

  function onEdit(task: UITask) {
    if (task.source === 'habit') {
      onEditHabit?.(task);
      return;
    }
    if (task.source !== 'task') return;
    setEditingTask(task);
  }

  function onSaveEdit(id: string, payload: UpdateTaskPayload, onSuccess: () => void) {
    updateTask.mutate(
      { id, ...payload },
      {
        onSuccess: () => {
          setEditingTask(null);
          onSuccess();
        },
      },
    );
  }

  // ── Derived: visible list + selected-day progress ──────────────────────────
  const visibleTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.source === 'task' && !showTasks) return false;
        if (t.source === 'quest' && !showQuests) return false;
        if (t.source === 'habit' && !showHabits) return false;
        return true;
      }),
    [tasks, showTasks, showQuests, showHabits],
  );

  // Progress counts the selected day's visible items (tasks + quests + habits),
  // mirroring the day-view ledger so the header and grid never disagree.
  const progress = useMemo<DayProgress>(() => {
    const dayItems = visibleTasks.filter((t) => t.day === selectedOffset);
    const done = dayItems.filter((t) => t.done).length;
    const total = dayItems.length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [visibleTasks, selectedOffset]);

  return {
    tasks,
    visibleTasks,
    weekTaskBlocks,
    selectedDate,
    isFetchingDayTasks,
    isRescheduling: createTask.isPending,
    progress,
    editingTask,
    isSavingEdit: updateTask.isPending,
    onToggleDone,
    onCompleteTask,
    onMoveToSlot,
    onRescheduleHabit,
    onEdit,
    onSaveEdit,
    onCloseEdit: () => setEditingTask(null),
    prependTask,
  };
}
