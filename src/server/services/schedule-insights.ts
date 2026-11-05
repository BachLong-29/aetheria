import type { CalendarItem } from '@/types/calendar';
import type { CapacityStatus, DayCapacity, ScheduleConflict } from '@/types/calendar-insights';

/** A calendar item guaranteed to have a concrete start time. */
type TimedItem = CalendarItem & { startTime: string };

/** "HH:MM" → minutes since midnight. */
function toMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Whether an item spends the day. An event switched to "doesn't take up my time" stays
 * on the calendar but neither fills the day's capacity nor collides with other items.
 */
function spendsTime(item: CalendarItem): boolean {
  return !(item.sourceType === 'event' && item.meta?.busy === false);
}

/** Items that participate in time-based checks (have a real start time + duration). */
function timedItems(items: CalendarItem[]): TimedItem[] {
  return items.filter(
    (i): i is TimedItem => i.startTime !== null && i.duration > 0 && spendsTime(i),
  );
}

/**
 * Detect hard (overlap) and soft (gap < minBreak) conflicts within each day.
 * Pure — operates on the calendar items it is given.
 */
export function detectConflicts(
  items: CalendarItem[],
  minBreakMinutes: number,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  // Group by date
  const byDate = new Map<string, TimedItem[]>();
  for (const item of timedItems(items)) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  for (const [date, list] of byDate) {
    const sorted = [...list].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      if (!a) continue;
      const aStart = toMinutes(a.startTime);
      const aEnd = aStart + a.duration;

      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (!b) continue;
        const bStart = toMinutes(b.startTime);
        if (bStart >= aEnd) {
          // b starts after a ends → measure the gap (soft conflict candidate)
          const gap = bStart - aEnd;
          if (gap < minBreakMinutes) {
            conflicts.push({
              type: 'soft',
              date,
              a: endpoint(a),
              b: endpoint(b),
              gap,
            });
          }
          // Items are sorted; no later item overlaps `a`, stop scanning for it.
          break;
        }
        // Overlap → hard conflict
        conflicts.push({ type: 'hard', date, a: endpoint(a), b: endpoint(b) });
      }
    }
  }

  return conflicts;
}

function endpoint(i: TimedItem) {
  return {
    id: i.id,
    title: i.title,
    startTime: i.startTime,
    endTime: i.endTime ?? i.startTime,
  };
}

/** Per-day workload vs. available capacity. */
export function computeCapacity(
  items: CalendarItem[],
  dateKeys: string[],
  availableMinutes: number,
): DayCapacity[] {
  const plannedByDate = new Map<string, number>();
  // Only what sits on the clock counts. A task with an estimate but no session is dropped
  // onto its start date without a time, which would charge the whole estimate to one day.
  for (const item of timedItems(items)) {
    plannedByDate.set(item.date, (plannedByDate.get(item.date) ?? 0) + item.duration);
  }

  return dateKeys.map((date) => {
    const planned = plannedByDate.get(date) ?? 0;
    const loadPct = availableMinutes > 0 ? Math.round((planned / availableMinutes) * 100) : 0;
    let status: CapacityStatus = 'normal';
    if (loadPct > 100) status = 'overloaded';
    else if (loadPct >= 80) status = 'tight';

    return { date, plannedMinutes: planned, availableMinutes, loadPct, status };
  });
}
