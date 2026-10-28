import type { DashboardSettings, Escalation, HabitColor, HabitDay, QuestType } from '../types';

export const QUEST_ICONS: Record<QuestType, string> = {
  focus: '🎯',
  habit: '⚡',
  reflect: '📖',
  admin: '📬',
  create: '✨',
  health: '🌿',
  break: '☕',
  // task: '📋',
};

export const SCHED_COLORS: Record<QuestType, string> = {
  focus: '#7dd3fc',
  habit: '#fbbf24',
  reflect: '#c4b5fd',
  admin: '#f87171',
  create: '#6ee7b7',
  health: '#86efac',
  break: '#94a3b8',
  // task: '#67e8f9',
};

export {
  TASK_XP,
  TASK_COINS,
  HABIT_XP,
  HABIT_COINS,
  RANKS,
  RANK_LEVEL_THRESHOLDS,
} from '@/constants/progress';

export const QUOTES = [
  {
    text: "Every quest completed is a step toward the hero you're becoming.",
    author: '— The Oracle',
  },
  {
    text: 'Small wins compound into legendary feats. Keep your streak alive.',
    author: '— Aetheria Codex',
  },
  {
    text: 'The discipline you forge today shapes the warrior of tomorrow.',
    author: '— Shadow Tome',
  },
  {
    text: 'Your focus is your mana. Spend it wisely and recharge often.',
    author: '— Elder Scroll',
  },
];

export const XP_MAP: Record<string, number> = { S: 150, A: 120, B: 90, C: 60, D: 50 };
export const COIN_MAP: Record<string, number> = { S: 40, A: 30, B: 25, C: 15, D: 12 };

export const ESCALATIONS: Escalation[] = [
  { xpLoss: 100, coinLoss: 20, streakBreak: false, statLoss: 2, rankDemote: false },
  { xpLoss: 200, coinLoss: 40, streakBreak: true, statLoss: 5, rankDemote: false },
  { xpLoss: 350, coinLoss: 80, streakBreak: true, statLoss: 8, rankDemote: true },
  { xpLoss: 500, coinLoss: 120, streakBreak: true, statLoss: 12, rankDemote: true },
];

export const DEFAULT_SETTINGS: DashboardSettings = {
  // The "This Week" panel is off: its room goes to Projects. Flip to bring it back.
  showGuildPanel: false,
  timerDuration: 25,
  characterName: 'Aria Solveig',
  animationsEnabled: true,
  showQuoteCard: true,
};

export const SKIP_CONFIRM_STORAGE_KEY = 'aetheria_skip_quest_confirm';
export const QUEST_ROLLOVER_KEY = 'aetheria_quest_rollover_date';
export const SUNDAY_REMINDER_KEY = 'aetheria_sunday_planning_reminded';
export const MONTHLY_REMINDER_KEY = 'aetheria_monthly_planning_reminded';
export const TASK_PENALTY_KEY = 'aetheria_task_penalty_date';

export const HABIT_COLORS: Record<HabitColor, { label: string; value: string }> = {
  gold: { label: 'Gold', value: 'oklch(0.74 0.17 85)' },
  mint: { label: 'Mint', value: 'oklch(0.76 0.14 162)' },
  violet: { label: 'Violet', value: 'oklch(0.66 0.22 295)' },
  cyan: { label: 'Cyan', value: 'oklch(0.76 0.16 205)' },
  rose: { label: 'Rose', value: 'oklch(0.72 0.18 5)' },
  amber: { label: 'Amber', value: 'oklch(0.76 0.16 55)' },
  blue: { label: 'Blue', value: 'oklch(0.65 0.18 250)' },
};

/** @deprecated Use ALL_HABIT_DAYS + HABIT_DAY_LABELS instead */
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
/** @deprecated Use ALL_HABIT_DAYS instead */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const; // Mon-Sun display order

/** Ordered Mon → Sun for display */
export const ALL_HABIT_DAYS: HabitDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Full label per day */
export const HABIT_DAY_LABELS: Record<HabitDay, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** 2-char abbreviation per day */
export const HABIT_DAY_SHORT: Record<HabitDay, string> = {
  mon: 'Mo',
  tue: 'Tu',
  wed: 'We',
  thu: 'Th',
  fri: 'Fr',
  sat: 'Sa',
  sun: 'Su',
};
