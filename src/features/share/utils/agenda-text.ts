import type { CalendarItem } from '@/types';

/** A day's worth of items, already ordered the way they should be read. */
export interface AgendaDay {
  date: string;
  items: CalendarItem[];
}

/**
 * Group calendar items by day. Timed items come first in clock order; all-day
 * and deadline-only items (`startTime: null`) sink to the bottom of their day.
 */
export function groupByDay(items: CalendarItem[]): AgendaDay[] {
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const bucket = byDate.get(item.date);
    if (bucket) bucket.push(item);
    else byDate.set(item.date, [item]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayItems]) => ({
      date,
      items: dayItems.sort((a, b) => {
        if (a.startTime === b.startTime) return a.title.localeCompare(b.title);
        if (a.startTime === null) return 1;
        if (b.startTime === null) return -1;
        return a.startTime.localeCompare(b.startTime);
      }),
    }));
}

/**
 * The `done/total` line. Events are left out of both numbers: they are never `done`, so counting
 * them would keep a week with meetings from ever reaching full.
 */
export function countTally(items: CalendarItem[]): { done: number; total: number } {
  const tracked = items.filter((item) => item.sourceType !== 'event');
  return { done: tracked.filter((item) => item.status === 'done').length, total: tracked.length };
}

export interface AgendaTextInput {
  items: CalendarItem[];
  scope: 'day' | 'week';
  /** BCP-47 tag used to name the days — the app's active locale. */
  locale: string;
  /** Localised line at the top, e.g. "Tuesday, 16 September 2026". */
  heading: string;
  /** Shown instead of a list when the range holds nothing. */
  emptyLabel: string;
  /** Localised tally, e.g. "5/8 done". Omitted when there is nothing to tally. */
  summaryLabel?: string;
}

/**
 * Render the agenda as plain text for the clipboard.
 *
 * Unlike the image, this is pasted into someone else's app, so it stays plain:
 * no box drawing, no colour, and a leading marker that survives any font.
 */
export function buildAgendaText({
  items,
  scope,
  locale,
  heading,
  emptyLabel,
  summaryLabel,
}: AgendaTextInput): string {
  const lines: string[] = [heading, ''];

  if (items.length === 0) {
    lines.push(emptyLabel);
    return lines.join('\n');
  }

  const days = groupByDay(items);
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });

  for (const day of days) {
    // A single day is already named by the heading — repeating it adds noise.
    if (scope === 'week') {
      lines.push(dayFormatter.format(new Date(`${day.date}T00:00:00`)));
    }

    for (const item of day.items) {
      const time = item.startTime ?? '     ';
      const done = item.status === 'done' ? ' ✓' : '';
      lines.push(`${scope === 'week' ? '  ' : ''}${time}  ${item.title}${done}`);
    }

    if (scope === 'week') lines.push('');
  }

  if (summaryLabel) {
    if (lines.at(-1) !== '') lines.push('');
    lines.push(summaryLabel);
  }

  return lines.join('\n').trimEnd();
}
