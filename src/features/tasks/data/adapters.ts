// ─────────────────────────────────────────────────────────────────────────────
//  Task Management — API → UITask adapters
// ─────────────────────────────────────────────────────────────────────────────

import type { Task, Habit, HabitLog, TaskLog } from '@/types';

import type { UITask, TaskCat, TaskSlot } from './mock';

// Minimal shape shared by both @/types Quest and dashboard/types Quest
export interface QuestLike {
  id: string;
  title: string;
  desc: string;
  type: string;
  difficulty: string;
  xp: number;
  coins: number;
  done: boolean;
  tags: string[];
  dueDate?: string;
  /** "HH:MM" — absent means the quest is due that day at no particular hour */
  dueTime?: string;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Days from today to the given ISO date string (negative = past).
 *  Uses Date(y, m, d) constructor so the date is treated as LOCAL midnight,
 *  avoiding the ISO-string UTC-parse shift that causes off-by-one in UTC+ zones. */
export function dayOffset(dateStr?: string): number {
  if (!dateStr) return 0;
  // Accepts both a plain "YYYY-MM-DD" (tasks) and a full ISO timestamp (quests serialise
  // `dueDate` with `toISOString()`). Without the trim the day part parses as NaN, which makes
  // every `day === offset` comparison downstream fail silently.
  const parts = dateStr.substring(0, 10).split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Parse a YYYY-MM-DD string as LOCAL midnight (not UTC) to avoid off-by-one in UTC+ zones. */
export function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(Number(parts[0]), Number(parts[1] ?? '1') - 1, Number(parts[2] ?? '1'));
}

/** Human-readable deadline label */
export function formatDeadline(dateStr?: string): string {
  if (!dateStr) return '–';
  const offset = dayOffset(dateStr);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  if (offset < 0) return `${Math.abs(offset)}d ago`;
  if (offset <= 7)
    return parseDateLocal(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  return parseDateLocal(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Overdue escalation level based on how many days past the due date */
export function computeOverdueLevel(task: {
  status?: string;
  active?: boolean;
  startDate?: string;
  endDate?: string;
}): 'late' | 'critical' | 'failed' | null {
  if (task.status === 'done' || task.active === false) return null;
  const dueDate = task.endDate ?? task.startDate;
  if (!dueDate) return null;
  const offset = dayOffset(dueDate); // negative = past
  if (offset >= 0) return null;
  const daysOverdue = -offset;
  if (daysOverdue >= 7) return 'failed';
  if (daysOverdue >= 3) return 'critical';
  return 'late';
}

/** Deadline urgency token used by urgencyColors */
export function computeUrgency(dateStr?: string, done?: boolean): string {
  if (done) return 'done';
  if (!dateStr) return 'later';
  const offset = dayOffset(dateStr);
  if (offset < 0) return 'overdue';
  if (offset === 0) return 'today';
  if (offset <= 2) return 'soon';
  if (offset <= 7) return 'week';
  return 'later';
}

// ─── Mapping tables ───────────────────────────────────────────────────────────

const QUEST_TYPE_TO_CAT: Record<string, TaskCat> = {
  focus: 'focus',
  habit: 'habit',
  reflect: 'reflect',
  admin: 'admin',
  create: 'create',
  health: 'health',
  break: 'reflect',
  task: 'focus', // dashboard/types has 'task' as a QuestType
};

const COLOR_TO_CAT: Record<string, TaskCat> = {
  cyan: 'focus',
  mint: 'create',
  gold: 'habit',
  violet: 'reflect',
  rose: 'admin',
  amber: 'create',
  blue: 'focus',
};

// ─── Task → UITask ────────────────────────────────────────────────────────────

/**
 * @param blockTime  HH:MM of the task's earliest schedule block on its day, if any.
 *                   Drives the slot + the card's displayed time. When omitted the task
 *                   falls back to a default slot (morning / current-hour for today).
 */
/** What the UI shows a task as worth; the API pays its own amount on completion. */
export const UI_TASK_XP = 100;

export function taskToUITask(t: Task, taskLog?: TaskLog, blockTime?: string): UITask {
  const startOffset = dayOffset(t.startDate);
  const endOffset = t.endDate ? dayOffset(t.endDate) : startOffset;
  const totalDays = Math.max(endOffset - startOffset + 1, 1);

  // A task is "multi-day" when it spans more than 1 calendar day
  const isMultiDay = totalDays > 1;

  // Multi-day task active today: clamp day to 0 so it appears in the day view
  const isActiveToday = isMultiDay && startOffset <= 0 && endOffset >= 0;
  // Backlog tasks (no startDate) belong to NO calendar day. Mark day as NaN so
  // they never match a day-view / WeekPeek / week-grid offset filter
  // (`NaN === n` is always false), while staying visible in the All view + search.
  // A backlog task that gets a schedule block is re-placed with the block's day
  // by the caller (see TaskManagement day-merge), so this only hides unscheduled ones.
  const day = !t.startDate ? Number.NaN : isActiveToday ? 0 : startOffset;

  const loggedToday = isMultiDay ? !!taskLog : undefined;

  // "Done" for day-view purposes:
  //   - single-day: reflects task status
  //   - multi-day active today: true when today is logged OR task was explicitly completed
  //   - multi-day NOT active today (past / future): reflects overall status only
  //     → prevents a stale loggedToday from marking future-day slots as done
  const done = isMultiDay
    ? isActiveToday
      ? (loggedToday ?? false) || t.status === 'done'
      : t.status === 'done'
    : t.status === 'done';

  const progress = t.status === 'done' ? 1 : t.status === 'in_progress' ? 0.5 : 0;

  // Deadline label for multi-day tasks shows the full range
  const deadlineStr = t.endDate || t.startDate;
  const deadline = isMultiDay
    ? `${formatDeadline(t.startDate)} → ${formatDeadline(t.endDate)}`
    : formatDeadline(deadlineStr);

  return {
    id: t.id,
    sourceId: t.id,
    source: 'task',
    title: t.name,
    desc: t.note ?? '',
    cat: COLOR_TO_CAT[t.color] ?? 'focus',
    diff: 'B',
    priority: 'medium',
    xp: UI_TASK_XP,
    coins: 25,
    est: t.duration ?? 60,
    deadline,
    deadlineUrgency: computeUrgency(deadlineStr, t.status === 'done'),
    progress,
    subtasks: 0,
    subtasksDone: 0,
    day,
    slot: offsetToSlot(day, blockTime),
    tags: [],
    streak: 0,
    combo: 0,
    done,
    // raw API fields
    icon: t.icon,
    status: t.status,
    color: t.color,
    tagId: t.tagId,
    dependencies: t.dependencies,
    startDate: t.startDate,
    endDate: t.endDate,
    startTime: blockTime,
    habitRef: t.habitRef,
    active: t.active,
    deferReason: t.deferReason,
    attachments: t.attachments,
    projectId: t.projectId,
    // multi-day extras
    isMultiDay,
    totalDays: isMultiDay ? totalDays : undefined,
    loggedToday,
    overdueLevel: computeOverdueLevel(t),
  };
}

// ─── Quest → UITask ───────────────────────────────────────────────────────────

export function questToUITask(q: QuestLike): UITask {
  const offset = dayOffset(q.dueDate);

  return {
    id: q.id,
    sourceId: q.id,
    source: 'quest',
    title: q.title,
    desc: q.desc,
    cat: QUEST_TYPE_TO_CAT[q.type] ?? 'focus',
    diff: q.difficulty as UITask['diff'],
    priority: diffToPriority(q.difficulty),
    xp: q.xp,
    coins: q.coins,
    est: 60,
    deadline: formatDeadline(q.dueDate),
    deadlineUrgency: computeUrgency(q.dueDate, q.done),
    progress: q.done ? 1 : 0,
    subtasks: 0,
    subtasksDone: 0,
    day: offset,
    // The hour, when set, decides both the time shown and which slot it lands in.
    slot: offsetToSlot(offset, q.dueTime),
    startTime: q.dueTime,
    tags: q.tags,
    streak: 0,
    combo: 0,
    done: q.done,
    endDate: q.dueDate,
  };
}

// ─── Habit → UITask ───────────────────────────────────────────────────────────

/** Day-of-week (Date.getDay()) → HabitDay string */
const DOW_TO_HABIT_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Returns the HabitScheduleEntry that covers today, or undefined */
export function getTodayEntry(h: Habit) {
  const today = DOW_TO_HABIT_DAY[new Date().getDay()];
  return h.schedule.find((e) => today && e.days.includes(today));
}

/** Returns the HabitScheduleEntry that covers the given date, or undefined */
export function getEntryForDate(h: Habit, date: Date) {
  const dow = DOW_TO_HABIT_DAY[date.getDay()];
  return h.schedule.find((e) => dow && e.days.includes(dow));
}

/** Returns true if the habit is scheduled for today */
export function isHabitScheduledToday(h: Habit): boolean {
  return getTodayEntry(h) !== undefined;
}

/** Returns true if the habit is scheduled for the given date */
export function isHabitScheduledForDate(h: Habit, date: Date): boolean {
  return getEntryForDate(h, date) !== undefined;
}

/**
 * Convert a Habit to a UITask.
 *
 * Pass `forDate` when building a task for a date other than today — the entry,
 * slot, day offset, deadline label and urgency are all computed relative to
 * that date rather than the real current day.
 */
export function habitToUITask(h: Habit, log?: HabitLog, cancelled = false, forDate?: Date): UITask {
  const done = log?.done ?? false;

  // ── Entry & slot ────────────────────────────────────────────────────────────
  const entry = forDate ? getEntryForDate(h, forDate) : getTodayEntry(h);

  // ── Day offset & deadline label ─────────────────────────────────────────────
  let day: number;
  let deadline: string;
  let deadlineUrgency: string;

  if (forDate) {
    const dateStr = `${forDate.getFullYear()}-${String(forDate.getMonth() + 1).padStart(2, '0')}-${String(forDate.getDate()).padStart(2, '0')}`;
    day = dayOffset(dateStr);
    const label = formatDeadline(dateStr);
    deadline = done ? `Done · ${label}` : entry?.time ? `${label} · ${entry.time}` : label;
    deadlineUrgency = done ? 'done' : computeUrgency(dateStr, false);
  } else {
    day = 0;
    const timeLabel = entry?.time ? `Today · ${entry.time}` : 'Today';
    deadline = done ? 'Done · Today' : timeLabel;
    deadlineUrgency = done ? 'done' : 'today';
  }

  return {
    id: `habit-${h.id}`,
    sourceId: h.id,
    source: 'habit',
    // The icon travels in `icon`; a quest name or image URL in the title would print as text.
    title: h.name,
    desc: h.note ?? '',
    cat: 'habit',
    diff: 'C',
    priority: 'medium',
    xp: 50,
    coins: 12,
    est: h.duration ?? 15,
    deadline,
    deadlineUrgency,
    progress: done ? 1 : 0,
    subtasks: 0,
    subtasksDone: 0,
    day,
    slot: timeToSlot(entry?.time),
    tags: [],
    streak: 0,
    combo: 0,
    done,
    icon: h.icon,
    color: h.color,
    tagId: h.tagId,
    startTime: entry?.time,
    active: h.active,
    cancelled,
  };
}

// ─── Slot helpers (exported for use in drag-drop and UI) ─────────────────────

/** Map a slot id to its default startTime (start of the slot's time range) */
export function slotToDefaultTime(slot: TaskSlot): string {
  const MAP: Record<TaskSlot, string> = {
    morning: '06:00',
    deep: '10:00',
    afternoon: '13:00',
    evening: '17:00',
  };
  return MAP[slot];
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function diffToPriority(diff: string): UITask['priority'] {
  if (diff === 'S') return 'critical';
  if (diff === 'A') return 'high';
  if (diff === 'B') return 'medium';
  return 'low';
}

/**
 * Map offset + optional explicit startTime to a TaskSlot.
 *
 * Priority order:
 *   1. If startTime is set → always use it (works for any date offset)
 *   2. No startTime + today (offset=0) → fall back to current hour
 *   3. No startTime + other day → default to 'morning'
 */
function offsetToSlot(offset: number, startTime?: string): TaskSlot {
  if (startTime) {
    const h = parseInt(startTime.split(':')[0] ?? '0', 10);
    if (h < 10) return 'morning';
    if (h < 13) return 'deep';
    if (h < 17) return 'afternoon';
    return 'evening';
  }
  if (offset !== 0) return 'morning';
  const h = new Date().getHours();
  if (h < 10) return 'morning';
  if (h < 13) return 'deep';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/** Map a "HH:MM" time string to the slot it falls in */
function timeToSlot(time?: string): TaskSlot {
  if (!time) return 'morning';
  const h = parseInt(time.split(':')[0] ?? '0', 10);
  if (h < 10) return 'morning';
  if (h < 13) return 'deep';
  if (h < 17) return 'afternoon';
  return 'evening';
}
