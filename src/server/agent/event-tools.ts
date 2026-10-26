import { z } from 'zod';

import { CategoryModel } from '@/server/models/category.model';
import { EventModel } from '@/server/models/event.model';
import type { IEvent } from '@/server/models/event.model';
import { expandEvents } from '@/server/services/event-expand';
import { applyEventOverride } from '@/server/services/event-override';
import type { AgentTarget } from '@/types/agent';
import type { EventRecurrence } from '@/types/event';
import { diacriticRegex, matchesQuery } from '@/libs/utils';

/**
 * Event tools for the assistant. Same contract as the task and habit tools:
 * reads run at once, writes are only proposed and run after the user confirms,
 * every lookup is scoped to the caller. Repeating events keep the app's own
 * model — one rule row, plus one override row per cancelled or moved day —
 * so nothing here is a second way of storing them.
 */

const EVENT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const timeArg = z.string().regex(TIME_RE, 'Use 24-hour HH:MM');

const DEFAULT_COLOR = 'gold';
const DEFAULT_ICON = '📅';
/** A timed event with no stated length. */
const DEFAULT_MINUTES = 60;
/** Reading further than this at once is a calendar dump, not an answer. */
const MAX_RANGE_DAYS = 62;
const DAY_MS = 86_400_000;

const recurrenceArg = z.object({
  freq: z.enum(['weekly', 'monthly']),
  days: z
    .array(z.enum(EVENT_DAYS))
    .min(1)
    .optional()
    .describe('Weekdays, required for weekly, e.g. ["mon","wed"]'),
  dayOfMonth: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe('Day of the month, required for monthly'),
  interval: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe('1 = every week/month (default), 2 = every other one'),
});

const eventId = z.string().min(1).describe('Event id from list_events');

const listEventsArgs = z.object({
  start: ymd.optional().describe('First day, YYYY-MM-DD. Give start and end together.'),
  end: ymd.optional().describe('Last day, YYYY-MM-DD, at most 62 days after start'),
  q: z.string().max(100).optional().describe('Search text in the title'),
});

const createEventArgs = z.object({
  title: z.string().min(1).max(100).describe('Short title'),
  startDate: ymd.describe('The day it happens, or the day a repeating event starts'),
  startTime: timeArg
    .optional()
    .describe('24-hour HH:MM. Omit for an all-day event. Never invent a time.'),
  duration: z.number().int().min(1).max(1440).optional().describe('Minutes, default 60'),
  allDay: z.boolean().optional().describe('Default: all-day when no startTime is given'),
  recurrence: recurrenceArg.optional().describe('Omit for a one-off event'),
  endDate: ymd.optional().describe('Last day of a repeating event. Omit for no end.'),
  busy: z.boolean().optional().describe('Takes up the day (default true); false = just a marker'),
  tagId: z
    .string()
    .optional()
    .describe('Category id from list_categories. Omit to use the first category.'),
  note: z.string().max(500).optional(),
});

const updateEventArgs = z
  .object({
    id: eventId,
    title: z.string().min(1).max(100).optional(),
    startDate: ymd.optional().describe('New day (one-off) or new start of a repeating event'),
    endDate: ymd.nullable().optional().describe('New last day of a repeating event. null = none.'),
    startTime: timeArg.optional().describe('New time, 24-hour HH:MM'),
    duration: z.number().int().min(1).max(1440).optional().describe('New minutes'),
    allDay: z.boolean().optional().describe('true drops its time; false needs startTime'),
    recurrence: recurrenceArg
      .nullable()
      .optional()
      .describe('New rule, replaces the old one. null makes it a one-off.'),
    busy: z.boolean().optional(),
    tagId: z.string().optional().describe('New category id from list_categories'),
    note: z.string().max(500).nullable().optional().describe('New note. null clears it.'),
  })
  .refine(
    (args) =>
      Object.keys(args).some((key) => key !== 'id' && args[key as keyof typeof args] !== undefined),
    { message: 'Give at least one field to change' },
  );

const deleteEventArgs = z.object({ id: eventId });

const occurrenceArgs = {
  eventId: z.string().min(1).describe('Id of the repeating event from list_events'),
  date: ymd.describe('The day the occurrence is on now, YYYY-MM-DD'),
};

const cancelOccurrenceArgs = z.object(occurrenceArgs);

const moveOccurrenceArgs = z
  .object({
    ...occurrenceArgs,
    newDate: ymd.optional().describe('Day to move it to'),
    startTime: timeArg.optional().describe('New time of day, 24-hour HH:MM'),
    duration: z.number().int().min(1).max(1440).optional().describe('New minutes'),
  })
  .refine((a) => a.newDate !== undefined || a.startTime !== undefined || a.duration !== undefined, {
    message: 'Give newDate, startTime or duration',
  });

export const EVENT_READ_TOOLS = {
  list_events: {
    description:
      'List events. With start and end: every occurrence in that range (repeating ones already expanded), each with its eventId. Without a range: the events themselves with their repeat rule — use that to find one by name.',
    schema: listEventsArgs,
  },
} as const;

export const EVENT_WRITE_TOOLS = {
  create_event: {
    description:
      'Propose a calendar event, one-off or repeating (weekly / monthly). The user must confirm. Something the user has to get done is a task, not an event.',
    schema: createEventArgs,
  },
  update_event: {
    description:
      'Propose editing a whole event (every occurrence of a repeating one): only the fields passed change; recurrence replaces the whole rule. To change one day only use move_occurrence. The user must confirm.',
    schema: updateEventArgs,
  },
  delete_event: {
    description:
      'Propose deleting an event with all its occurrences. For one day of a repeating event use cancel_occurrence. The user must confirm.',
    schema: deleteEventArgs,
  },
  cancel_occurrence: {
    description:
      'Propose skipping one day of a repeating event; the rest of the series stays. The user must confirm.',
    schema: cancelOccurrenceArgs,
  },
  move_occurrence: {
    description:
      'Propose moving or retiming one day of a repeating event; the rest of the series stays. The user must confirm.',
    schema: moveOccurrenceArgs,
  },
} as const;

export type EventReadToolName = keyof typeof EVENT_READ_TOOLS;
export type EventWriteToolName = keyof typeof EVENT_WRITE_TOOLS;

type Proposal = { args: Record<string, unknown>; summary: string } | { error: string };
type Result = { ok: boolean; message: string; target?: AgentTarget };

const eventTarget = (event: { _id: unknown; title?: string }, date?: string): AgentTarget => ({
  kind: 'event',
  id: String(event._id),
  label: event.title ?? '',
  ...(date ? { date } : {}),
});

/** A rule as the model writes it — `interval` may be left out and means every one. */
type RuleLike = Omit<EventRecurrence, 'interval'> & { interval?: number };

const NOT_FOUND = 'Event not found. Look it up with list_events.';
const ymdOf = (date?: Date | null) => date?.toISOString().slice(0, 10);

/** A real event of the caller's — never one of the override rows behind a series. */
function findEvent(id: string, userId: string) {
  return EventModel.findOne({
    _id: id,
    userId,
    active: true,
    seriesRef: { $exists: false },
  }).catch(() => null);
}

/** `weekly mon,wed every 2 weeks` — short enough for a confirm card or a list. */
function describeRule(rule?: RuleLike | null): string {
  if (!rule) return 'one-off';
  const every = rule.interval && rule.interval > 1 ? `every ${rule.interval} ` : '';
  return rule.freq === 'weekly'
    ? `${every}weekly ${rule.days?.join(',') ?? ''}`.trim()
    : `${every}monthly on day ${rule.dayOfMonth ?? '?'}`.trim();
}

function describeWhen(args: {
  startTime?: string | null;
  duration?: number | null;
  allDay?: boolean;
}) {
  if (args.allDay || !args.startTime) return 'all day';
  return `${args.startTime} (${args.duration ?? DEFAULT_MINUTES} min)`;
}

function ruleBrief(event: IEvent) {
  return {
    id: event._id.toString(),
    title: event.title,
    startDate: ymdOf(event.startDate),
    endDate: ymdOf(event.endDate),
    allDay: event.allDay,
    startTime: event.startTime,
    duration: event.duration,
    repeats: describeRule(event.recurrence),
    recurrence: event.recurrence
      ? {
          freq: event.recurrence.freq,
          days: event.recurrence.days,
          dayOfMonth: event.recurrence.dayOfMonth,
          interval: event.recurrence.interval,
        }
      : undefined,
    busy: event.busy,
    paused: event.paused,
  };
}

/**
 * A time given to an all-day event turns it into a timed one — saying "make it
 * 10:00" is not a request to keep it all-day.
 */
function wantsAllDay(args: { allDay?: boolean; startTime?: string }, current: boolean): boolean {
  return args.allDay ?? (args.startTime !== undefined ? false : current);
}

/** Does the merged event still make sense? The same rules the event API enforces. */
function shapeError(event: {
  allDay: boolean;
  startTime?: string | null;
  duration?: number | null;
  recurrence?: RuleLike | null;
}): string | null {
  if (!event.allDay && (!event.startTime || !event.duration)) {
    return 'A timed event needs startTime and duration.';
  }
  const rule = event.recurrence;
  if (rule?.freq === 'weekly' && !rule.days?.length) return 'A weekly event needs its days.';
  if (rule?.freq === 'monthly' && !rule.dayOfMonth) return 'A monthly event needs dayOfMonth.';
  return null;
}

/**
 * The occurrence of `seriesId` shown on `date`, with the day the rule first
 * generated it. A moved occurrence is shown on its new day but is overridden
 * under its old one — that old day is what the override row is keyed on.
 */
async function findOccurrence(userId: string, seriesId: string, date: string) {
  const day = await expandEvents(userId, date, date);
  const occ = day.find((o) => (o.isOverride ? o.seriesId : o.eventId) === seriesId);
  if (!occ) return null;
  if (!occ.isOverride) return { occ, originalDate: date };
  const row = await EventModel.findOne({ _id: occ.eventId, userId }).catch(() => null);
  return { occ, originalDate: ymdOf(row?.overrideDate) ?? date };
}

export async function runEventReadTool(
  name: EventReadToolName,
  rawArgs: unknown,
  userId: string,
): Promise<unknown> {
  const parsed = EVENT_READ_TOOLS[name].schema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };
  const { start, end, q } = parsed.data;

  if (!start !== !end) return { error: 'Give start and end together, or neither.' };

  if (start && end) {
    if (end < start) return { error: 'end must not be before start' };
    const span = (new Date(end).getTime() - new Date(start).getTime()) / DAY_MS;
    if (span > MAX_RANGE_DAYS) return { error: `Ask for at most ${MAX_RANGE_DAYS} days at once.` };

    const occurrences = await expandEvents(userId, start, end);
    return occurrences
      .filter((o) => matchesQuery(o.title, q ?? ''))
      .map((o) => ({
        // A moved occurrence is its own row; the series is what later edits address.
        eventId: o.isOverride ? o.seriesId : o.eventId,
        title: o.title,
        date: o.date,
        startTime: o.startTime,
        duration: o.duration,
        allDay: o.allDay,
        repeats: o.recurring,
        moved: o.isOverride,
        busy: o.busy,
      }));
  }

  const filter: Record<string, unknown> = { userId, active: true, seriesRef: { $exists: false } };
  if (q) filter.title = { $regex: diacriticRegex(q), $options: 'i' };
  const events = await EventModel.find(filter).sort({ startDate: 1 }).limit(50);
  return events.map(ruleBrief);
}

export async function proposeEventAction(
  name: EventWriteToolName,
  rawArgs: unknown,
  userId: string,
): Promise<Proposal> {
  const parsed = EVENT_WRITE_TOOLS[name].schema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };

  if (name === 'create_event') {
    const args = parsed.data as z.infer<typeof createEventArgs>;
    const allDay = args.allDay ?? !args.startTime;
    const merged = {
      allDay,
      startTime: args.startTime,
      duration: args.duration ?? (allDay ? undefined : DEFAULT_MINUTES),
      recurrence: args.recurrence,
    };
    const bad = shapeError(merged);
    if (bad) return { error: bad };
    if (args.endDate && args.endDate < args.startDate) {
      return { error: 'endDate must not be before startDate' };
    }
    const repeat = args.recurrence ? `, ${describeRule(args.recurrence)}` : '';
    return {
      args,
      summary: `Create event "${args.title}" on ${args.startDate}, ${describeWhen(merged)}${repeat}`,
    };
  }

  if (name === 'cancel_occurrence' || name === 'move_occurrence') {
    const args = parsed.data as z.infer<typeof cancelOccurrenceArgs | typeof moveOccurrenceArgs>;
    const series = await findEvent(args.eventId, userId);
    if (!series) return { error: NOT_FOUND };
    if (!series.recurrence) {
      return { error: 'This event does not repeat; use update_event or delete_event.' };
    }
    const found = await findOccurrence(userId, args.eventId, args.date);
    if (!found) return { error: `"${series.title}" has no occurrence on ${args.date}.` };

    if (name === 'cancel_occurrence') {
      return { args, summary: `Skip "${series.title}" on ${args.date}` };
    }
    const move = args as z.infer<typeof moveOccurrenceArgs>;
    const to = [move.newDate ?? args.date, move.startTime].filter(Boolean).join(' ');
    const length = move.duration ? ` (${move.duration} min)` : '';
    return { args, summary: `Move "${series.title}" ${args.date} → ${to}${length}` };
  }

  const { id } = parsed.data as { id: string };
  const event = await findEvent(id, userId);
  if (!event) return { error: NOT_FOUND };

  if (name === 'delete_event') {
    const scope = event.recurrence ? ' and all its occurrences' : '';
    return { args: parsed.data, summary: `Delete event "${event.title}"${scope}` };
  }

  const args = parsed.data as z.infer<typeof updateEventArgs>;

  // Judge the event as it will be, not just the fields passed.
  const allDay = wantsAllDay(args, event.allDay);
  const merged = {
    allDay,
    startTime: allDay ? undefined : (args.startTime ?? event.startTime),
    duration: allDay ? undefined : (args.duration ?? event.duration ?? DEFAULT_MINUTES),
    recurrence: args.recurrence === undefined ? event.recurrence : args.recurrence,
  };
  const bad = shapeError(merged);
  if (bad) return { error: bad };

  const start = args.startDate ?? ymdOf(event.startDate);
  const end = args.endDate === undefined ? ymdOf(event.endDate) : args.endDate;
  if (merged.recurrence && start && end && end < start) {
    return { error: 'endDate must not be before startDate' };
  }

  const parts: string[] = [];
  if (args.title !== undefined) parts.push(`rename to "${args.title}"`);
  if (args.startDate !== undefined) parts.push(`start ${args.startDate}`);
  if (args.endDate !== undefined) parts.push(args.endDate ? `until ${args.endDate}` : 'no end');
  if (allDay && args.allDay === true) parts.push('all day');
  else if (args.startTime !== undefined || args.duration !== undefined || args.allDay === false) {
    parts.push(describeWhen({ startTime: merged.startTime, duration: merged.duration }));
  }
  if (args.recurrence !== undefined) parts.push(describeRule(args.recurrence));
  if (args.busy !== undefined) parts.push(args.busy ? 'busy' : 'not busy');
  if (args.tagId !== undefined) parts.push('new category');
  if (args.note !== undefined) parts.push(args.note ? 'new note' : 'clear note');
  return { args, summary: `Edit event "${event.title}": ${parts.join(', ')}` };
}

async function pickCategory(userId: string, tagId?: string) {
  const categories = await CategoryModel.find({ userId }).sort({ createdAt: 1 });
  return categories.find((c) => c._id.toString() === tagId) ?? categories[0] ?? null;
}

export async function executeEventAction(
  name: EventWriteToolName,
  args: Record<string, unknown>,
  userId: string,
): Promise<Result> {
  if (name === 'create_event') {
    const input = args as z.infer<typeof createEventArgs>;
    const tag = await pickCategory(userId, input.tagId);
    if (!tag) return { ok: false, message: 'Create a category first.' };
    const allDay = input.allDay ?? !input.startTime;

    const event = await EventModel.create({
      userId,
      title: input.title,
      note: input.note,
      tagId: tag._id.toString(),
      color: DEFAULT_COLOR,
      icon: DEFAULT_ICON,
      allDay,
      startTime: allDay ? undefined : input.startTime,
      duration: allDay ? undefined : (input.duration ?? DEFAULT_MINUTES),
      startDate: new Date(input.startDate),
      // An end date only bounds a repeating rule.
      endDate: input.recurrence && input.endDate ? new Date(input.endDate) : undefined,
      recurrence: input.recurrence && { interval: 1, ...input.recurrence },
      busy: input.busy ?? true,
    });
    return {
      ok: true,
      message: `Created event "${event.title}" on ${input.startDate}, ${describeWhen({ startTime: event.startTime, duration: event.duration, allDay })}.`,
      target: eventTarget(event, input.startDate),
    };
  }

  if (name === 'cancel_occurrence' || name === 'move_occurrence') {
    const input = args as z.infer<typeof moveOccurrenceArgs>;
    const series = await findEvent(input.eventId, userId);
    if (!series?.recurrence) return { ok: false, message: 'Event not found.' };
    const found = await findOccurrence(userId, input.eventId, input.date);
    if (!found) return { ok: false, message: `No occurrence on ${input.date}.` };

    if (name === 'cancel_occurrence') {
      await applyEventOverride(userId, series._id, {
        date: found.originalDate,
        cancelled: true,
        newDate: input.date,
      });
      return {
        ok: true,
        message: `Skipped "${series.title}" on ${input.date}.`,
        target: eventTarget(series, input.date),
      };
    }
    await applyEventOverride(userId, series._id, {
      date: found.originalDate,
      cancelled: false,
      newDate: input.newDate ?? input.date,
      startTime: input.startTime,
      duration: input.duration,
    });
    const to = [input.newDate ?? input.date, input.startTime].filter(Boolean).join(' ');
    return {
      ok: true,
      message: `Moved "${series.title}" from ${input.date} to ${to}.`,
      target: eventTarget(series, input.newDate ?? input.date),
    };
  }

  const { id } = args as { id: string };

  if (name === 'delete_event') {
    const event = await EventModel.findOneAndUpdate(
      { _id: id, userId, active: true, seriesRef: { $exists: false } },
      { $set: { active: false } },
      { new: true },
    ).catch(() => null);
    if (!event) return { ok: false, message: 'Event not found.' };
    // Overrides only exist to amend this series — retire them together.
    await EventModel.updateMany({ userId, seriesRef: id }, { $set: { active: false } });
    return { ok: true, message: `Deleted event "${event.title}".` };
  }

  const input = args as z.infer<typeof updateEventArgs>;
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  const put = (key: string, value: unknown) => {
    if (value === null) unset[key] = 1;
    else if (value !== undefined) set[key] = value;
  };
  put('title', input.title);
  put('note', input.note);
  put('busy', input.busy);
  put('startDate', input.startDate ? new Date(input.startDate) : undefined);
  put('endDate', input.endDate ? new Date(input.endDate) : input.endDate);

  if (input.recurrence === null) {
    unset.recurrence = 1;
    // A one-off cannot carry the end bound of a rule that no longer exists.
    unset.endDate = 1;
    delete set.endDate;
  } else if (input.recurrence) {
    set.recurrence = { interval: 1, ...input.recurrence };
  }

  const current = await findEvent(id, userId);
  if (!current) return { ok: false, message: 'Event not found.' };
  const allDay = wantsAllDay(input, current.allDay);
  if (allDay !== current.allDay) set.allDay = allDay;
  if (allDay) {
    // Both fields go together.
    unset.startTime = 1;
    unset.duration = 1;
  } else {
    put('startTime', input.startTime);
    put('duration', input.duration);
    // Turning an all-day event into a timed one needs a length even if none was passed.
    if (current.allDay && input.duration === undefined) set.duration = DEFAULT_MINUTES;
  }

  if (input.tagId !== undefined) {
    const tag = await CategoryModel.findOne({ _id: input.tagId, userId }).catch(() => null);
    if (!tag) return { ok: false, message: 'That category was not found.' };
    set.tagId = tag._id.toString();
  }

  const event = await EventModel.findOneAndUpdate(
    { _id: id, userId, active: true, seriesRef: { $exists: false } },
    {
      ...(Object.keys(set).length > 0 && { $set: set }),
      ...(Object.keys(unset).length > 0 && { $unset: unset }),
    },
    { new: true, runValidators: true },
  ).catch(() => null);
  if (!event) return { ok: false, message: 'Event not found.' };

  // A one-off has no occurrences to amend, and a leftover override would keep
  // showing on the calendar as a ghost.
  if (input.recurrence === null) {
    await EventModel.updateMany({ userId, seriesRef: id }, { $set: { active: false } });
  }
  return {
    ok: true,
    message: `Updated event "${event.title}".`,
    target: eventTarget(event, ymdOf(event.startDate)),
  };
}
