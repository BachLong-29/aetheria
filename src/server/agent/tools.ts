import { z } from 'zod';

import { CategoryModel } from '@/server/models/category.model';
import { ScheduleBlockModel } from '@/server/models/schedule-block.model';
import type { IScheduleBlock } from '@/server/models/schedule-block.model';
import { TaskModel } from '@/server/models/task.model';
import type { ITask } from '@/server/models/task.model';

import {
  HABIT_READ_TOOLS,
  HABIT_WRITE_TOOLS,
  executeHabitAction,
  proposeHabitAction,
  runHabitReadTool,
  type HabitReadToolName,
  type HabitWriteToolName,
} from './habit-tools';
import {
  EVENT_READ_TOOLS,
  EVENT_WRITE_TOOLS,
  executeEventAction,
  proposeEventAction,
  runEventReadTool,
  type EventReadToolName,
  type EventWriteToolName,
} from './event-tools';
import type { AgentTarget } from '@/types/agent';

import type { ToolSpec } from './llm';
import {
  NOTE_READ_TOOLS,
  NOTE_WRITE_TOOLS,
  executeNoteAction,
  proposeNoteAction,
  runNoteReadTool,
  type NoteReadToolName,
  type NoteWriteToolName,
} from './note-tools';
import {
  PLAN_READ_TOOLS,
  PLAN_WRITE_TOOLS,
  planSchedule,
  runPlanReadTool,
  type PlanContext,
  type PlanReadToolName,
  type PlanWriteToolName,
} from './plan-tools';
import { diacriticRegex } from '@/libs/utils';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const listTasksArgs = z.object({
  start: ymd.optional().describe('First day to include, YYYY-MM-DD'),
  end: ymd.optional().describe('Last day to include, YYYY-MM-DD'),
  q: z.string().max(100).optional().describe('Search text in the task name'),
  limit: z.number().int().min(1).max(50).optional().describe('Max results, default 20'),
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A session with no stated length is booked for this long. */
const DEFAULT_SESSION_MINUTES = 60;

const createTaskArgs = z
  .object({
    name: z.string().min(1).max(100).describe('Short task title'),
    tagId: z
      .string()
      .optional()
      .describe('Category id from list_categories. Omit to use the first category.'),
    startDate: ymd.optional().describe('Day the task starts, YYYY-MM-DD'),
    endDate: ymd.optional().describe('Last day, YYYY-MM-DD. Omit for a single-day task.'),
    startTime: z
      .string()
      .regex(TIME_RE, 'Use 24-hour HH:MM')
      .optional()
      .describe(
        'Time of day the user wants to do it, 24-hour HH:MM (10am = "10:00"). When set, a session is booked on startDate at this time. Omit when the user gave no time.',
      ),
    duration: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .optional()
      .describe('Minutes. Also the session length when startTime is set (default 60).'),
    note: z.string().max(500).optional(),
  })
  .refine((args) => !args.startTime || Boolean(args.startDate), {
    message: 'startDate is required when startTime is given',
    path: ['startDate'],
  });

const completeTaskArgs = z.object({
  id: z.string().min(1).describe('Task id from list_tasks'),
});

/** Statuses the assistant may set through an edit. Done goes through complete_task. */
const EDIT_STATUSES = ['todo', 'in_progress', 'pending', 'waiting'] as const;

const updateTaskArgs = z
  .object({
    id: z.string().min(1).describe('Task id from list_tasks'),
    name: z.string().min(1).max(100).optional().describe('New title'),
    tagId: z.string().optional().describe('New category id from list_categories'),
    startDate: ymd.optional().describe('New start day, YYYY-MM-DD'),
    endDate: ymd
      .nullable()
      .optional()
      .describe('New last day, YYYY-MM-DD. null makes it a single-day task.'),
    startTime: z
      .string()
      .regex(TIME_RE, 'Use 24-hour HH:MM')
      .optional()
      .describe(
        'New time of day, 24-hour HH:MM. Single-day tasks only: their sessions move to this time, or one is booked if there is none. For a multi-day task use update_session.',
      ),
    duration: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .nullable()
      .optional()
      .describe(
        'New length in minutes. null clears it. On a single-day task its sessions take it too.',
      ),
    status: z
      .enum(EDIT_STATUSES)
      .optional()
      .describe('New status. To finish a task use complete_task instead.'),
    note: z.string().max(500).nullable().optional().describe('New note. null clears it.'),
  })
  .refine(
    (args) =>
      Object.keys(args).some((key) => key !== 'id' && args[key as keyof typeof args] !== undefined),
    { message: 'Give at least one field to change' },
  );

const deleteTaskArgs = z.object({
  id: z.string().min(1).describe('Task id from list_tasks'),
});

const listSessionsArgs = z.object({
  taskId: z.string().min(1).describe('Task id from list_tasks'),
});

const minutesArg = z.number().int().min(1).max(1440);

const createSessionArgs = z.object({
  taskId: z.string().min(1).describe('Task id from list_tasks'),
  date: ymd.describe('Day of the session, YYYY-MM-DD, within the task range'),
  startTime: z.string().regex(TIME_RE, 'Use 24-hour HH:MM').describe('24-hour HH:MM'),
  duration: minutesArg.optional().describe('Minutes, default the task duration or 60'),
});

const updateSessionArgs = z
  .object({
    id: z.string().min(1).describe('Session id from list_sessions'),
    date: ymd.optional().describe('New day, YYYY-MM-DD, within the task range'),
    startTime: z.string().regex(TIME_RE, 'Use 24-hour HH:MM').optional().describe('New HH:MM'),
    duration: minutesArg.optional().describe('New length in minutes'),
  })
  .refine((a) => a.date !== undefined || a.startTime !== undefined || a.duration !== undefined, {
    message: 'Give at least one field to change',
  });

const deleteSessionArgs = z.object({
  id: z.string().min(1).describe('Session id from list_sessions'),
});

const noArgs = z.object({});

const DEFAULT_COLOR = 'gold';
const DEFAULT_ICON = '📝';

/** Tools the assistant may run on its own — they only read. */
const READ_TOOLS = {
  list_tasks: {
    description: "List the user's tasks, optionally within a date range or matching a search text.",
    schema: listTasksArgs,
  },
  list_categories: {
    description: "List the user's task categories (id and name). Call before create_task.",
    schema: noArgs,
  },
  list_sessions: {
    description:
      'List the sessions (booked time slots) of one task: id, date, startTime, duration, status.',
    schema: listSessionsArgs,
  },
} as const;

/** Tools that change data. The assistant only proposes them; the user confirms. */
const WRITE_TOOLS = {
  create_task: {
    description: 'Propose creating a task. The user must confirm before it is saved.',
    schema: createTaskArgs,
  },
  complete_task: {
    description: 'Propose marking a single-day task as done. The user must confirm.',
    schema: completeTaskArgs,
  },
  update_task: {
    description:
      'Propose editing a task: only the fields passed change. The user must confirm before it is saved.',
    schema: updateTaskArgs,
  },
  delete_task: {
    description:
      'Propose deleting a task and the sessions booked for it. The user must confirm. Only when the user clearly asks to delete.',
    schema: deleteTaskArgs,
  },
  create_session: {
    description:
      'Propose booking one more session for a task on a day inside its range. The user must confirm.',
    schema: createSessionArgs,
  },
  update_session: {
    description:
      'Propose moving or resizing one session (from list_sessions). The user must confirm.',
    schema: updateSessionArgs,
  },
  delete_session: {
    description: 'Propose removing one session of a task. The user must confirm.',
    schema: deleteSessionArgs,
  },
} as const;

export type ReadToolName =
  | keyof typeof READ_TOOLS
  | HabitReadToolName
  | PlanReadToolName
  | NoteReadToolName
  | EventReadToolName;
export type WriteToolName =
  | keyof typeof WRITE_TOOLS
  | HabitWriteToolName
  | PlanWriteToolName
  | NoteWriteToolName
  | EventWriteToolName;

const isPlanRead = (name: string): name is PlanReadToolName => name in PLAN_READ_TOOLS;
const isPlanWrite = (name: string): name is PlanWriteToolName => name in PLAN_WRITE_TOOLS;

const isHabitRead = (name: string): name is HabitReadToolName => name in HABIT_READ_TOOLS;
const isHabitWrite = (name: string): name is HabitWriteToolName => name in HABIT_WRITE_TOOLS;
const isEventRead = (name: string): name is EventReadToolName => name in EVENT_READ_TOOLS;
const isEventWrite = (name: string): name is EventWriteToolName => name in EVENT_WRITE_TOOLS;
const isNoteRead = (name: string): name is NoteReadToolName => name in NOTE_READ_TOOLS;
const isNoteWrite = (name: string): name is NoteWriteToolName => name in NOTE_WRITE_TOOLS;

export type PendingAction = {
  tool: WriteToolName;
  args: Record<string, unknown>;
  /** One line for the confirm button, e.g. `Create "Study" on 2026-10-16`. */
  summary: string;
};

function spec(name: string, tool: { description: string; schema: z.ZodType }): ToolSpec {
  const parameters = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  // Not every provider accepts these keys; validation happens server-side with zod anyway.
  delete parameters.$schema;
  delete parameters.additionalProperties;
  return { type: 'function', function: { name, description: tool.description, parameters } };
}

/** The one tool that is neither a read nor a write: it ends the turn with a question. */
export const ASK_USER_TOOL = 'ask_user';

const askUserArgs = z.object({
  question: z.string().trim().min(1).max(240).describe('One short question'),
  options: z
    .array(z.string().trim().min(1).max(60))
    .min(2)
    .max(5)
    .describe('2 to 5 short answers the user can tap, e.g. ["Tomorrow", "Friday"]'),
});

const ASK_USER_SPEC: ToolSpec = spec(ASK_USER_TOOL, {
  description:
    'Ask the user one short question with quick-reply buttons. Use it instead of guessing when a detail is ambiguous, two readings are possible, or the user sounds unsure (for example "tomorrow or Friday?"). The turn ends and the chosen option comes back as their next message.',
  schema: askUserArgs,
});

/** Longest quick reply kept, and the most buttons shown. */
const MAX_CHOICE_CHARS = 60;
const MAX_CHOICES = 5;

/**
 * Validates an `ask_user` call. Lenient on the options on purpose: blanks, repeats and
 * over-long entries are cleaned rather than failing the whole question, which a small model
 * would otherwise repeat until the turn runs out.
 */
export function parseAskUser(
  rawArgs: unknown,
): { question: string; choices: string[] } | { error: string } {
  const parsed = z
    .object({ question: z.string().trim().min(1), options: z.array(z.string()) })
    .safeParse(rawArgs);
  if (!parsed.success) return { error: 'Give a question and a list of options.' };

  const choices = [
    ...new Set(
      parsed.data.options
        .map((option) => option.trim().slice(0, MAX_CHOICE_CHARS))
        .filter((option) => option.length > 0),
    ),
  ].slice(0, MAX_CHOICES);
  if (choices.length < 2) return { error: 'Give at least two different options.' };

  return { question: parsed.data.question.slice(0, 240), choices };
}

export const TOOL_SPECS: ToolSpec[] = [
  ASK_USER_SPEC,
  ...Object.entries(READ_TOOLS).map(([name, tool]) => spec(name, tool)),
  ...Object.entries(HABIT_READ_TOOLS).map(([name, tool]) => spec(name, tool)),
  ...Object.entries(PLAN_READ_TOOLS).map(([name, tool]) => spec(name, tool)),
  ...Object.entries(NOTE_READ_TOOLS).map(([name, tool]) => spec(name, tool)),
  ...Object.entries(EVENT_READ_TOOLS).map(([name, tool]) => spec(name, tool)),
  ...Object.entries(WRITE_TOOLS).map(([name, tool]) => spec(name, tool)),
  ...Object.entries(HABIT_WRITE_TOOLS).map(([name, tool]) => spec(name, tool)),
  ...Object.entries(PLAN_WRITE_TOOLS).map(([name, tool]) => spec(name, tool)),
  ...Object.entries(NOTE_WRITE_TOOLS).map(([name, tool]) => spec(name, tool)),
  ...Object.entries(EVENT_WRITE_TOOLS).map(([name, tool]) => spec(name, tool)),
];

export function isReadTool(name: string): name is ReadToolName {
  return (
    name in READ_TOOLS ||
    isHabitRead(name) ||
    isPlanRead(name) ||
    isNoteRead(name) ||
    isEventRead(name)
  );
}

export function isWriteTool(name: string): name is WriteToolName {
  return (
    name in WRITE_TOOLS ||
    isHabitWrite(name) ||
    isPlanWrite(name) ||
    isNoteWrite(name) ||
    isEventWrite(name)
  );
}

function brief(task: ITask) {
  return {
    id: task._id.toString(),
    name: task.name,
    status: task.status,
    startDate: task.startDate?.toISOString().slice(0, 10),
    endDate: task.endDate?.toISOString().slice(0, 10),
    duration: task.duration,
    tagId: task.tagId,
  };
}

/** Runs a read tool for `userId`. Bad arguments come back as an error object for the model. */
export async function runReadTool(
  name: ReadToolName,
  rawArgs: unknown,
  userId: string,
  ctx: PlanContext,
): Promise<unknown> {
  if (isHabitRead(name)) return runHabitReadTool(name, rawArgs, userId);
  if (isPlanRead(name)) return runPlanReadTool(name, rawArgs, userId, ctx);
  if (isNoteRead(name)) return runNoteReadTool(name, rawArgs, userId);
  if (isEventRead(name)) return runEventReadTool(name, rawArgs, userId);

  const parsed = READ_TOOLS[name].schema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };

  if (name === 'list_categories') {
    const categories = await CategoryModel.find({ userId }).sort({ createdAt: 1 });
    return categories.map((c) => ({ id: c._id.toString(), name: c.name }));
  }

  if (name === 'list_sessions') {
    const { taskId } = parsed.data as z.infer<typeof listSessionsArgs>;
    const task = await findTask(taskId, userId);
    if (!task) return { error: 'Task not found. Look it up with list_tasks.' };
    return (await sessionsOf(task._id, userId)).map(sessionBrief);
  }

  const args = parsed.data as z.infer<typeof listTasksArgs>;
  const filter: Record<string, unknown> = { userId, active: true };
  if (args.q) filter.name = { $regex: diacriticRegex(args.q), $options: 'i' };
  // A task belongs to the range if any of its days fall in it — a multi-day
  // task that began last week is still on this week's list.
  if (args.end) {
    filter.startDate = { $lt: new Date(new Date(args.end).getTime() + 86_400_000) };
  }
  if (args.start) {
    const from = new Date(args.start);
    filter.$or = [{ endDate: { $gte: from } }, { endDate: null, startDate: { $gte: from } }];
  }
  const tasks = await TaskModel.find(filter)
    .sort({ startDate: 1 })
    .limit(args.limit ?? 20);
  return tasks.map(brief);
}

const ymdOf = (date?: Date | null) => date?.toISOString().slice(0, 10);

/** The caller's live task, or null — a bad id from the model is just "not found". */
function findTask(id: string, userId: string) {
  return TaskModel.findOne({ _id: id, userId, active: true }).catch(() => null);
}

/** A task's sessions, in time order. */
function sessionsOf(taskId: ITask['_id'], userId: string) {
  return ScheduleBlockModel.find({ userId, sourceType: 'task', sourceId: taskId }).sort({
    date: 1,
    startTime: 1,
  });
}

function sessionBrief(block: IScheduleBlock) {
  return {
    id: block._id.toString(),
    date: ymdOf(block.date),
    startTime: block.startTime,
    duration: block.duration,
    status: block.status,
  };
}

/** A session of the caller's, with the live task it belongs to. */
async function findSession(id: string, userId: string) {
  const block = await ScheduleBlockModel.findOne({ _id: id, userId, sourceType: 'task' }).catch(
    () => null,
  );
  if (!block) return null;
  const task = await findTask(block.sourceId.toString(), userId);
  return task ? { block, task } : null;
}

/** The days a session may sit on: the task's range, or anywhere when it has no date. */
function outsideRange(task: ITask, date: string): string | null {
  const start = ymdOf(task.startDate);
  if (!start) return null;
  const end = ymdOf(task.endDate) ?? start;
  if (date < start || date > end) {
    return start === end
      ? `The session must be on ${start}, the task's day.`
      : `The session must fall between ${start} and ${end}.`;
  }
  return null;
}

const isMultiDay = (start?: string | null, end?: string | null) =>
  Boolean(start && end && end > start);

const slot = (block: IScheduleBlock) => `${ymdOf(block.date)} ${block.startTime}`;

/** What an edit changes, in words, for the confirm card. */
function describeEdit(args: z.infer<typeof updateTaskArgs>): string {
  const parts: string[] = [];
  if (args.name !== undefined) parts.push(`rename to "${args.name}"`);
  if (args.startDate !== undefined) parts.push(`start ${args.startDate}`);
  if (args.endDate !== undefined) parts.push(args.endDate ? `end ${args.endDate}` : 'single day');
  if (args.startTime !== undefined) parts.push(`at ${args.startTime}`);
  if (args.duration !== undefined) {
    parts.push(args.duration ? `${args.duration} min` : 'no duration');
  }
  if (args.status !== undefined) parts.push(`status ${args.status}`);
  if (args.tagId !== undefined) parts.push('new category');
  if (args.note !== undefined) parts.push(args.note ? 'new note' : 'clear note');
  return parts.join(', ');
}

/**
 * Validates a proposed write and turns it into something the user can confirm.
 * Writes on an existing task look it up, so the card can name it and a bad id
 * goes back to the model instead of reaching the user.
 */
export async function proposeAction(
  name: WriteToolName,
  rawArgs: unknown,
  userId: string,
): Promise<PendingAction | { error: string }> {
  if (isPlanWrite(name)) {
    return { error: 'plan_schedule expands into other actions; use proposeActions.' };
  }

  if (isHabitWrite(name)) {
    const proposal = await proposeHabitAction(name, rawArgs, userId);
    return 'error' in proposal ? proposal : { tool: name, ...proposal };
  }

  if (isNoteWrite(name)) {
    const proposal = proposeNoteAction(name, rawArgs);
    return 'error' in proposal ? proposal : { tool: name, ...proposal };
  }

  if (isEventWrite(name)) {
    const proposal = await proposeEventAction(name, rawArgs, userId);
    return 'error' in proposal ? proposal : { tool: name, ...proposal };
  }

  const parsed = WRITE_TOOLS[name].schema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };

  if (name === 'create_task') {
    const args = parsed.data as z.infer<typeof createTaskArgs>;
    if (args.startDate && args.endDate && args.endDate < args.startDate) {
      return { error: 'endDate must not be before startDate' };
    }
    const day = args.startDate ? ` on ${args.startDate}` : '';
    const at = args.startTime ? ` at ${args.startTime}` : '';
    const minutes = args.startTime ? (args.duration ?? DEFAULT_SESSION_MINUTES) : args.duration;
    const length = minutes ? ` (${minutes} min)` : '';
    return { tool: name, args, summary: `Create "${args.name}"${day}${at}${length}` };
  }

  if (name === 'update_task') {
    const args = parsed.data as z.infer<typeof updateTaskArgs>;
    const task = await findTask(args.id, userId);
    if (!task) return { error: 'Task not found. Look it up with list_tasks.' };

    // Check the range the task will end up with, not just the fields passed.
    const start = args.startDate ?? ymdOf(task.startDate);
    const end = args.endDate === undefined ? ymdOf(task.endDate) : args.endDate;
    if (start && end && end < start) return { error: 'endDate must not be before startDate' };
    if (args.startTime && isMultiDay(start, end)) {
      return { error: 'This task spans several days; change its sessions with update_session.' };
    }
    if (args.startTime && !start) return { error: 'startDate is required when startTime is given' };

    let sessions = '';
    if (!isMultiDay(start, end) && start) {
      const planned = await ScheduleBlockModel.countDocuments({
        userId,
        sourceType: 'task',
        sourceId: task._id,
        status: 'planned',
      });
      if (planned > 0)
        sessions = `; sessions → ${start}${args.startTime ? ` ${args.startTime}` : ''}`;
      else if (args.startTime) sessions = `; book ${start} ${args.startTime}`;
    }

    return { tool: name, args, summary: `Edit "${task.name}": ${describeEdit(args)}${sessions}` };
  }

  if (name === 'create_session') {
    const args = parsed.data as z.infer<typeof createSessionArgs>;
    const task = await findTask(args.taskId, userId);
    if (!task) return { error: 'Task not found. Look it up with list_tasks.' };
    const wrongDay = outsideRange(task, args.date);
    if (wrongDay) return { error: wrongDay };
    const minutes = args.duration ?? task.duration ?? DEFAULT_SESSION_MINUTES;
    return {
      tool: name,
      args,
      summary: `Book "${task.name}" on ${args.date} at ${args.startTime} (${minutes} min)`,
    };
  }

  if (name === 'update_session' || name === 'delete_session') {
    const args = parsed.data as z.infer<typeof updateSessionArgs | typeof deleteSessionArgs>;
    const found = await findSession(args.id, userId);
    if (!found) return { error: 'Session not found. Look it up with list_sessions.' };
    const { block, task } = found;

    if (name === 'delete_session') {
      return { tool: name, args, summary: `Remove "${task.name}" session ${slot(block)}` };
    }

    const edit = args as z.infer<typeof updateSessionArgs>;
    if (edit.date) {
      const wrongDay = outsideRange(task, edit.date);
      if (wrongDay) return { error: wrongDay };
    }
    const to = `${edit.date ?? ymdOf(block.date)} ${edit.startTime ?? block.startTime}`;
    const length = edit.duration ?? block.duration;
    return {
      tool: name,
      args,
      summary: `Move "${task.name}" session ${slot(block)} → ${to} (${length} min)`,
    };
  }

  const args = parsed.data as z.infer<typeof completeTaskArgs | typeof deleteTaskArgs>;
  const task = await findTask(args.id, userId);
  if (!task) return { error: 'Task not found. Look it up with list_tasks.' };

  if (name === 'delete_task') {
    return { tool: name, args, summary: `Delete "${task.name}"` };
  }
  return { tool: name, args, summary: `Mark "${task.name}" as done` };
}

/** Everything one write call turns into, plus what to tell the model about it. */
export type ProposedActions = { actions: PendingAction[]; note: unknown } | { error: string };

/**
 * `proposeAction` for one call. Almost every write is one action; `plan_schedule` is the
 * exception: it works out where a set of tasks go and proposes each placement, so the
 * user confirms the whole plan in one go.
 */
export async function proposeActions(
  name: WriteToolName,
  rawArgs: unknown,
  userId: string,
  ctx: PlanContext,
): Promise<ProposedActions> {
  if (!isPlanWrite(name)) {
    const proposal = await proposeAction(name, rawArgs, userId);
    if ('error' in proposal) return proposal;
    return {
      actions: [proposal],
      note: { status: 'proposed', note: 'Waiting for the user to confirm.' },
    };
  }

  const plan = await planSchedule(rawArgs, userId, ctx);
  if ('error' in plan) return plan;

  const actions: PendingAction[] = [];
  const placements: { task: string; date: string; startTime: string; minutes: number }[] = [];
  const unplaced = plan.unplaced.map((entry) => ({
    task: entry.task.name,
    reason: entry.reason,
  }));

  for (const placed of plan.placed) {
    // A multi-day task keeps its range and gets a session; anything else is dated to the slot.
    const tool: WriteToolName = placed.task.multiDay ? 'create_session' : 'update_task';
    const args = placed.task.multiDay
      ? {
          taskId: placed.task.id,
          date: placed.date,
          startTime: placed.startTime,
          duration: placed.minutes,
        }
      : {
          id: placed.task.id,
          startDate: placed.date,
          // A task that already ends on its own start day would otherwise end before it
          // starts once moved; `null` keeps it a plain single-day task.
          endDate: null,
          startTime: placed.startTime,
          duration: placed.minutes,
        };

    const proposal = await proposeAction(tool, args, userId);
    if ('error' in proposal) {
      unplaced.push({ task: placed.task.name, reason: proposal.error });
      continue;
    }

    actions.push({
      ...proposal,
      summary: `Plan "${placed.task.name}" -> ${placed.date} ${placed.startTime} (${placed.minutes} min)`,
    });
    placements.push({
      task: placed.task.name,
      date: placed.date,
      startTime: placed.startTime,
      minutes: placed.minutes,
    });
  }

  return {
    actions,
    note: {
      status: actions.length > 0 ? 'proposed' : 'nothing_placed',
      note: actions.length > 0 ? 'Waiting for the user to confirm.' : undefined,
      window: plan.window,
      // How full each day is: lets the assistant say why a day has nothing new on it.
      days: plan.days,
      placements,
      unplaced,
    },
  };
}

/** Where a confirmed task change can be opened from the chat. */
function taskTarget(task: { _id: unknown; name: string }, date?: string): AgentTarget {
  return { kind: 'task', id: String(task._id), label: task.name, ...(date ? { date } : {}) };
}

export type ExecuteResult = { ok: boolean; message: string; target?: AgentTarget };

/** Performs a confirmed write. Everything is re-validated and scoped to `userId`. */
export async function executeAction(
  name: string,
  rawArgs: unknown,
  userId: string,
): Promise<ExecuteResult> {
  if (!isWriteTool(name) || isPlanWrite(name)) {
    return { ok: false, message: `Unknown action: ${name}` };
  }

  const proposal = await proposeAction(name, rawArgs, userId);
  if ('error' in proposal) return { ok: false, message: proposal.error };

  if (isHabitWrite(name)) return executeHabitAction(name, proposal.args, userId);
  if (isNoteWrite(name)) return executeNoteAction(name, proposal.args, userId);
  if (isEventWrite(name)) return executeEventAction(name, proposal.args, userId);

  if (name === 'create_task') {
    const args = proposal.args as z.infer<typeof createTaskArgs>;

    // The category must belong to the user; fall back to their first one.
    const categories = await CategoryModel.find({ userId }).sort({ createdAt: 1 });
    const tag = categories.find((c) => c._id.toString() === args.tagId) ?? categories[0];
    if (!tag) return { ok: false, message: 'Create a category first.' };

    // With a time the task is also a booked session, so its length is known either way.
    const minutes = args.startTime ? (args.duration ?? DEFAULT_SESSION_MINUTES) : args.duration;

    const task = await TaskModel.create({
      userId,
      name: args.name,
      note: args.note,
      tagId: tag._id.toString(),
      color: DEFAULT_COLOR,
      icon: DEFAULT_ICON,
      duration: minutes,
      startDate: args.startDate ? new Date(args.startDate) : undefined,
      endDate: args.endDate ? new Date(args.endDate) : undefined,
      dependencies: [],
      attachments: [],
    });

    if (!args.startTime || !args.startDate || !minutes) {
      return { ok: true, message: `Created "${task.name}".`, target: taskTarget(task) };
    }

    // Same record `POST /schedule-blocks` writes: this is what puts the task on the day's
    // timeline at that hour.
    try {
      await ScheduleBlockModel.create({
        userId,
        sourceType: 'task',
        sourceId: task._id,
        date: new Date(args.startDate),
        startTime: args.startTime,
        duration: minutes,
      });
    } catch (error) {
      console.error('[agent] session not booked', error);
      return {
        ok: false,
        message: `Created "${task.name}" but could not book the ${args.startTime} session.`,
      };
    }
    return {
      ok: true,
      message: `Created "${task.name}" and booked ${args.startTime} on ${args.startDate} (${minutes} min).`,
      target: taskTarget(task, args.startDate),
    };
  }

  if (name === 'update_task') {
    const args = proposal.args as z.infer<typeof updateTaskArgs>;
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    // null clears a field, the same way PATCH /tasks/:id treats it.
    const put = (key: string, value: unknown) => {
      if (value === null) unset[key] = 1;
      else if (value !== undefined) set[key] = value;
    };
    put('name', args.name);
    put('note', args.note);
    put('status', args.status);
    put('duration', args.duration);
    put('startDate', args.startDate ? new Date(args.startDate) : undefined);
    put(
      'endDate',
      args.endDate === null ? null : args.endDate ? new Date(args.endDate) : undefined,
    );

    if (args.tagId !== undefined) {
      const tag = await CategoryModel.findOne({ _id: args.tagId, userId }).catch(() => null);
      if (!tag) return { ok: false, message: 'That category was not found.' };
      set.tagId = tag._id.toString();
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;

    const task = await TaskModel.findOneAndUpdate({ _id: args.id, userId, active: true }, update, {
      new: true,
    }).catch(() => null);
    if (!task) return { ok: false, message: 'Task not found.' };

    const start = ymdOf(task.startDate);
    const end = ymdOf(task.endDate);

    if (isMultiDay(start, end)) {
      // Several days, several sessions: which one goes where is the user's
      // call, made session by session. Only point out the ones now stranded.
      const stray = (await sessionsOf(task._id, userId)).filter((b) =>
        outsideRange(task, ymdOf(b.date) ?? ''),
      ).length;
      const note = stray > 0 ? ` ${stray} session(s) now fall outside its days.` : '';
      return { ok: true, message: `Updated "${task.name}".${note}`, target: taskTarget(task) };
    }

    if (!start) return { ok: true, message: `Updated "${task.name}".`, target: taskTarget(task) };

    // One day only: every planned session belongs on it. Done and missed ones
    // are history and stay where they happened.
    const sessionSet: Record<string, unknown> = { date: new Date(start) };
    if (args.startTime) sessionSet.startTime = args.startTime;
    if (args.duration) sessionSet.duration = args.duration;
    const moved = await ScheduleBlockModel.updateMany(
      { userId, sourceType: 'task', sourceId: task._id, status: 'planned' },
      { $set: sessionSet },
    );

    if (moved.matchedCount > 0) {
      const at = args.startTime ? ` at ${args.startTime}` : '';
      return {
        ok: true,
        message: `Updated "${task.name}" and moved ${moved.matchedCount} session(s) to ${start}${at}.`,
        target: taskTarget(task, start),
      };
    }

    if (args.startTime) {
      const minutes = args.duration ?? task.duration ?? DEFAULT_SESSION_MINUTES;
      await ScheduleBlockModel.create({
        userId,
        sourceType: 'task',
        sourceId: task._id,
        date: new Date(start),
        startTime: args.startTime,
        duration: minutes,
      });
      return {
        ok: true,
        message: `Updated "${task.name}" and booked ${args.startTime} on ${start} (${minutes} min).`,
        target: taskTarget(task, start),
      };
    }
    return { ok: true, message: `Updated "${task.name}".`, target: taskTarget(task) };
  }

  if (name === 'create_session') {
    const args = proposal.args as z.infer<typeof createSessionArgs>;
    const task = await findTask(args.taskId, userId);
    if (!task) return { ok: false, message: 'Task not found.' };
    const minutes = args.duration ?? task.duration ?? DEFAULT_SESSION_MINUTES;
    await ScheduleBlockModel.create({
      userId,
      sourceType: 'task',
      sourceId: task._id,
      date: new Date(args.date),
      startTime: args.startTime,
      duration: minutes,
    });
    return {
      ok: true,
      message: `Booked "${task.name}" on ${args.date} at ${args.startTime} (${minutes} min).`,
      target: taskTarget(task, args.date),
    };
  }

  if (name === 'update_session' || name === 'delete_session') {
    const args = proposal.args as z.infer<typeof updateSessionArgs | typeof deleteSessionArgs>;
    const found = await findSession(args.id, userId);
    if (!found) return { ok: false, message: 'Session not found.' };
    const { block, task } = found;

    if (name === 'delete_session') {
      await block.deleteOne();
      return { ok: true, message: `Removed the ${slot(block)} session of "${task.name}".` };
    }

    const edit = args as z.infer<typeof updateSessionArgs>;
    if (edit.date) block.date = new Date(edit.date);
    if (edit.startTime) block.startTime = edit.startTime;
    if (edit.duration) block.duration = edit.duration;
    await block.save();
    return {
      ok: true,
      message: `Moved the "${task.name}" session to ${slot(block)} (${block.duration} min).`,
      target: taskTarget(task, ymdOf(block.date)),
    };
  }

  const args = proposal.args as z.infer<typeof completeTaskArgs | typeof deleteTaskArgs>;
  const task = await findTask(args.id, userId);
  if (!task) return { ok: false, message: 'Task not found.' };

  if (name === 'delete_task') {
    // Same as DELETE /tasks/:id: a soft delete, and the task's sessions go with it.
    task.active = false;
    await task.save();
    await ScheduleBlockModel.deleteMany({ userId, sourceType: 'task', sourceId: task._id });
    return { ok: true, message: `Deleted "${task.name}".` };
  }

  const multiDay =
    task.startDate && task.endDate && task.endDate.getTime() > task.startDate.getTime();
  if (multiDay) {
    // Multi-day tasks are ticked per day through task logs in the app.
    return { ok: false, message: 'This task spans several days — complete it from the app.' };
  }

  task.status = 'done';
  await task.save();
  return { ok: true, message: `Marked "${task.name}" as done.`, target: taskTarget(task) };
}
