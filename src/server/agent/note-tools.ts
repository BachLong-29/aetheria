import { z } from 'zod';

import { NoteModel } from '@/server/models/note.model';
import type { INote } from '@/server/models/note.model';
import type { AgentTarget } from '@/types/agent';
import { diacriticRegex } from '@/libs/utils';

/**
 * Quick-note tools for the assistant: read the notes, and capture a new one.
 * Editing, deleting and marking notes done are deliberately not here — see
 * `aetheria-docs/requirements/quick-notes.md`.
 */

const NOTE_STATUSES = ['open', 'done', 'all'] as const;

const listNotesArgs = z.object({
  status: z
    .enum(NOTE_STATUSES)
    .optional()
    .describe('open = not dealt with yet (default), done = dealt with, all = both'),
  q: z.string().max(100).optional().describe('Search text in the note'),
  limit: z.number().int().min(1).max(100).optional().describe('Max results, default 30'),
});

const createNoteArgs = z.object({
  content: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe("The note, in the user's own words — do not rewrite or summarise it"),
});

export const NOTE_READ_TOOLS = {
  list_notes: {
    description:
      "List the user's quick notes, newest first: id, content, done (dealt with), createdAt.",
    schema: listNotesArgs,
  },
} as const;

export const NOTE_WRITE_TOOLS = {
  create_note: {
    description:
      'Propose saving a quick note — an idea to keep, with no date or category. If the user wants something done on a day, that is a task instead. The user must confirm.',
    schema: createNoteArgs,
  },
} as const;

export type NoteReadToolName = keyof typeof NOTE_READ_TOOLS;
export type NoteWriteToolName = keyof typeof NOTE_WRITE_TOOLS;

/** Long enough to recognise the note on a confirm card, short enough for one line. */
const PREVIEW_CHARS = 60;

function preview(content: string): string {
  const line = content.replace(/\s+/g, ' ').trim();
  return line.length > PREVIEW_CHARS ? `${line.slice(0, PREVIEW_CHARS - 1)}…` : line;
}

function brief(note: INote) {
  return {
    id: note._id.toString(),
    content: note.content,
    done: Boolean(note.archivedAt),
    createdAt: note.createdAt.toISOString().slice(0, 10),
  };
}

export async function runNoteReadTool(
  name: NoteReadToolName,
  rawArgs: unknown,
  userId: string,
): Promise<unknown> {
  const parsed = NOTE_READ_TOOLS[name].schema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };

  const args = parsed.data;
  const filter: Record<string, unknown> = { userId };
  // Absence of `archivedAt` is what "not dealt with" means for a note.
  const status = args.status ?? 'open';
  if (status === 'open') filter.archivedAt = { $exists: false };
  if (status === 'done') filter.archivedAt = { $exists: true };
  if (args.q) filter.content = { $regex: diacriticRegex(args.q), $options: 'i' };

  const notes = await NoteModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(args.limit ?? 30);
  return notes.map(brief);
}

export function proposeNoteAction(
  name: NoteWriteToolName,
  rawArgs: unknown,
): { args: Record<string, unknown>; summary: string } | { error: string } {
  const parsed = NOTE_WRITE_TOOLS[name].schema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join('; ') };
  return { args: parsed.data, summary: `Save note "${preview(parsed.data.content)}"` };
}

export async function executeNoteAction(
  name: NoteWriteToolName,
  args: Record<string, unknown>,
  userId: string,
): Promise<{ ok: boolean; message: string; target?: AgentTarget }> {
  const { content } = args as z.infer<typeof createNoteArgs>;
  const note = await NoteModel.create({ userId, content });
  return {
    ok: true,
    message: `Saved note "${preview(content)}".`,
    target: { kind: 'note', id: note._id.toString(), label: preview(content) },
  };
}
