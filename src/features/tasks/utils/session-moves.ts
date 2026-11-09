import { daysBetween, shiftDate } from './date.utils';

export interface SessionMove {
  id: string;
  /** The day the session should land on. */
  date: string;
}

/**
 * Where each session goes when its task's start moves from `oldStart` to `newStart`. Every
 * session shifts by the same number of days, so a task with sessions on several days keeps the
 * gaps between them. Without an `oldStart`, the earliest session is the anchor and lands on
 * `newStart`.
 */
export function planSessionMoves(
  blocks: { id: string; date: string }[],
  oldStart: string | undefined,
  newStart: string,
): SessionMove[] {
  const anchor =
    oldStart ??
    blocks.reduce<string | undefined>((a, b) => (!a || b.date < a ? b.date : a), undefined);
  if (!anchor) return [];
  const offset = daysBetween(anchor, newStart);
  return blocks.map((b) => ({ id: b.id, date: shiftDate(b.date, offset) }));
}
