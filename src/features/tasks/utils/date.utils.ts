export function toLocalDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Parse a `YYYY-MM-DD` string into a local-midnight Date — inverse of {@link toLocalDate}. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  return toLocalDate(new Date());
}

/** Real calendar date for a day-offset from today (0 = today). */
export function offsetToISO(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toLocalDate(d);
}

/**
 * Whether `dateISO` falls within a task's [startDate, dueDate] span.
 * An undefined `dueDate` means open-ended → always in range.
 */
export function isInRange(dateISO: string, startDate?: string, dueDate?: string): boolean {
  if (startDate && dateISO < startDate) return false;
  if (dueDate && dateISO > dueDate) return false;
  return true;
}

/**
 * Session lookup derived from schedule blocks, used to place tasks on the days
 * they're actually scheduled rather than every day in their range.
 *  - `dayKeys`: `${sourceId}|${YYYY-MM-DD}` for every block (a "session").
 *  - `taskIds`: source ids that have at least one session somewhere in the range.
 */
export interface TaskSessions {
  dayKeys: Set<string>;
  taskIds: Set<string>;
}

/** Build a {@link TaskSessions} lookup from raw schedule blocks. */
export function buildTaskSessions(blocks: { sourceId: string; date: string }[]): TaskSessions {
  const dayKeys = new Set<string>();
  const taskIds = new Set<string>();
  for (const b of blocks) {
    dayKeys.add(`${b.sourceId}|${b.date}`);
    taskIds.add(b.sourceId);
  }
  return { dayKeys, taskIds };
}

/**
 * Whether a task should appear on the given day-offset (0 = today), mirroring the
 * session-driven rule used by the day view:
 *  - Backlog tasks (real task, no startDate) aren't tied to any day → never shown.
 *  - Multi-day tasks span by date range, but once they have sessions they appear
 *    ONLY on their session days; a multi-day task with no sessions spans its full
 *    range as a fallback.
 *  - Everything else (single-day tasks, quests, habits) keeps its single `day`.
 */
export function taskOccursOnDayOffset(
  t: {
    source?: string;
    startDate?: string;
    endDate?: string;
    isMultiDay?: boolean;
    day: number;
    id: string;
    sourceId?: string;
  },
  offset: number,
  sessions: TaskSessions,
): boolean {
  if (t.source === 'task' && !t.startDate) return false;

  if (t.isMultiDay && t.startDate) {
    const dateISO = offsetToISO(offset);
    if (!isInRange(dateISO, t.startDate, t.endDate)) return false;
    const id = t.sourceId ?? t.id;
    return sessions.taskIds.has(id) ? sessions.dayKeys.has(`${id}|${dateISO}`) : true;
  }

  return t.day === offset;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86400000);
}

/** `dateStr` moved by `n` days, as `YYYY-MM-DD`. */
export function shiftDate(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}
