'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import { Icon } from '@/components/common/Icon';
import { cn } from '@/libs/utils';

import { HABIT_COLORS } from '../../constants';
import { useDeleteQuest } from '../../hooks/useDeleteQuest';
import { useDeleteTask } from '../../hooks/useDeleteTask';
import { useHabitLogs } from '../../hooks/useHabitLogs';
import { useHabits } from '../../hooks/useHabits';
import { useMoveQuest } from '../../hooks/useMoveQuest';
import { useQuests } from '../../hooks/useQuests';
import { useTasks } from '../../hooks/useTasks';
import { useUpdateHabit } from '../../hooks/useUpdateHabit';
import { useUpdateTask } from '../../hooks/useUpdateTask';
import type { CenterTab, Habit, HabitColor, Quest, Task, TaskColor } from '../../types';
import type { ScheduleDisplayOptions } from '../../hooks/useScheduleState';
import { Button } from '@/components/ui/Button';
import { Modal, ModalBody, ModalFoot, ModalHead } from '@/components/ui/Modal';
import { AddTaskModal } from '@/features/tasks/components/shared/AddTaskModal';
import { EditTaskModal } from '@/features/tasks/components/shared/EditTaskModal';

import { DayActionMenu } from './DayActionMenu';
import { OccurrenceModal } from '@/features/events/components/OccurrenceModal';
import { TaskPickerModal } from './TaskPickerModal';
import { SessionPlanner, type PlannerTask } from '@/features/schedule/components/SessionPlanner';
import {
  SessionUpdatePrompt,
  type SessionUpdateTarget,
} from '@/features/tasks/components/shared/SessionUpdatePrompt';
import { taskToUITask } from '@/features/tasks/data/adapters';
import { parseLocalDate, todayISO } from '@/features/tasks/utils/date.utils';
import type { ScheduleBlock, Task as CoreTask } from '@/types';
import { useProfile } from '@/features/profile/hooks/useProfile';
import { useScheduleBlocks } from '@/features/schedule/hooks/useScheduleBlocks';
import { EventFlame } from '@/features/events/components/EventFlame';
import { useEventOccurrences, useOverrideEvent } from '@/features/events/hooks/useEvents';
import { isEventLive, LIVE_TICK_MS } from '@/features/events/utils/live';
import type { EventOccurrence } from '@/types';

interface WeekViewProps {
  weekStart: string;
  display: ScheduleDisplayOptions;
  onWeekChange: (weekStart: string) => void;
  onNavigateDay: (date: string) => void;
  onNavigateTab?: (tab: CenterTab) => void;
}

type ActiveDrag =
  | { type: 'task'; item: Task; color: string; dayStr: string }
  | { type: 'quest'; item: Quest; dayStr: string }
  | { type: 'habit'; item: Habit; color: string; dayStr: string };

type DayItem =
  | {
      kind: 'task';
      item: Task;
      time?: string;
      color: string;
      /** Present only for block-scheduled tasks; span tasks have no session. */
      plannedMinutes?: number;
      /** Present only for block-scheduled tasks. */
      blockId?: string;
    }
  | { kind: 'quest'; item: Quest; time?: string }
  | { kind: 'habit'; item: Habit; time?: string; color: string }
  | { kind: 'event'; item: EventOccurrence; time?: string; color: string };

// UTC-based so the result never drifts by a day in negative-UTC timezones.
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().substring(0, 10);
}

function getWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

function dayDiff(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

function formatUsageHours(minutes: number): string {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function WeekView({
  weekStart,
  display,
  onWeekChange,
  onNavigateDay,
  onNavigateTab,
}: WeekViewProps) {
  const weekEnd = addDays(weekStart, 6);
  const todayStr = todayISO();

  const { data: allTasks = [], isLoading } = useTasks(weekStart, weekEnd);
  const { data: weekTaskBlocks = [], isLoading: isLoadingBlocks } = useScheduleBlocks({
    from: weekStart,
    to: weekEnd,
    sourceType: 'task',
  });
  const { data: weekQuests = [] } = useQuests(weekStart, weekEnd);
  const { data: weekEvents = [] } = useEventOccurrences(weekStart, weekEnd);

  // Only an event that is under way wears the artwork, so the grid needs a
  // clock. Coarse on purpose: this re-renders the whole week.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), LIVE_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const { mutate: overrideEvent } = useOverrideEvent();
  const { mutate: updateTask } = useUpdateTask();
  const { mutate: deleteTask } = useDeleteTask();
  const { mutate: deleteQuest, isPending: deletingQuestPending } = useDeleteQuest();
  const { mutate: moveQuest } = useMoveQuest();
  const { data: habits = [] } = useHabits();
  const { data: todayHabitLogs = [] } = useHabitLogs(todayStr);
  const { mutate: updateHabit } = useUpdateHabit();
  const { data: profileData } = useProfile();

  const [editing, setEditing] = useState<Task | undefined>(undefined);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForDay, setAddForDay] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [deletingTask, setDeletingTask] = useState<Task | undefined>(undefined);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<EventOccurrence | null>(null);
  const [deletingQuest, setDeletingQuest] = useState<Quest | null>(null);
  const [sessionPrompt, setSessionPrompt] = useState<SessionUpdateTarget | null>(null);
  const [plannerTask, setPlannerTask] = useState<PlannerTask | null>(null);
  const tDash = useTranslations('dashboard');
  const tCommon = useTranslations('common');

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const doneMap = useMemo<Record<string, boolean>>(
    () => Object.fromEntries((allTasks as Task[]).map((t) => [t.id, t.status === 'done'])),
    [allTasks],
  );

  const habitLogMap = useMemo<Record<string, boolean>>(
    () => Object.fromEntries(todayHabitLogs.map((l) => [l.habitId, l.done])),
    [todayHabitLogs],
  );

  // Group week quests by dueDate (YYYY-MM-DD)
  const questsByDate = useMemo<Record<string, Quest[]>>(() => {
    const map: Record<string, Quest[]> = {};
    for (const q of weekQuests as Quest[]) {
      const date = q.dueDate?.substring(0, 10);
      if (!date) continue;
      (map[date] ??= []).push(q);
    }
    return map;
  }, [weekQuests]);

  const eventsByDate = useMemo<Record<string, EventOccurrence[]>>(() => {
    const map: Record<string, EventOccurrence[]> = {};
    for (const occ of weekEvents) (map[occ.date] ??= []).push(occ);
    return map;
  }, [weekEvents]);

  const weekDays = getWeekDays(weekStart);
  const dailyWorkingHoursMinutes = profileData?.settings.dailyCapacityMinutes ?? 600;
  const taskMap = useMemo(
    () => new Map((allTasks as Task[]).map((task) => [task.id, task])),
    [allTasks],
  );

  function getTaskBlocksForDay(dateStr: string): Array<{
    task: Task;
    block: ScheduleBlock;
    color: string;
  }> {
    return weekTaskBlocks
      .filter((block) => block.date === dateStr && block.duration > 0)
      .map((block) => {
        const task = taskMap.get(block.sourceId);
        if (!task || !task.active) return null;
        return {
          task,
          block,
          color: HABIT_COLORS[task.color as TaskColor]?.value ?? 'var(--gold)',
        };
      })
      .filter(
        (entry): entry is { task: Task; block: ScheduleBlock; color: string } => entry !== null,
      )
      .sort((a, b) => a.block.startTime.localeCompare(b.block.startTime));
  }

  function getTaskUsageForDay(blocks: ScheduleBlock[]): number {
    return blocks.reduce((sum, block) => sum + block.duration, 0);
  }

  // Tasks that have at least one session block this week are placed by their
  // block(s); everything else falls back to spanning its [startDate, endDate]
  // range so multi-day (and un-timed single-day) tasks still show and drag.
  const taskIdsWithBlock = useMemo(
    () => new Set(weekTaskBlocks.map((block) => block.sourceId)),
    [weekTaskBlocks],
  );

  function getSpanTasksForDay(dateStr: string): Task[] {
    return (allTasks as Task[]).filter(
      (t) =>
        t.active &&
        !taskIdsWithBlock.has(t.id) &&
        !!t.startDate &&
        t.startDate <= dateStr &&
        (t.endDate ?? t.startDate) >= dateStr,
    );
  }

  function getVisibleTaskIdsForDay(dateStr: string): Set<string> {
    return new Set([
      ...getTaskBlocksForDay(dateStr).map((entry) => entry.task.id),
      ...getSpanTasksForDay(dateStr).map((task) => task.id),
    ]);
  }

  const DOW_TO_HABIT_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

  function getHabitsForDay(dateStr: string): Habit[] {
    const dow = new Date(dateStr).getDay();
    const dayStr = DOW_TO_HABIT_DAY[dow];
    if (!dayStr) return [];
    return (habits as Habit[]).filter(
      (h) => h.active && h.schedule.some((e) => e.days.includes(dayStr)),
    );
  }

  function isBlocked(task: Task): boolean {
    if (task.status !== 'todo') return false;
    return task.dependencies.some((depId) => !doneMap[depId]);
  }

  function handleEdit(task: Task) {
    setEditing(task);
    setShowEditModal(true);
  }

  function handleAddForDay(dayStr: string) {
    setEditing(undefined);
    setAddForDay(dayStr);
    setShowAddModal(true);
  }

  function handleDeleteConfirm() {
    if (!deletingTask) return;
    deleteTask(deletingTask.id);
    setDeletingTask(undefined);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(event.active.data.current as ActiveDrag);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const drag = active.data.current as ActiveDrag;
    const targetDay = over.id as string;
    if (drag.dayStr === targetDay) return;

    if (drag.type === 'task') {
      const task = drag.item;
      const diff = dayDiff(drag.dayStr, targetDay);
      const newStartDate = addDays(task.startDate, diff);
      const newEndDate = task.endDate ? addDays(task.endDate, diff) : undefined;

      // Captured before the write: the ids do not change, and after the
      // mutation invalidates, this list is briefly refetching.
      const blockIds = weekTaskBlocks.filter((b) => b.sourceId === task.id).map((b) => b.id);

      updateTask(
        { id: task.id, startDate: newStartDate, endDate: newEndDate },
        {
          onSuccess: () => {
            // Sessions stay on the day they were booked, so a task dragged away
            // from them needs the same prompt the edit modal gives.
            if (blockIds.length === 0) return;
            setSessionPrompt({
              blockIds,
              dateMoved: true,
              plannerData: {
                id: task.id,
                name: task.name,
                icon: task.icon,
                color: task.color,
                duration: task.duration,
                startDate: newStartDate,
                endDate: newEndDate,
              },
            });
          },
        },
      );
    } else if (drag.type === 'quest') {
      moveQuest({ id: drag.item.id, dueDate: targetDay });
    } else if (drag.type === 'habit') {
      const sourceDow = new Date(drag.dayStr).getDay();
      const targetDow = new Date(targetDay).getDay();
      if (sourceDow === targetDow) return;

      const sourceDay = DOW_TO_HABIT_DAY[sourceDow];
      const targetDayStr = DOW_TO_HABIT_DAY[targetDow];
      if (!sourceDay || !targetDayStr) return;

      // Find the schedule entry that owns sourceDay and move it to targetDay
      const habit = drag.item as Habit;
      const sourceEntry = habit.schedule.find((e) => e.days.includes(sourceDay));
      if (!sourceEntry) return;

      const newSchedule = habit.schedule
        .map((e) => {
          if (e === sourceEntry) {
            // Remove sourceDay, add targetDay (no duplicates)
            const newDays = e.days.filter((d) => d !== sourceDay);
            if (!newDays.includes(targetDayStr)) newDays.push(targetDayStr);
            return { ...e, days: newDays };
          }
          // Remove targetDay from any other entry (day can only live in one slot)
          return { ...e, days: e.days.filter((d) => d !== targetDayStr) };
        })
        .filter((e) => e.days.length > 0);

      updateHabit({ id: drag.item.id, schedule: newSchedule });
    }
  }

  return (
    <div className={outerWrap}>
      {/* Week navigation */}
      <div className={navRow}>
        <button
          type="button"
          className={navBtn}
          onClick={() => onWeekChange(addDays(weekStart, -7))}
        >
          <Icon icon="ArrowLeft" className="text-[14px]" />
        </button>
        <span className={navLabel}>{formatWeekRange(weekStart)}</span>
        <button
          type="button"
          className={navBtn}
          onClick={() => onWeekChange(addDays(weekStart, 7))}
        >
          <Icon icon="ArrowRight" className="text-[14px]" />
        </button>
      </div>

      {/* 7-column grid */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={gridWrap}>
          {isLoading || isLoadingBlocks ? (
            <div className={loadingMsg}>Loading...</div>
          ) : (
            weekDays.map((dayStr, i) => {
              const dayTaskEntries = display.showTasks ? getTaskBlocksForDay(dayStr) : [];
              // Hiding events takes their hours out of the meter too — a total
              // the column cannot account for is worse than no total. Same for
              // tasks above: the meter counts what the column actually shows.
              const dayEvents = display.showEvents ? (eventsByDate[dayStr] ?? []) : [];
              // Events are not tasks, but a busy one still spends the day.
              const taskUsageMinutes =
                getTaskUsageForDay(dayTaskEntries.map((entry) => entry.block)) +
                dayEvents.reduce((sum, e) => sum + (e.busy && !e.allDay ? e.duration : 0), 0);
              const isToday = dayStr === todayStr;
              const dayNum = new Date(dayStr).getDate();

              return (
                <DroppableDay key={dayStr} id={dayStr} isToday={isToday}>
                  {/* Day header */}
                  <div className={dayHeader}>
                    <div className={dayHeaderMain}>
                      <button
                        type="button"
                        className={cn(dayLabel, isToday && dayLabelToday)}
                        onClick={() => onNavigateDay(dayStr)}
                        title={`Go to ${dayStr}`}
                      >
                        <span>{DAY_SHORT[i]}</span>
                        <span className={dayNum2}>{dayNum}</span>
                      </button>
                      <div className={dayUsageText}>
                        {formatUsageHours(taskUsageMinutes)} /{' '}
                        {formatUsageHours(dailyWorkingHoursMinutes)}
                      </div>
                    </div>
                    <DayActionMenu
                      onAddTask={() => handleAddForDay(dayStr)}
                      onPickTask={() => setPickerDay(dayStr)}
                    />
                  </div>

                  {/* Items — unified, sorted by time */}
                  <div className={dayTaskList}>
                    {(() => {
                      const dow = DOW_TO_HABIT_DAY[new Date(dayStr).getDay()];

                      const items: DayItem[] = [
                        ...dayTaskEntries.map(({ task, block, color }) => ({
                          kind: 'task' as const,
                          item: task,
                          time: block.startTime,
                          color,
                          plannedMinutes: block.duration,
                          blockId: block.id,
                        })),
                        ...(display.showTasks ? getSpanTasksForDay(dayStr) : []).map((task) => ({
                          kind: 'task' as const,
                          item: task,
                          time: undefined,
                          color: HABIT_COLORS[task.color as TaskColor]?.value ?? 'var(--gold)',
                        })),
                        ...(display.showQuests ? (questsByDate[dayStr] ?? []) : []).map((q) => ({
                          kind: 'quest' as const,
                          item: q,
                          time: q.dueTime,
                        })),
                        ...(display.showHabits ? getHabitsForDay(dayStr) : []).map((h) => ({
                          kind: 'habit' as const,
                          item: h,
                          time: dow
                            ? h.schedule.find((e) => e.days.includes(dow))?.time
                            : undefined,
                          color: HABIT_COLORS[h.color as HabitColor]?.value ?? 'var(--violet)',
                        })),
                        ...dayEvents.map((e) => ({
                          kind: 'event' as const,
                          item: e,
                          time: e.startTime ?? undefined,
                          color: HABIT_COLORS[e.color as TaskColor]?.value ?? 'var(--cyan)',
                        })),
                      ];

                      // Timed items first (ascending), unscheduled at bottom
                      items.sort((a, b) => {
                        if (!a.time && !b.time) return 0;
                        if (!a.time) return 1;
                        if (!b.time) return -1;
                        return a.time.localeCompare(b.time);
                      });

                      return items.map((item) => {
                        if (item.kind === 'task') {
                          const task = item.item;
                          const blocked = isBlocked(task);
                          const itemKey = item.blockId ?? `span-${task.id}`;
                          // A task carrying both ends of a range shows up on
                          // every day it covers, so dragging one of those days
                          // is an ambiguous way to move the whole span. It gets
                          // moved by editing its dates instead.
                          const spansDates = Boolean(task.endDate);
                          return (
                            <DraggableItem
                              key={itemKey}
                              id={`task|${task.id}|${dayStr}|${itemKey}`}
                              data={{ type: 'task', item: task, color: item.color, dayStr }}
                              disabled={spansDates}
                            >
                              <div
                                className={cn(
                                  miniTask,
                                  task.status === 'done' && miniTaskDone,
                                  blocked && miniTaskBlocked,
                                  spansDates && miniTaskNoGrab,
                                )}
                                style={{ borderLeftColor: item.color, borderLeftWidth: 2 }}
                                onClick={() => handleEdit(task)}
                                title={`${item.time ? item.time + ' ' : ''}${task.name}`}
                              >
                                <div className="flex items-center gap-1 w-full min-w-0">
                                  <span className={miniTaskIcon}>
                                    <Icon icon={task.icon} />
                                  </span>
                                  <span className={miniTaskName}>{task.name}</span>
                                  {blocked && <span className={miniLock}>🔒</span>}
                                  {task.status === 'done' && <span className={miniDone}>✓</span>}
                                </div>
                                {(item.time || item.plannedMinutes != null) && (
                                  <div className={miniMetaRow}>
                                    {item.time && <span className={miniTime}>{item.time}</span>}
                                    {item.plannedMinutes != null && (
                                      <span className={miniPlanned}>
                                        {formatUsageHours(item.plannedMinutes)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </DraggableItem>
                          );
                        }

                        if (item.kind === 'quest') {
                          const q = item.item;
                          return (
                            <DraggableItem
                              key={q.id}
                              id={`quest|${q.id}|${dayStr}`}
                              data={{ type: 'quest', item: q, dayStr }}
                            >
                              <div
                                className={cn(miniTask, miniTaskQuest, q.done && miniTaskDone)}
                                title={q.title}
                                onClick={() => setDeletingQuest(q)}
                              >
                                {/* Same two-row shape as a task: identity on one
                                    line, time under it. miniTask is a column, so
                                    loose children stack instead of sitting inline. */}
                                <div className="flex items-center gap-1 w-full min-w-0">
                                  <span className={miniTaskIcon}>
                                    <Icon icon={q.habitIcon ?? '📌'} />
                                  </span>
                                  <span className={miniTaskName}>{q.title}</span>
                                  {q.done && <span className={miniDone}>✓</span>}
                                </div>
                                {item.time && <span className={miniTime}>{item.time}</span>}
                              </div>
                            </DraggableItem>
                          );
                        }

                        if (item.kind === 'event') {
                          const occ = item.item;
                          const live = isEventLive(occ, now);
                          return (
                            <div
                              key={occ.id}
                              className={cn(
                                'relative',
                                miniTask,
                                miniTaskEvent,
                                miniTaskNoGrab,
                                // The flame art is drawn for a night sky. A
                                // live chip keeps the dark tokens in either
                                // theme — `.dark` redefines them for this
                                // subtree alone.
                                live && 'dark',
                              )}
                              style={{ borderLeftColor: item.color, borderLeftWidth: 2 }}
                              title={`${item.time ? item.time + ' ' : ''}${occ.title}`}
                              onClick={() => occ.recurring && setCancelling(occ)}
                            >
                              {/* Behind the text, and only while the event is
                                  actually on — the rest keep the plain chip. */}
                              {live && <EventFlame />}

                              {/* Positioned so it paints over the artwork — an
                                  absolute sibling would otherwise sit on top. */}
                              <div className="relative flex min-w-0 flex-col gap-0.5">
                                <div className="flex items-center gap-1 w-full min-w-0">
                                  <span className={miniTaskIcon}>
                                    <Icon icon={occ.icon} />
                                  </span>
                                  <span className={miniTaskName}>{occ.title}</span>
                                  {occ.recurring && <span className={miniRepeat}>↻</span>}
                                </div>
                                {item.time && <span className={miniTime}>{item.time}</span>}
                              </div>
                            </div>
                          );
                        }

                        // habit — no drag
                        const h = item.item;
                        const done = isToday ? (habitLogMap[h.id] ?? false) : false;
                        return (
                          <div
                            key={h.id}
                            className={cn(
                              miniTask,
                              miniTaskHabit,
                              miniTaskNoGrab,
                              done && miniTaskDone,
                            )}
                            style={{ borderLeftColor: item.color, borderLeftWidth: 2 }}
                            title={`${item.time ? item.time + ' ' : ''}${h.name}`}
                            onClick={() => onNavigateTab?.('habits')}
                          >
                            <div className="flex items-center gap-1 w-full min-w-0">
                              <span className={miniTaskIcon}>
                                <Icon icon={h.icon} />
                              </span>
                              <span className={miniTaskName}>{h.name}</span>
                              {done && <span className={miniDone}>✓</span>}
                            </div>
                            {item.time && <span className={miniTime}>{item.time}</span>}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </DroppableDay>
              );
            })
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag && (
            <div
              className={cn(
                miniTask,
                activeDrag.type === 'quest' && miniTaskQuest,
                activeDrag.type === 'habit' && miniTaskHabit,
                dragOverlayItem,
              )}
              style={
                activeDrag.type !== 'quest'
                  ? { borderLeftColor: activeDrag.color, borderLeftWidth: 2 }
                  : undefined
              }
            >
              <span className={miniTaskIcon}>
                {activeDrag.type === 'task'
                  ? activeDrag.item.icon
                  : activeDrag.type === 'quest'
                    ? (activeDrag.item.habitIcon ?? '📌')
                    : activeDrag.item.icon}
              </span>
              <span className={miniTaskName}>
                {activeDrag.type === 'task'
                  ? activeDrag.item.name
                  : activeDrag.type === 'quest'
                    ? activeDrag.item.title
                    : activeDrag.item.name}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Pick — assign an existing task onto a day */}
      <SessionUpdatePrompt
        target={sessionPrompt}
        onClose={() => setSessionPrompt(null)}
        onManage={setPlannerTask}
      />

      <SessionPlanner
        open={plannerTask !== null}
        task={plannerTask}
        onClose={() => setPlannerTask(null)}
      />

      {/* Quests have no edit path, so removing a mistaken one is the only repair */}
      <Modal open={deletingQuest !== null} onClose={() => setDeletingQuest(null)} maxWidth="360px">
        <ModalHead
          title={
            <>
              <span className="text-[var(--rose)]">⚠</span> {tDash('quests.deleteTitle')}
            </>
          }
        />
        <ModalBody>
          <p className="text-[12px] leading-relaxed text-[var(--text-mid)]">
            {tDash.rich('quests.deleteConfirm', {
              title: deletingQuest?.title ?? '',
              strong: (chunks) => <strong className="text-[var(--text-hi)]">{chunks}</strong>,
            })}
          </p>
        </ModalBody>
        <ModalFoot>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setDeletingQuest(null)}
              disabled={deletingQuestPending}
              className="w-full justify-center sm:w-auto"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={deletingQuestPending}
              onClick={() => {
                if (deletingQuest) deleteQuest(deletingQuest.id);
                setDeletingQuest(null);
              }}
              className="w-full justify-center sm:w-auto"
            >
              {deletingQuestPending ? '…' : tDash('quests.deleteAction')}
            </Button>
          </div>
        </ModalFoot>
      </Modal>

      {/* Move or skip one occurrence of a repeating event without touching the series */}
      <OccurrenceModal
        occurrence={cancelling}
        onClose={() => setCancelling(null)}
        onMove={(occ, change) => {
          overrideEvent({ id: occ.eventId, date: occ.date, ...change });
          setCancelling(null);
        }}
        onSkip={(occ) => {
          overrideEvent({ id: occ.eventId, date: occ.date, cancelled: true });
          setCancelling(null);
        }}
      />

      <TaskPickerModal
        open={pickerDay !== null}
        dateStr={pickerDay ?? ''}
        excludeIds={pickerDay ? getVisibleTaskIdsForDay(pickerDay) : new Set()}
        onClose={() => setPickerDay(null)}
        onPick={(task) => updateTask({ id: task.id, startDate: pickerDay, endDate: pickerDay })}
      />

      {/* Create — unified AddTaskModal */}
      <AddTaskModal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setAddForDay(null);
        }}
        onSaved={() => {
          setShowAddModal(false);
          setAddForDay(null);
        }}
        defaultValues={addForDay ? { startDate: parseLocalDate(addForDay) } : undefined}
      />

      {/* Edit — unified EditTaskModal */}
      <EditTaskModal
        task={editing ? taskToUITask(editing as unknown as CoreTask) : null}
        open={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditing(undefined);
        }}
        onSave={(id, payload, onSuccess) => {
          updateTask(
            { id, ...payload },
            {
              onSuccess: () => {
                setShowEditModal(false);
                setEditing(undefined);
                onSuccess();
              },
            },
          );
        }}
      />

      <Modal open={!!deletingTask} onClose={() => setDeletingTask(undefined)} maxWidth="380px">
        <ModalHead
          title={
            <>
              <span style={{ color: 'var(--rose)' }}>⚠</span> Delete Task
            </>
          }
        />
        <ModalBody>
          <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: 0 }}>
            Delete <strong style={{ color: 'var(--text-hi)' }}>{deletingTask?.name}</strong>?
          </p>
        </ModalBody>
        <ModalFoot>
          <button
            type="button"
            className="modal-btn cancel"
            onClick={() => setDeletingTask(undefined)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn"
            onClick={handleDeleteConfirm}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, oklch(0.45 0.18 5), var(--rose))',
              borderColor: 'var(--rose)',
              color: '#fff',
            }}
          >
            Delete
          </button>
        </ModalFoot>
      </Modal>
    </div>
  );
}

// ── Droppable day column ──────────────────────────────────────────────────────

function DroppableDay({
  id,
  isToday,
  children,
}: {
  id: string;
  isToday: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(dayCol, isToday && dayColToday, isOver && dayColOver)}>
      {children}
    </div>
  );
}

// ── Draggable item wrapper ────────────────────────────────────────────────────

function DraggableItem({
  id,
  data,
  disabled,
  children,
}: {
  id: string;
  data: Record<string, unknown>;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id,
    data,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        opacity: isDragging ? 0 : 1,
        // See SlotColumn: a press-and-hold drag must leave native panning
        // alone, or the grid cannot be scrolled on a phone.
        touchAction: 'manipulation',
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

const outerWrap = 'flex flex-col flex-1 min-h-0 overflow-hidden';
const navRow =
  'flex items-center gap-2 px-3 py-2 shrink-0 border-b border-[var(--border)] justify-between';
const navBtn =
  'w-7 h-7 flex items-center justify-center rounded border border-[var(--border)] bg-[var(--panel2)] text-[var(--text-mid)] text-[16px] cursor-pointer hover:border-[var(--gold)] hover:text-[var(--gold)] transition-all shrink-0';
const navLabel = 'text-[11px] font-semibold text-[var(--text-hi)]';
const loadingMsg = 'text-[11px] text-[var(--text-lo)] col-span-7 text-center py-8';

const gridWrap =
  'flex-1 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-7 gap-px bg-[var(--border)] min-h-0';

const dayCol =
  'flex flex-col bg-[var(--panel)] md:overflow-hidden md:min-h-0 transition-colors duration-150';
const dayColToday =
  'bg-[linear-gradient(160deg,oklch(0.74_0.17_85_/_0.16),oklch(0.74_0.17_85_/_0.03))] ring-1 ring-inset ring-[oklch(0.74_0.17_85_/_0.55)] shadow-[0_0_18px_oklch(0.74_0.17_85_/_0.18),inset_0_0_28px_oklch(0.74_0.17_85_/_0.08)]';
const dayColOver =
  'bg-[oklch(0.74_0.17_85_/_0.1)] ring-1 ring-inset ring-[oklch(0.74_0.17_85_/_0.45)]';

const dayHeader =
  'flex items-center justify-between px-1.5 py-1 border-b border-[var(--border)] shrink-0';
const dayHeaderMain = 'flex flex-col items-start min-w-0';
const dayLabel =
  'flex flex-col items-center cursor-pointer hover:text-[var(--gold)] transition-colors';
const dayLabelToday = 'text-[var(--gold)]';
const dayNum2 = 'text-[13px] font-bold leading-none mt-0.5';
const dayUsageText =
  'mt-1 inline-flex items-center rounded-[4px] border border-[oklch(0.74_0.17_85_/_0.35)] bg-[oklch(0.74_0.17_85_/_0.12)] px-1.5 py-[3px] text-[8px] leading-none text-[var(--gold)] font-[var(--font-title)] whitespace-nowrap shadow-[0_0_10px_oklch(0.74_0.17_85_/_0.12)]';

const dayTaskList = 'px-1 py-1 flex flex-col gap-0.5 md:flex-1 md:overflow-y-auto md:min-h-0';

const miniTask =
  'flex flex-col gap-0.5 px-1.5 py-1.5 rounded text-[9px] bg-[var(--panel2)] border border-[var(--border)] cursor-grab active:cursor-grabbing hover:border-[oklch(0.74_0.17_85_/_0.4)] transition-all overflow-hidden';
const miniTaskDone = 'opacity-50';
const miniTaskBlocked = 'opacity-60 cursor-default';
const miniTaskQuest = 'border-[oklch(0.74_0.17_85_/_0.25)] bg-[oklch(0.74_0.17_85_/_0.05)]';
const miniTaskHabit = 'border-[oklch(0.66_0.22_295_/_0.25)] bg-[oklch(0.66_0.22_295_/_0.05)]';
// Dashed edge marks an event: it happens, there is nothing to complete.
const miniTaskEvent = 'border-dashed border-[var(--border-hi)] bg-[var(--bg-2)]';
const miniRepeat = 'text-[7px] text-[var(--text-lo)] shrink-0';
const miniTaskIcon = 'text-[10px] shrink-0';
const miniTaskName = 'flex-1 truncate text-[var(--text-hi)] leading-tight';
const miniLock = 'text-[8px] shrink-0';
const miniDone = 'text-[9px] text-[oklch(0.76_0.14_162)] shrink-0';
const miniMetaRow = 'flex items-center justify-between gap-2';
const miniTime = 'text-[7px] text-[var(--text-lo)] shrink-0 font-[var(--font-title)]';
const miniPlanned = 'text-[7px] text-[var(--gold)] shrink-0 font-[var(--font-title)] tabular-nums';
const miniTaskNoGrab = '!cursor-pointer active:!cursor-pointer';

const dragOverlayItem =
  'w-[150px] shadow-[0_8px_28px_rgba(0,0,0,0.55)] scale-105 !cursor-grabbing border-[oklch(0.74_0.17_85_/_0.5)] bg-[var(--panel3)]';
