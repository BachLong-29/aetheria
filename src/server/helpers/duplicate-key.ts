/** Mongo's E11000 — a write broke a unique index. */
export function isDuplicateKeyError(err: unknown): boolean {
  return (err as { code?: number } | null)?.code === 11000;
}
