import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Task } from '@/types';

import { HABIT_COINS, HABIT_XP, SKIP_CONFIRM_STORAGE_KEY, TASK_COINS, TASK_XP } from '../constants';
import type {
  BurstPos,
  Difficulty,
  Habit,
  HabitColor,
  HabitDay,
  PendingQuest,
  Quest,
  QuestType,
} from '../types';
import { useProjects } from '@/features/projects/hooks/useProjects';

import { useHabitLogs } from './useHabitLogs';
import { useHabits } from './useHabits';
import { useQuests } from './useQuests';
import { useTaskLogs } from './useTaskLogs';
import { useTasks } from './useTasks';
import { useToggleHabitLog } from './useToggleHabitLog';
import { useToggleTaskLog } from './useToggleTaskLog';
import { useUpdateTask } from './useUpdateTask';

// Stable "no data yet" reference — see the identical fix/comment in
// useScheduleDayTasks.ts. Without it, `habitDoneMap`'s effect below (keyed on
// `habitLogs`) re-fires and calls setState on every render while the habit-logs
// query is unresolved, which is enough to trip React's "Maximum update depth
// exceeded" the moment that query stays pending/erroring across renders.
const EMPTY_ARRAY: never[] = [];

function loadSkipConfirm(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem(SKIP_CONFIRM_STORAGE_KEY);
    if (!saved) return false;
    const { date } = JSON.parse(saved) as { date: string };
    return date === new Date().toDateString();
  } catch {
    return false;
  }
}

interface Params {
  todayDateStr: string;
  todayDayStr: HabitDay;
  animationsEnabled: boolean;
  onBurst: (pos: BurstPos) => void;
}

export function useQuestOrchestration({
  todayDateStr,
  todayDayStr,
  animationsEnabled,
  onBurst,
}: Params) {
  const { data: serverQuests, isLoading: questsLoading } = useQuests();
  const { data: allTasks = EMPTY_ARRAY } = useTasks();
  const { data: projects = EMPTY_ARRAY } = useProjects('active');
  const { data: habits = EMPTY_ARRAY } = useHabits();
  const { data: habitLogs = EMPTY_ARRAY } = useHabitLogs(todayDateStr);
  const { data: apiTaskLogs = EMPTY_ARRAY } = useTaskLogs(todayDateStr);
  const { mutate: toggleHabitLog } = useToggleHabitLog();
  const { mutate: toggleTaskLog } = useToggleTaskLog();
  const { mutate: updateTask } = useUpdateTask();

  const [quests, setQuests] = useState<Quest[]>([]);
  const questsInitialized = useRef(false);
  const [habitDoneMap, setHabitDoneMap] = useState<Record<string, boolean>>({});
  const [taskDoneMap, setTaskDoneMap] = useState<Record<string, boolean>>({});
  const [pendingQuest, setPendingQuest] = useState<PendingQuest | null>(null);
  const [skipConfirm, setSkipConfirm] = useState(loadSkipConfirm);

  const taskLoggedMap = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const log of apiTaskLogs) map[log.taskId] = true;
    return map;
  }, [apiTaskLogs]);

  useEffect(() => {
    if (serverQuests && !questsInitialized.current) {
      setQuests(serverQuests as Quest[]);
      questsInitialized.current = true;
    }
  }, [serverQuests]);

  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const log of habitLogs) map[log.habitId] = log.done;
    startTransition(() => setHabitDoneMap(map));
  }, [habitLogs]);

  const projectMeta = useMemo(
    () => new Map(projects.map((p) => [p.id, { name: p.name, icon: p.icon, color: p.color }])),
    [projects],
  );

  const todayTaskQuests = useMemo<Quest[]>(() => {
    return (allTasks as Task[])
      .filter(
        (t) =>
          t.active &&
          !!t.startDate &&
          t.startDate <= todayDateStr &&
          (t.endDate ?? t.startDate) >= todayDateStr,
      )
      .map((t) => {
        const isMultiDay = !!t.endDate && !!t.startDate && t.endDate > t.startDate;
        const done = isMultiDay
          ? (taskDoneMap[t.id] ?? taskLoggedMap[t.id] ?? false)
          : (taskDoneMap[t.id] ?? t.status === 'done');
        const proj = t.projectId ? projectMeta.get(t.projectId) : undefined;
        return {
          id: `task-${t.id}`,
          title: t.name,
          desc: t.note ?? '',
          type: 'task' as QuestType,
          difficulty: 'C' as Difficulty,
          xp: TASK_XP,
          coins: TASK_COINS,
          done,
          tags: [t.tagId],
          taskId: t.id,
          habitIcon: t.icon,
          habitColor: t.color as HabitColor,
          projectId: t.projectId,
          projectName: proj?.name,
          projectIcon: proj?.icon,
          projectColor: proj?.color,
          attachments: t.attachments,
        };
      });
  }, [allTasks, todayDateStr, taskDoneMap, taskLoggedMap, projectMeta]);

  const todayHabitQuests = useMemo<Quest[]>(() => {
    return (habits as Habit[])
      .filter(
        (h) => h.active && !!todayDayStr && h.schedule.some((e) => e.days.includes(todayDayStr)),
      )
      .map((h) => ({
        id: `habit-${h.id}`,
        title: h.name,
        desc: h.note ?? h.tagId,
        type: 'habit' as QuestType,
        difficulty: 'C' as Difficulty,
        xp: HABIT_XP,
        coins: HABIT_COINS,
        done: habitDoneMap[h.id] ?? false,
        tags: [h.tagId],
        habitId: h.id,
        habitColor: h.color,
        habitIcon: h.icon,
      }));
  }, [habits, todayDayStr, habitDoneMap]);

  const allQuests = useMemo<Quest[]>(
    () => [...todayTaskQuests, ...todayHabitQuests, ...quests],
    [todayTaskQuests, todayHabitQuests, quests],
  );

  const completeQuest = useCallback(
    (quest: Quest, burstPos: BurstPos | null) => {
      setQuests((prev) => prev.map((q) => (q.id === quest.id ? { ...q, done: true } : q)));
      if (burstPos && animationsEnabled) onBurst(burstPos);
    },
    [animationsEnabled, onBurst],
  );

  const handleToggleHabit = useCallback(
    (habitId: string, burstPos: BurstPos | null) => {
      const newDone = !(habitDoneMap[habitId] ?? false);
      setHabitDoneMap((prev) => ({ ...prev, [habitId]: newDone }));
      toggleHabitLog({ habitId, date: todayDateStr, done: newDone });
      if (newDone) {
        if (burstPos && animationsEnabled) onBurst(burstPos);
      }
    },
    [habitDoneMap, toggleHabitLog, todayDateStr, animationsEnabled, onBurst],
  );

  const handleToggleTask = useCallback(
    (taskId: string, burstPos: BurstPos | null) => {
      const task = (allTasks as Task[]).find((t) => t.id === taskId);
      const isMultiDay = !!task?.endDate && !!task?.startDate && task.endDate > task.startDate;

      if (isMultiDay) {
        const nextLogged = !(taskDoneMap[taskId] ?? taskLoggedMap[taskId] ?? false);
        setTaskDoneMap((prev) => ({ ...prev, [taskId]: nextLogged }));
        toggleTaskLog({ taskId, date: todayDateStr });
        if (nextLogged && task?.status === 'todo')
          updateTask({ id: taskId, status: 'in_progress' });
        if (nextLogged) {
          if (burstPos && animationsEnabled) onBurst(burstPos);
        }
        return;
      }

      const newDone = !(taskDoneMap[taskId] ?? task?.status === 'done');
      setTaskDoneMap((prev) => ({ ...prev, [taskId]: newDone }));
      updateTask({ id: taskId, status: newDone ? 'done' : 'todo' });
      if (newDone) {
        if (burstPos && animationsEnabled) onBurst(burstPos);
      }
    },
    [
      allTasks,
      taskDoneMap,
      taskLoggedMap,
      toggleTaskLog,
      updateTask,
      todayDateStr,
      animationsEnabled,
      onBurst,
    ],
  );

  const handleToggleQuest = useCallback(
    (id: string, burstPos: BurstPos | null) => {
      if (id.startsWith('task-')) {
        handleToggleTask(id.slice('task-'.length), burstPos);
        return;
      }
      if (id.startsWith('habit-')) {
        handleToggleHabit(id.slice('habit-'.length), burstPos);
        return;
      }
      const quest = quests.find((q) => q.id === id);
      if (!quest) return;
      if (quest.done) {
        setQuests((prev) => prev.map((q) => (q.id === id ? { ...q, done: false } : q)));
        return;
      }
      if (skipConfirm) {
        completeQuest(quest, burstPos);
      } else {
        setPendingQuest({ quest, burstPos });
      }
    },
    [quests, skipConfirm, handleToggleTask, handleToggleHabit, completeQuest],
  );

  const handleConfirmQuest = useCallback(
    (skipNextPrompt: boolean) => {
      if (!pendingQuest) return;
      if (skipNextPrompt) {
        setSkipConfirm(true);
        localStorage.setItem(
          SKIP_CONFIRM_STORAGE_KEY,
          JSON.stringify({ date: new Date().toDateString() }),
        );
      }
      completeQuest(pendingQuest.quest, pendingQuest.burstPos);
      setPendingQuest(null);
    },
    [pendingQuest, completeQuest],
  );

  const handleAddQuest = useCallback((quest: Quest) => {
    setQuests((prev) => [quest, ...prev]);
  }, []);

  const handleCancelQuest = useCallback(() => setPendingQuest(null), []);

  return {
    quests,
    allQuests,
    questsLoading,
    pendingQuest,
    handleToggleQuest,
    handleConfirmQuest,
    handleAddQuest,
    handleCancelQuest,
  };
}
