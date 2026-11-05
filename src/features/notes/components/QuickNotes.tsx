'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal, ModalBody, ModalHead } from '@/components/ui/Modal';
import { SkelBlock } from '@/components/ui/Skeleton';
import { AddTaskModal } from '@/features/tasks/components/shared/AddTaskModal';
import { cn } from '@/libs/utils';
import { useUIStore } from '@/stores/ui.store';

import { useCreateNote, useNotes, useToggleNoteArchived } from '../hooks/useNotes';

/**
 * Catch a thought in one tap.
 *
 * Mounted globally beside GlobalSearch and QuickAddTask, so it never costs a
 * navigation — losing the page you were on is exactly the friction this
 * exists to remove. Opened from QuickCreateFab at every screen size, and
 * from the assistant's "View notes" link (`ui.store.openNotes`).
 *
 * Enter inserts a newline rather than saving: an idea is often two lines, and
 * a key that silently commits half of one is worse than a button.
 */
export function QuickNotes() {
  const open = useUIStore((s) => s.notesOpen);
  const closeNotes = useUIStore((s) => s.closeNotes);

  const { data: notes = [], isLoading } = useNotes();

  // Dealt-with notes sink to the bottom rather than vanishing: still there to
  // look back at, but out of the way of the ones still waiting. Sorted here
  // rather than on the server so ticking one slides it down at once, off the
  // optimistic update, with no round trip in between.
  const ordered = useMemo(
    () =>
      [...notes].sort(
        (a, b) =>
          Number(!!a.archivedAt) - Number(!!b.archivedAt) || b.createdAt.localeCompare(a.createdAt),
      ),
    [notes],
  );
  const createNote = useCreateNote();
  const toggleArchived = useToggleNoteArchived();

  const [draft, setDraft] = useState('');
  const [promoting, setPromoting] = useState<string | null>(null);

  const canSave = draft.trim().length > 0 && !createNote.isPending;

  const save = () => {
    if (!canSave) return;
    createNote.mutate(draft.trim(), { onSuccess: () => setDraft('') });
  };

  // Turning a note into a task hands over to the full form, so the sheet gets
  // out of the way rather than stacking two panels.
  const promote = (content: string) => {
    closeNotes();
    setPromoting(content);
  };

  return (
    <>
      <Modal open={open} onClose={closeNotes} maxWidth="520px" bottomSheet>
        <ModalHead title="Quick Notes" />
        <ModalBody>
          <div className="flex flex-col gap-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              // A shortcut for the same button, not a replacement: the repo
              // already uses ⌘/Ctrl+Enter to commit text elsewhere.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  save();
                }
              }}
              rows={3}
              maxLength={2000}
              autoFocus
              placeholder="What just came to mind?"
              className={textarea}
            />

            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-[var(--text-dim)]">⌘ + Enter</span>
              <Button variant="primary" size="sm" onClick={save} disabled={!canSave}>
                {createNote.isPending ? '…' : 'Save note'}
              </Button>
            </div>

            <div className="h-px bg-[var(--border)]" />

            {isLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkelBlock key={i} className="h-[44px] w-full" />
                ))}
              </div>
            ) : notes.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-[var(--text-lo)]">
                Nothing caught yet. The first line above becomes the first note.
              </p>
            ) : (
              <div className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
                {ordered.map((note) => {
                  const done = !!note.archivedAt;
                  return (
                    <div key={note.id} className={row}>
                      <button
                        type="button"
                        aria-pressed={done}
                        title={done ? 'Reopen' : 'Mark as dealt with'}
                        onClick={() => toggleArchived.mutate({ id: note.id, archived: !done })}
                        className={cn(check, done && checkDone)}
                      >
                        {done ? '✓' : '○'}
                      </button>

                      <p
                        className={cn(
                          'min-w-0 flex-1 text-[12px] leading-relaxed whitespace-pre-wrap',
                          done ? 'text-[var(--text-lo)] line-through' : 'text-[var(--text-hi)]',
                        )}
                      >
                        {note.content}
                      </p>

                      <button
                        type="button"
                        onClick={() => promote(note.content)}
                        title="Turn into a task"
                        className={toTask}
                      >
                        → Task
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ModalBody>
      </Modal>

      <AddTaskModal
        open={promoting !== null}
        onClose={() => setPromoting(null)}
        onSaved={() => setPromoting(null)}
        defaultValues={{ name: promoting ?? '' }}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const textarea = cn(
  'w-full resize-none rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-2)]',
  'px-4 py-2.5 text-[13px] text-[var(--text-hi)] placeholder:text-[var(--text-dim)]',
  'transition-all duration-[180ms] hover:border-[var(--border-hi)]',
  'focus:border-[var(--gold)] focus:shadow-[0_0_0_3px_oklch(0.78_0.16_82_/_0.15)] focus:outline-none',
);

const row = cn(
  'flex items-start gap-2 rounded-[var(--r-sm)] border border-[var(--border)]',
  'bg-[var(--bg-2)] px-2.5 py-2 transition-colors hover:border-[var(--border-hi)]',
);

const check = cn(
  'mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
  'border border-[var(--border)] text-[10px] text-[var(--text-lo)] transition-colors',
  'hover:border-[var(--mint)] hover:text-[var(--mint)]',
);
const checkDone = 'border-[var(--mint)] text-[var(--mint)]';

const toTask = cn(
  'shrink-0 rounded-[var(--r-sm)] border border-[var(--border)] px-1.5 py-0.5',
  'text-[9px] font-bold tracking-[0.06em] text-[var(--text-lo)] uppercase [font-family:var(--f-title)]',
  'transition-colors hover:border-[var(--gold)] hover:text-[var(--gold)]',
);
