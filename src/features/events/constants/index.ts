import type { HabitDay } from '@/types/habit';

/** Seed for a new event — the form picks anything from the emoji picker. */
export const DEFAULT_EVENT_ICON = '📅';

/**
 * Ordered the way the weekday picker shows them. Their names are translated: `events.days.*`
 * (short, for a schedule line) and `events.dayLetters.*` (for the picker buttons).
 */
export const DAY_ORDER: HabitDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
