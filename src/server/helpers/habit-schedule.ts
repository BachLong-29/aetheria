export const REPEATED_DAY_MESSAGE =
  'A weekday can be in only one time slot — a habit is done once per day.';

/**
 * False when the same weekday sits in two slots. A habit has one log per day, so two slots on one
 * day would be one tick, and the calendar would list the day twice under the same id.
 */
export function slotsHaveUniqueDays(schedule: { days: readonly string[] }[]): boolean {
  const days = schedule.flatMap((slot) => slot.days);
  return new Set(days).size === days.length;
}
