import type { NextRequest } from 'next/server';

import { connectDB } from '@/libs/mongodb';
import { getAuthUser } from '@/server/helpers/get-auth-user';
import { HabitLogModel } from '@/server/models/habit-log.model';
import { HabitModel } from '@/server/models/habit.model';
import { TaskModel } from '@/server/models/task.model';
import { UserProfileModel } from '@/server/models/user-profile.model';
import { dayKeyIn } from '@/server/services/progress';
import { buildCalendar } from '@/server/services/schedule-engine';
import { syncStreak } from '@/server/services/streak';
import { UserSettingModel } from '@/server/models/user-setting.model';
import { asyncHandler, successResponse, unauthorizedResponse } from '@/server';
import type { CalendarSource } from '@/types/calendar';
import type { HabitDay } from '@/types/habit';

const DOW_TO_HABIT_DAY: HabitDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function localMidnight(offset = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (offset !== 0) d.setDate(d.getDate() + offset);
  return d;
}

function toDateStr(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// GET /api/v1/stats
export const GET = asyncHandler(async (req: NextRequest) => {
  const user = getAuthUser(req);
  if (!user) return unauthorizedResponse();

  await connectDB();

  const today = localMidnight();
  const todayStr = toDateStr(today);
  const weekStart = localMidnight(-6); // 7 days ending today
  const lastWeekStart = localMidnight(-13); // 7 days before that
  const todayDow = DOW_TO_HABIT_DAY[today.getDay()] as HabitDay;

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const allTasks = await TaskModel.find({ userId: user.sub, active: true }).lean();

  const tasksDone = allTasks.filter((t) => t.status === 'done').length;
  const tasksInProg = allTasks.filter((t) => t.status === 'in_progress').length;
  const tasksPending = allTasks.filter(
    (t) => t.status === 'pending' || t.status === 'waiting',
  ).length;
  const tasksTodo = allTasks.filter((t) => t.status === 'todo').length;
  const tasksOverdue = allTasks.filter((t) => {
    const due = t.endDate ?? t.startDate;
    return t.status !== 'done' && !!due && due < today;
  }).length;
  const completionRate = allTasks.length > 0 ? Math.round((tasksDone / allTasks.length) * 100) : 0;

  // Pending tasks list — not done, sorted by startDate asc (undated tasks last), limit 10
  const pendingTaskList = allTasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.getTime() - b.startDate.getTime();
    })
    .slice(0, 10)
    .map((t) => {
      const due = t.endDate ?? t.startDate;
      return {
        id: t._id.toString(),
        name: t.name,
        icon: t.icon,
        color: t.color,
        status: t.status,
        startDate: t.startDate ? toDateStr(t.startDate) : undefined,
        overdue: !!due && due < today,
        daysOverdue:
          due && due < today
            ? Math.floor((today.getTime() - due.getTime()) / 86_400_000)
            : undefined,
      };
    });

  // ── Habits ─────────────────────────────────────────────────────────────────
  const habits = await HabitModel.find({ userId: user.sub, active: true }).lean();
  const habitsToday = habits.filter((h) => h.schedule.some((e) => e.days.includes(todayDow)));

  const todayLogs = await HabitLogModel.find({
    userId: user.sub,
    date: { $gte: today, $lt: localMidnight(1) },
  }).lean();

  const doneToday = todayLogs.filter((l) => l.done).length;
  const totalToday = habitsToday.length;
  const completionRateToday = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  // ── Weekly trend (last 7 days) + last-week comparison ─────────────────────
  const [weekLogs, lastWeekLogs] = await Promise.all([
    HabitLogModel.find({ userId: user.sub, date: { $gte: weekStart }, done: true }).lean(),
    HabitLogModel.find({
      userId: user.sub,
      date: { $gte: lastWeekStart, $lt: weekStart },
      done: true,
    }).lean(),
  ]);

  const dates: string[] = [];
  const weekTasksDone: number[] = [];
  const weekHabitsDone: number[] = [];
  const lastWeekTasksDone: number[] = [];
  const lastWeekHabitsDone: number[] = [];

  for (let i = 6; i >= 0; i--) {
    const day = localMidnight(-i);
    const dayStr = toDateStr(day);
    dates.push(dayStr.slice(5)); // MM-DD

    weekTasksDone.push(
      allTasks.filter(
        (t) => t.startDate && toDateStr(t.startDate) === dayStr && t.status === 'done',
      ).length,
    );
    weekHabitsDone.push(weekLogs.filter((l) => toDateStr(new Date(l.date)) === dayStr).length);
  }

  for (let i = 13; i >= 7; i--) {
    const day = localMidnight(-i);
    const dayStr = toDateStr(day);
    lastWeekTasksDone.push(
      allTasks.filter(
        (t) => t.startDate && toDateStr(t.startDate) === dayStr && t.status === 'done',
      ).length,
    );
    lastWeekHabitsDone.push(
      lastWeekLogs.filter((l) => toDateStr(new Date(l.date)) === dayStr).length,
    );
  }

  const thisWeekTaskTotal = weekTasksDone.reduce((a, b) => a + b, 0);
  const lastWeekTaskTotal = lastWeekTasksDone.reduce((a, b) => a + b, 0);
  const trendVsLastWeek =
    lastWeekTaskTotal > 0
      ? Math.round(((thisWeekTaskTotal - lastWeekTaskTotal) / lastWeekTaskTotal) * 100)
      : null;
  const dailyAverage = Math.round((thisWeekTaskTotal / 7) * 10) / 10;

  // Week habit completion rate
  const weekCompletionRate = (() => {
    const totalDone = weekHabitsDone.reduce((a, b) => a + b, 0);
    return totalDone > 0 ? Math.round((totalDone / Math.max(totalDone, 1)) * 100) : 0;
  })();

  // ── Character (from UserProfile) ───────────────────────────────────────────
  const profile = await UserProfileModel.findOne({ userId: user.sub }).lean();
  const setting = await UserSettingModel.findOne({ userId: user.sub }).select('timezone').lean();
  const userToday = dayKeyIn(setting?.timezone || 'UTC');
  const character = {
    level: profile?.level ?? 1,
    xp: profile?.xp ?? 0,
    xpNext: profile?.xpNext ?? 1000,
    coins: profile?.coins ?? 0,
    gems: profile?.gems ?? 0,
    rank: profile?.rank ?? 'E',
    streak: profile ? await syncStreak(user.sub, userToday, false) : 0,
  };

  // ── Schedule engine — hour-based workload (last 7 days) ───────────────────
  const scheduleFrom = toDateStr(weekStart);
  const calItems = await buildCalendar(user.sub, scheduleFrom, todayStr);

  let plannedMin = 0;
  let completedMin = 0;
  let missedMin = 0;
  const bySource: Record<CalendarSource, number> = { habit: 0, quest: 0, task: 0, event: 0 };
  const trendMap = new Map<string, { planned: number; completed: number }>();

  for (const item of calItems) {
    // An event is a reminder of where the time goes, not something to finish, so it
    // would only ever sit in the planned total and drag the completion rate down.
    if (item.sourceType === 'event') continue;
    plannedMin += item.duration;
    if (item.status === 'done') {
      completedMin += item.duration;
      bySource[item.sourceType] += item.duration;
    } else if (item.status === 'missed') {
      missedMin += item.duration;
    }
    const t = trendMap.get(item.date) ?? { planned: 0, completed: 0 };
    t.planned += item.duration;
    if (item.status === 'done') t.completed += item.duration;
    trendMap.set(item.date, t);
  }

  const scheduleTrend = dates.map((mmdd, i) => {
    const day = localMidnight(-(6 - i));
    const t = trendMap.get(toDateStr(day)) ?? { planned: 0, completed: 0 };
    return { date: mmdd, planned: t.planned, completed: t.completed };
  });

  return successResponse({
    schedule: {
      range: { from: scheduleFrom, to: todayStr },
      plannedMinutes: plannedMin,
      completedMinutes: completedMin,
      missedMinutes: missedMin,
      completionRate: plannedMin > 0 ? Math.round((completedMin / plannedMin) * 100) : 0,
      trend: scheduleTrend,
      bySource,
    },
    tasks: {
      total: allTasks.length,
      done: tasksDone,
      inProgress: tasksInProg,
      pending: tasksPending,
      todo: tasksTodo,
      overdue: tasksOverdue,
      completionRate,
    },
    habits: {
      activeCount: habits.length,
      doneToday,
      totalToday,
      completionRateToday,
      weekCompletionRate,
    },
    weekly: {
      dates,
      tasksDone: weekTasksDone,
      habitsDone: weekHabitsDone,
      lastWeekTasksDone,
      lastWeekHabitsDone,
    },
    pendingTasks: pendingTaskList,
    dailyAverage,
    trendVsLastWeek,
    character,
    generatedAt: todayStr,
  });
});
