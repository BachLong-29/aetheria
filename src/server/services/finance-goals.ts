import { FinanceGoalModel } from '@/server/models/finance-goal.model';
import { GoalContributionModel } from '@/server/models/goal-contribution.model';

import { monthRange } from './finance-budget';

export interface GoalWithProgress {
  id: string;
  name: string;
  icon: string;
  color: string;
  targetAmount: number;
  currentAmount: number;
  remaining: number;
  /** round(currentAmount / targetAmount * 100), capped at 100 */
  progress: number;
  targetDate: string | null;
  status: 'active' | 'completed' | 'archived';
  /** Whole months from `month` to the target date, at least 1. null without a target date. */
  monthsLeft: number | null;
  /** What still has to go in each month to land on time. null without a target date. */
  requiredMonthly: number | null;
  requiredDaily: number | null;
  /** Put in during `month` so far. */
  contributedThisMonth: number;
  /** requiredMonthly − contributedThisMonth, floored at 0 — what the banner nags about. */
  unallocatedThisMonth: number;
  /** false when the goal has a deadline and this month's share isn't fully funded yet. */
  onTrack: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Whole months between `month` ("YYYY-MM") and a target date, counting the current one. */
function monthsUntil(month: string, target: Date): number {
  const parts = month.split('-');
  const year = Number(parts[0]);
  const mo = Number(parts[1]);
  const months = (target.getUTCFullYear() - year) * 12 + (target.getUTCMonth() + 1 - mo) + 1;
  return Math.max(1, months);
}

/**
 * Goals with their funding progress for `month` — including how much of this month's share is
 * still unallocated, which is what drives the "allocate now" prompt on the overview. Archived goals
 * are left out unless `includeArchived` — only the Goals page needs them, to offer a restore.
 */
export async function listGoalsWithProgress(
  userId: string,
  month: string,
  today: string,
  includeArchived = false,
): Promise<GoalWithProgress[]> {
  const goals = await FinanceGoalModel.find(
    includeArchived ? { userId } : { userId, status: { $ne: 'archived' } },
  )
    .sort({ createdAt: 1 })
    .lean();
  if (goals.length === 0) return [];

  const contributions = await GoalContributionModel.find({ userId }).lean();
  const { from, to } = monthRange(month);

  const totalByGoal = new Map<string, number>();
  const monthByGoal = new Map<string, number>();
  for (const c of contributions) {
    const key = c.goalId.toString();
    totalByGoal.set(key, (totalByGoal.get(key) ?? 0) + c.amount);
    if (c.date >= from && c.date <= to) {
      monthByGoal.set(key, (monthByGoal.get(key) ?? 0) + c.amount);
    }
  }

  const daysInMonth = to.getUTCDate();
  const dayOfMonth = today.substring(0, 7) === month ? Number(today.substring(8, 10)) : 1;
  const daysLeftInMonth = Math.max(1, daysInMonth - dayOfMonth + 1);

  return goals.map((g) => {
    const id = g._id.toString();
    const currentAmount = totalByGoal.get(id) ?? 0;
    const contributedThisMonth = monthByGoal.get(id) ?? 0;
    const remaining = Math.max(0, g.targetAmount - currentAmount);

    const monthsLeft = g.targetDate ? monthsUntil(month, g.targetDate) : null;
    const requiredMonthly = monthsLeft ? Math.ceil(remaining / monthsLeft) : null;
    const unallocatedThisMonth =
      requiredMonthly === null ? 0 : Math.max(0, requiredMonthly - contributedThisMonth);
    const requiredDaily =
      requiredMonthly === null ? null : Math.ceil(unallocatedThisMonth / daysLeftInMonth);

    return {
      id,
      name: g.name,
      icon: g.icon,
      color: g.color,
      targetAmount: g.targetAmount,
      currentAmount,
      remaining,
      progress: Math.min(100, Math.round((currentAmount / g.targetAmount) * 100)),
      targetDate: g.targetDate ? g.targetDate.toISOString().substring(0, 10) : null,
      status: g.status,
      monthsLeft,
      requiredMonthly,
      requiredDaily,
      contributedThisMonth,
      unallocatedThisMonth,
      onTrack: unallocatedThisMonth === 0,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    } satisfies GoalWithProgress;
  });
}

/** Recomputes a goal's status from its contributions — called after any contribution changes. */
export async function syncGoalStatus(userId: string, goalId: string): Promise<void> {
  const goal = await FinanceGoalModel.findOne({ _id: goalId, userId });
  if (!goal || goal.status === 'archived') return;

  const contributions = await GoalContributionModel.find({ userId, goalId }).lean();
  const total = contributions.reduce((sum, c) => sum + c.amount, 0);
  const reached = total >= goal.targetAmount;

  if (reached && goal.status !== 'completed') {
    goal.status = 'completed';
    goal.completedAt = new Date();
    await goal.save();
  } else if (!reached && goal.status === 'completed') {
    goal.status = 'active';
    goal.completedAt = undefined;
    await goal.save();
  }
}
