/**
 * What the reader may see right now: not dismissed, not expired, and — for a reminder that was
 * created ahead of time — not before its `notifyAt`.
 */
export function visibleNow(now: Date) {
  return {
    dismissedAt: { $exists: false },
    $and: [
      { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
      { $or: [{ notifyAt: { $exists: false } }, { notifyAt: { $lte: now } }] },
    ],
  };
}
