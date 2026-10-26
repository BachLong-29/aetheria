import { z } from 'zod';

import { CategoryModel } from '@/server/models/category.model';
import { HabitModel } from '@/server/models/habit.model';
import { HabitLogModel } from '@/server/models/habit-log.model';
import type { IHabit } from '@/server/models/habit.model';
import type { AgentTarget } from '@/types/agent';
import { diacriticRegex } from '@/libs/utils';

/**
 * Habit tools for the assistant. Same contract as the task tools in `tools.ts`:
 * reads run at once, writes are only proposed and run after the user confirms,
 * and every lookup is scoped to the caller.
 */

const HABIT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULT_COLOR = 'gold';
const DEFAULT_ICON = '🔁';

const scheduleArg = z
  .array(
    z.object({
      days: z.array(z.enum(HABIT_DAYS)).min(1).describe('Weekdays, e.g. ["mon","wed","fri"]'),
      time: z.string().regex(TIME_RE, 'Use 24-hour HH:MM').describe('24-hour HH:MM'),
    }),
  )
  .min(1)
  .describe('When the habit happens: one entry per time of day, each with its weekdays');

const habitId = z.string().min(1).describe('Habit id from list_habits');

const listHabitsArgs = z.object({
  q: z.string().max(100).optional().describe('Search text in the habit name'),
  includeInactive: z
    .boolean()
    .optional()
    .describe('Also list paused habits (default true; each row says whether it is active)'),
});

const createHabitArgs = z.object({
  name: z.string().min(1).max(100).describe('Short habit name'),
  schedule: scheduleArg,
  duration: z.number().int().min(1).max(1440).optional().describe('Minutes per session'),
  tagId: z
    .string()
    .optional()
    .describe('Category id from list_categories. Omit to use the first category.'),
  note: z.string().max(500).optional(),
});

const updateHabitArgs = z
  .object({
    id: habitId,
    name: z.string().min(1).max(100).optional().describe('New name'),
    schedule: scheduleArg.optional().describe('New full schedule; replaces the old one'),
    duration: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .nullable()
      .optional()
      .describe('New minutes per session. null clears it.'),
    tagId: z.string().optional().describe('New category id from list_categories'),
    note: z.string().max(500).nullable().optional().describe('New note. null clears it.'),
  })
  .refine(
    (args) =>
      Object.keys(args).some((key) => key !== 'id' && args[key as keyof typeof args] !== undefined),
    { message: 'Give at least one field to change' },
  );

const deleteHabitArgs = z.object({ id: habitId });

const setHabitActiveArgs = z.object({
  id: habitId,
  active: z.boolean().describe('false pauses the habit, true resumes it'),
});

export const HABIT_READ_TOOLS = {
  list_habits: {
    description: "List the user's habits: id, name, schedule (weekdays + time), duration, active.",
    schema: listHabitsArgs,
  },
} as const;

export const HABIT_WRITE_TOOLS = {
  create_habit: {
    description: 'Propose creating a habit. The user must confirm before it is saved.',
    schema: createHabitArgs,
  },
  update_habit: {
    description:
      'Propose editing a habit: only the fields passed change; schedule replaces the whole schedule. The user must confirm.',
    schema: updateHabitArgs,
  },
  set_habit_active: {
    description:
      'Propose pausing (active false) or resuming (active true) a habit. Paused habits keep their history but stop appearing in quests and stats. The user must confirm.',
    schema: setHabitActiveArgs,
  },
  delete_habit: {
    description:
      'Propose deleting a habit for good, with its whole check-in history. Only when the user clearly asks to delete; to stop it for a while use set_habit_active. The user must confirm.',
    schema: deleteHabitArgs,
  },
} as const;

export type HabitReadToolName = keyof typeof HABIT_READ_TOOLS;
export type HabitWriteToolName = keyof typeof HABIT_WRITE_TOOLS;

type Proposal = { args: Record<string, unknown>; summary: string } | { error: string };
type Result = { ok: boolean; message: string; target?: AgentTarget };

const habitTarget = (habit: { _id: unknown; name: string }): AgentTarget => ({
  kind: 'habit',
  id: String(habit._id),
  label: habit.name,
});

const NOT_FOUND = 'Habit not found. Look it up with list_habits.';

function findHabit(id: string, userId: string) {
  return HabitModel.findOne({ _id: id, userId }).catch(() => null);
}

/** `mon,wed 06:30; sat 08:00` — short enough for a confirm card. */
function describeSchedule(schedule: { days: readonly string[]; time: string }[]): string {
  return schedule.map((entry) => `${entry.days.join(',')} ${entry.time}`).join('; ');
}

function brief(habit: IHabit) {
  return {
    id: habit._id.toString(),
    name: habit.name,
    schedule: habit.schedule.map((e) => ({ days: e.days, time: e.time })),
    duration: habit.duration,
    tagId: habit.tagId,
    active: habit.active,
  };
}

/** A category of the caller's: the named one, else their first. */
async function pickCategory(userId: string, tagId?: string) {
  const categories = await CategoryModel.find({ userId }).sort({ createdAt: 1 });
  return categories.find((c) => c._id.toString() === tagId) ?? categories[0] ?? null;
}

export async function runHabitReadTool(
  name: HabitReadToolName,
  rawArgs: unknown,
  userId: string,
): Promise<unknown> {
  const parsed = HABIT_READ_TOOLS[name].schema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };

  const args = parsed.data;
  const filter: Record<string, unknown> = { userId };
  if (args.includeInactive === false) filter.active = true;
  if (args.q) filter.name = { $regex: diacriticRegex(args.q), $options: 'i' };
  const habits = await HabitModel.find(filter).sort({ createdAt: 1 }).limit(50);
  return habits.map(brief);
}

export async function proposeHabitAction(
  name: HabitWriteToolName,
  rawArgs: unknown,
  userId: string,
): Promise<Proposal> {
  const parsed = HABIT_WRITE_TOOLS[name].schema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };

  if (name === 'create_habit') {
    const args = parsed.data as z.infer<typeof createHabitArgs>;
    const length = args.duration ? ` (${args.duration} min)` : '';
    return {
      args,
      summary: `Create habit "${args.name}": ${describeSchedule(args.schedule)}${length}`,
    };
  }

  const { id } = parsed.data as { id: string };
  const habit = await findHabit(id, userId);
  if (!habit) return { error: NOT_FOUND };

  if (name === 'update_habit') {
    const args = parsed.data as z.infer<typeof updateHabitArgs>;
    const parts: string[] = [];
    if (args.name !== undefined) parts.push(`rename to "${args.name}"`);
    if (args.schedule !== undefined) parts.push(describeSchedule(args.schedule));
    if (args.duration !== undefined) {
      parts.push(args.duration ? `${args.duration} min` : 'no duration');
    }
    if (args.tagId !== undefined) parts.push('new category');
    if (args.note !== undefined) parts.push(args.note ? 'new note' : 'clear note');
    return { args, summary: `Edit habit "${habit.name}": ${parts.join(', ')}` };
  }

  if (name === 'set_habit_active') {
    const args = parsed.data as z.infer<typeof setHabitActiveArgs>;
    if (habit.active === args.active) {
      return { error: `"${habit.name}" is already ${args.active ? 'active' : 'paused'}.` };
    }
    return {
      args,
      summary: `${args.active ? 'Resume' : 'Pause'} habit "${habit.name}"`,
    };
  }

  return {
    args: parsed.data,
    summary: `Delete habit "${habit.name}" and its history for good`,
  };
}

export async function executeHabitAction(
  name: HabitWriteToolName,
  args: Record<string, unknown>,
  userId: string,
): Promise<Result> {
  if (name === 'create_habit') {
    const input = args as z.infer<typeof createHabitArgs>;
    const tag = await pickCategory(userId, input.tagId);
    if (!tag) return { ok: false, message: 'Create a category first.' };
    const habit = await HabitModel.create({
      userId,
      name: input.name,
      schedule: input.schedule,
      duration: input.duration,
      note: input.note,
      tagId: tag._id.toString(),
      color: DEFAULT_COLOR,
      icon: DEFAULT_ICON,
    });
    return { ok: true, message: `Created habit "${habit.name}".`, target: habitTarget(habit) };
  }

  const { id } = args as { id: string };

  if (name === 'update_habit') {
    const input = args as z.infer<typeof updateHabitArgs>;
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    // null clears a field, as on the task edit.
    const put = (key: string, value: unknown) => {
      if (value === null) unset[key] = 1;
      else if (value !== undefined) set[key] = value;
    };
    put('name', input.name);
    put('schedule', input.schedule);
    put('duration', input.duration);
    put('note', input.note);

    if (input.tagId !== undefined) {
      const tag = await CategoryModel.findOne({ _id: input.tagId, userId }).catch(() => null);
      if (!tag) return { ok: false, message: 'That category was not found.' };
      set.tagId = tag._id.toString();
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;

    const habit = await HabitModel.findOneAndUpdate({ _id: id, userId }, update, {
      new: true,
    }).catch(() => null);
    if (!habit) return { ok: false, message: 'Habit not found.' };
    return { ok: true, message: `Updated habit "${habit.name}".`, target: habitTarget(habit) };
  }

  if (name === 'set_habit_active') {
    const { active } = args as z.infer<typeof setHabitActiveArgs>;
    const habit = await HabitModel.findOneAndUpdate(
      { _id: id, userId },
      { $set: { active } },
      { new: true },
    ).catch(() => null);
    if (!habit) return { ok: false, message: 'Habit not found.' };
    return {
      ok: true,
      message: `${active ? 'Resumed' : 'Paused'} habit "${habit.name}".`,
      target: habitTarget(habit),
    };
  }

  // Same as DELETE /habits/:id: gone for good, and its logs with it.
  const habit = await HabitModel.findOneAndDelete({ _id: id, userId }).catch(() => null);
  if (!habit) return { ok: false, message: 'Habit not found.' };
  await HabitLogModel.deleteMany({ userId, habitId: id });
  return { ok: true, message: `Deleted habit "${habit.name}".` };
}
