'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { cn } from '@/libs/utils';

import { CoinIcon } from '@/components/common/CoinIcon';
import { Icon } from '@/components/common/Icon';
import type { Task, UpdateTaskPayload } from '@/types';
import { taskToUITask } from '@/features/tasks/data/adapters';
import { toLocalDate } from '@/features/tasks/utils/date.utils';
import { EditTaskModal } from '@/features/tasks/components/shared/EditTaskModal';
import { useStats } from '../../hooks/useStats';
import { useStatsHeatmap } from '../../hooks/useStatsHeatmap';
import { useTasks } from '../../hooks/useTasks';
import { useUpdateTask } from '../../hooks/useUpdateTask';
import type { PendingTask } from '../../hooks/useStats';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHours(min: number): string {
  if (min <= 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function toDayAbbr(mmdd: string): string {
  const [month, day] = mmdd.split('-').map(Number);
  const year = new Date().getFullYear();
  const d = new Date(year, (month ?? 1) - 1, day ?? 1);
  return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

// ── Section Head ──────────────────────────────────────────────────────────────

function SectionHead({ num, title, desc }: { num: string; title: string; desc?: React.ReactNode }) {
  return (
    <div className={sectionHeadCls}>
      <span className={secNumCls}>{num}</span>
      <div>
        <h2 className={secTitleCls}>{title}</h2>
        {desc && <p className={secDescCls}>{desc}</p>}
      </div>
    </div>
  );
}

// ── Delta Badge ───────────────────────────────────────────────────────────────

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[10px] text-[var(--text-lo)]">—</span>;
  const isUp = pct > 0;
  const isFlat = pct === 0;
  const cls = isFlat
    ? 'text-[var(--text-lo)]'
    : isUp
      ? 'text-[oklch(0.76_0.14_162)]'
      : 'text-[oklch(0.72_0.18_5)]';
  const arrow = isFlat ? '→' : isUp ? '▲' : '▼';
  return (
    <span className={cn('text-[10px] font-bold [font-family:var(--f-mono)]', cls)}>
      {arrow} {Math.abs(pct)}%
    </span>
  );
}

// ── Featured KPI ──────────────────────────────────────────────────────────────

function FeaturedKpi({
  label,
  value,
  sub,
  delta,
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  delta?: number | null;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE_OUT }}
      className={featuredCard}
    >
      <div className={kpiLabelCls}>{label}</div>
      <div className={featuredValCls}>{value}</div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {delta !== undefined && delta !== null && <DeltaBadge pct={delta} />}
        {sub && <span className="text-[10px] text-[var(--text-lo)]">{sub}</span>}
      </div>
      <div
        className="absolute -bottom-10 -right-10 w-28 h-28 rounded-full opacity-[0.08] blur-3xl pointer-events-none"
        style={{ background: 'var(--gold)' }}
      />
    </motion.div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
  delta,
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
  delta?: number | null;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE_OUT }}
      className={kpiCard}
    >
      <div className={kpiLabelCls}>{label}</div>
      <div className={kpiValCls} style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {(sub || delta !== undefined) && (
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {delta !== undefined && <DeltaBadge pct={delta ?? null} />}
          {sub && <span className="text-[9px] text-[var(--text-lo)]">{sub}</span>}
        </div>
      )}
    </motion.div>
  );
}

// ── Custom Chart Tooltip ──────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--panel3)] border border-[var(--border-hi)] rounded-[var(--r-sm)] px-2.5 py-1.5 text-[9px] shadow-lg">
      <div className="text-[var(--text-lo)] mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-1.5">
          <div
            className="w-[6px] h-[6px] rounded-full"
            style={{
              background:
                p.dataKey === 'thisWeek' ? 'oklch(0.76 0.14 162)' : 'oklch(0.68 0.22 295 / 0.6)',
            }}
          />
          <span className="text-[var(--text-mid)]">
            {p.dataKey === 'thisWeek' ? 'This week' : 'Last week'}:
          </span>
          <span className="font-bold text-[var(--text-hi)]">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── XP Progress Bar ───────────────────────────────────────────────────────────

function XpBar({ xp, xpNext }: { xp: number; xpNext: number }) {
  const pct = Math.min(Math.round((xp / Math.max(xpNext, 1)) * 100), 100);
  return (
    <div className="h-[4px] bg-[var(--panel3)] rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, delay: 0.3, ease: EASE_OUT }}
        className="h-full rounded-full"
        style={{ background: 'linear-gradient(90deg, var(--gold), var(--violet))' }}
      />
    </div>
  );
}

// ── Oracle Insight Card ───────────────────────────────────────────────────────

type InsightTone = 'gold' | 'violet' | 'cyan' | 'mint' | 'rose';

interface OracleInsight {
  icon: string;
  tone: InsightTone;
  tag: string;
  title: string;
  body: string;
  confidence: number;
}

const TONE_COLOR: Record<InsightTone, string> = {
  gold: 'var(--gold)',
  violet: 'var(--violet)',
  cyan: 'var(--cyan)',
  mint: 'oklch(0.76 0.14 162)',
  rose: 'oklch(0.72 0.18 5)',
};

function InsightCard({ insight, delay = 0 }: { insight: OracleInsight; delay?: number }) {
  const accent = TONE_COLOR[insight.tone];
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE_OUT }}
      className={insightCard}
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-start gap-2.5">
        <span className="text-[16px] leading-none shrink-0 mt-0.5" style={{ color: accent }}>
          {insight.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span
              className="text-[8px] font-bold uppercase tracking-[0.1em]"
              style={{ color: accent }}
            >
              {insight.tag}
            </span>
            <span className="text-[8px] text-[var(--text-lo)] [font-family:var(--f-mono)] ml-auto shrink-0">
              {insight.confidence}%
            </span>
          </div>
          <div className="text-[11px] font-bold text-[var(--text-hi)] leading-snug mb-1">
            {insight.title}
          </div>
          <div className="text-[10px] text-[var(--text-lo)] leading-relaxed">{insight.body}</div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Overdue Task Row ──────────────────────────────────────────────────────────

function OverdueRow({ task, delay = 0 }: { task: PendingTask; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE_OUT }}
      className={overdueRow}
    >
      <Icon icon={task.icon} className="text-[13px] shrink-0 leading-none" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-[var(--text-hi)] truncate">{task.name}</div>
        <div className="flex items-center gap-2 mt-[2px]">
          <span className="text-[9px] text-[oklch(0.72_0.18_5)] font-bold">
            {task.daysOverdue ? `${task.daysOverdue}d overdue` : 'Overdue'}
          </span>
          {task.startDate && (
            <span className="text-[8px] text-[var(--text-lo)]">{task.startDate}</span>
          )}
        </div>
      </div>
      <div className={lateBadge}>LATE</div>
    </motion.div>
  );
}

// ── Unscheduled Task Row ──────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  todo: '○ To Do',
  in_progress: '◈ In Progress',
  pending: '⏳ Pending',
  waiting: '◷ Waiting',
};

function UnscheduledRow({
  task,
  delay = 0,
  onEdit,
}: {
  task: Task;
  delay?: number;
  onEdit: (t: Task) => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay, ease: EASE_OUT }}
      onClick={() => onEdit(task)}
      className={unscheduledRow}
    >
      <Icon icon={task.icon} className="text-[13px] shrink-0 leading-none" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-[var(--text-hi)] truncate">{task.name}</div>
        <div className="text-[9px] text-[var(--text-lo)] mt-[1px]">
          {STATUS_LABEL[task.status] ?? task.status}
        </div>
      </div>
      <span className={scheduleBtnCls}>SCHEDULE →</span>
    </motion.button>
  );
}

// ── Calendar Heatmap ──────────────────────────────────────────────────────────

function CalendarHeatmap({
  activityMap,
  streak,
}: {
  activityMap: Record<string, number>;
  streak: number;
}) {
  const { cols, monthLabels, activeDays, totalDays } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364);
    const startDow = startDate.getDay();
    const offset = startDow === 0 ? 6 : startDow - 1;
    startDate.setDate(startDate.getDate() - offset);

    const cols: Array<Array<{ date: string; future: boolean }>> = [];
    const d = new Date(startDate);
    let activeDays = 0;
    let totalDays = 0;

    while (d <= today) {
      const week: Array<{ date: string; future: boolean }> = [];
      for (let i = 0; i < 7; i++) {
        const isFuture = d > today;
        const dateStr = toLocalDate(d);
        week.push({ date: dateStr, future: isFuture });
        if (!isFuture) {
          totalDays++;
          if ((activityMap[dateStr] ?? 0) > 0) activeDays++;
        }
        d.setDate(d.getDate() + 1);
      }
      cols.push(week);
    }

    const monthLabels: { colIdx: number; label: string }[] = [];
    let lastMonth = -1;
    cols.forEach((week, wi) => {
      const firstDate = week[0]?.date;
      if (!firstDate) return;
      const dd = new Date(firstDate);
      if (dd.getMonth() !== lastMonth) {
        monthLabels.push({
          colIdx: wi,
          label: dd.toLocaleDateString('en-US', { month: 'short' }),
        });
        lastMonth = dd.getMonth();
      }
    });

    return { cols, monthLabels, activeDays, totalDays };
  }, [activityMap]);

  const consistency = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;

  function levelColor(count: number): string {
    if (count === 0) return 'var(--panel3)';
    if (count <= 1) return 'oklch(0.74 0.17 85 / 0.2)';
    if (count <= 3) return 'oklch(0.74 0.17 85 / 0.45)';
    if (count <= 6) return 'oklch(0.74 0.17 85 / 0.72)';
    return 'var(--gold)';
  }

  const DOW_LABELS = ['M', '', 'W', '', 'F', '', 'S'];

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-0 min-w-max">
          {/* Day-of-week labels */}
          <div className="flex flex-col gap-[3px] mr-2 pt-[20px] shrink-0">
            {DOW_LABELS.map((lbl, i) => (
              <div key={i} className="h-[16px] w-[8px] flex items-center justify-end">
                <span className="text-[7px] text-[var(--text-lo)] leading-none">{lbl}</span>
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex flex-col">
            {/* Month labels */}
            <div className="flex mb-1" style={{ height: 16 }}>
              {cols.map((_, wi) => {
                const ml = monthLabels.find((m) => m.colIdx === wi);
                return (
                  <div key={wi} className="w-[16px] mr-[3px] shrink-0 overflow-visible">
                    {ml && (
                      <span className="text-[7px] text-[var(--text-lo)] whitespace-nowrap block leading-none">
                        {ml.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cells */}
            <div className="flex gap-[3px]">
              {cols.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell, di) => {
                    if (cell.future) {
                      return (
                        <div
                          key={di}
                          className="w-[16px] h-[16px] rounded-[3px]"
                          style={{ background: 'transparent' }}
                        />
                      );
                    }
                    const count = activityMap[cell.date] ?? 0;
                    return (
                      <motion.div
                        key={di}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          duration: 0.2,
                          delay: Math.min(wi * 0.006 + di * 0.001, 0.5),
                          ease: EASE_OUT,
                        }}
                        className="w-[16px] h-[16px] rounded-[3px] cursor-default"
                        style={{ background: levelColor(count) }}
                        title={`${cell.date}: ${count} activities`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={heatmapFoot}>
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-[var(--text-lo)]">Less</span>
          {([0, 1, 3, 5, 8] as const).map((n, i) => (
            <div
              key={i}
              className="w-[12px] h-[12px] rounded-[2px]"
              style={{ background: levelColor(n) }}
            />
          ))}
          <span className="text-[8px] text-[var(--text-lo)]">More</span>
        </div>
        <div className="flex items-center gap-4">
          <div className={hmStatCls}>
            <span className={hmStatVal}>{streak}d</span>
            <span className={hmStatKey}>Streak</span>
          </div>
          <div className={hmStatCls}>
            <span className={hmStatVal}>{consistency}%</span>
            <span className={hmStatKey}>Consistency</span>
          </div>
          <div className={hmStatCls}>
            <span className={hmStatVal}>{activeDays}</span>
            <span className={hmStatKey}>Active Days</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AnalyticsPanel() {
  const { data, isLoading } = useStats();
  const { data: heatmapData } = useStatsHeatmap();
  const { data: allTasks = [] } = useTasks();
  const { mutate: updateTask, isPending: updatingTask } = useUpdateTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const STATUS_ORDER: Record<string, number> = { in_progress: 0, todo: 1, pending: 2, waiting: 3 };

  const unscheduledTasks = useMemo(
    () =>
      allTasks
        .filter((t) => !t.startDate && t.status !== 'done' && t.active !== false)
        .sort(
          (a, b) =>
            (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4) ||
            a.name.localeCompare(b.name),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks],
  );

  const insights = useMemo<OracleInsight[]>(() => {
    if (!data) return [];
    const { character, trendVsLastWeek, habits, pendingTasks } = data;
    const overdueCount = pendingTasks.filter((t) => t.overdue).length;
    const firstOverdue = pendingTasks.find((t) => t.overdue);
    const result: OracleInsight[] = [];

    if (character.streak >= 7) {
      result.push({
        icon: '🔥',
        tone: 'gold',
        confidence: Math.min(95, 60 + character.streak),
        tag: 'Active Streak',
        title: `${character.streak}-day streak active`,
        body: 'Consistent daily activity detected. Maintain momentum to unlock higher streak rewards.',
      });
    }

    if (trendVsLastWeek !== null && trendVsLastWeek > 5) {
      result.push({
        icon: '▲',
        tone: 'mint',
        confidence: 85,
        tag: 'Momentum',
        title: `+${trendVsLastWeek}% this week`,
        body: 'Task completion is accelerating. Strong trajectory — keep the cadence.',
      });
    } else if (trendVsLastWeek !== null && trendVsLastWeek < -10) {
      result.push({
        icon: '⚠',
        tone: 'rose',
        confidence: 78,
        tag: 'Dip Detected',
        title: `${trendVsLastWeek}% vs last week`,
        body: 'Activity has slowed this week. Consider reviewing your queue or reducing task scope.',
      });
    }

    if (overdueCount > 0 && firstOverdue) {
      result.push({
        icon: '⚠',
        tone: 'rose',
        confidence: 99,
        tag: 'Action Required',
        title: `${overdueCount} task${overdueCount > 1 ? 's' : ''} overdue`,
        body: `"${firstOverdue.name}" is past its deadline. Address overdue items to restore your completion rate.`,
      });
    }

    if (habits.totalToday > 0) {
      const habitPct = Math.round((habits.doneToday / habits.totalToday) * 100);
      if (habitPct === 100) {
        result.push({
          icon: '✦',
          tone: 'violet',
          confidence: 100,
          tag: 'Ritual Complete',
          title: 'All habits cleared today',
          body: `${habits.doneToday}/${habits.totalToday} habits done. Today's ritual is complete.`,
        });
      } else if (habitPct < 50 && habits.totalToday >= 3) {
        result.push({
          icon: '◈',
          tone: 'cyan',
          confidence: 82,
          tag: 'Habit Alert',
          title: `${habits.doneToday}/${habits.totalToday} habits done today`,
          body: "Less than half of today's habits are complete. A quick session now will protect your streak.",
        });
      }
    }

    if (unscheduledTasks.length >= 5) {
      result.push({
        icon: '◈',
        tone: 'cyan',
        confidence: 77,
        tag: 'Backlog Alert',
        title: `${unscheduledTasks.length} tasks unscheduled`,
        body: 'A growing backlog has no start date. Schedule tasks to maintain forecast accuracy.',
      });
    }

    return result.slice(0, 3);
  }, [data, unscheduledTasks]);

  if (isLoading || !data) {
    return (
      <div className={outer}>
        <div className="flex-1 flex flex-col gap-4 p-4">
          {[120, 80, 160, 80, 100].map((h, i) => (
            <div
              key={i}
              className="rounded-[var(--r-lg)] animate-pulse"
              style={{ height: h, background: 'var(--panel2)' }}
            />
          ))}
        </div>
      </div>
    );
  }

  const {
    tasks,
    habits,
    weekly,
    pendingTasks,
    schedule,
    dailyAverage,
    trendVsLastWeek,
    character,
  } = data;

  const overdueTasks = [...pendingTasks]
    .filter((t) => t.overdue)
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));

  const dayLabels = (weekly.dates ?? []).map(toDayAbbr);

  const chartData = (weekly.dates ?? []).map((_, i) => ({
    day: dayLabels[i] ?? '',
    thisWeek: weekly.tasksDone[i] ?? 0,
    lastWeek: (weekly.lastWeekTasksDone ?? [])[i] ?? 0,
  }));

  const habitChartData = (weekly.dates ?? []).map((_, i) => ({
    day: dayLabels[i] ?? '',
    done: weekly.habitsDone[i] ?? 0,
  }));

  const xpPct = Math.round((character.xp / Math.max(character.xpNext, 1)) * 100);
  const focusHours = schedule ? fmtHours(schedule.completedMinutes) : '—';
  const plannedHours = schedule ? fmtHours(schedule.plannedMinutes) : '—';

  function handleSaveTask(id: string, payload: UpdateTaskPayload, onSuccess: () => void) {
    updateTask(
      { id, ...payload },
      {
        onSuccess: () => {
          setEditingTask(null);
          onSuccess();
        },
      },
    );
  }

  return (
    <>
      <div className={outer}>
        <div className={wrap}>
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <header className={headerCls}>
            <div>
              <div className={pageTagCls}>◆ The Chronicle ◆</div>
              <h1 className={pageTitleCls}>Progression Analytics</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={liveDotCls} />
                <span className="text-[10px] text-[var(--text-lo)]">Live</span>
              </div>
            </div>
          </header>

          {/* ── 01 · Headline Metrics ────────────────────────────────────────── */}
          <section>
            <SectionHead
              num="01"
              title="Headline Metrics"
              // desc="The hero's vital signs, counted in real time."
            />
            <div className="flex flex-col gap-2">
              <FeaturedKpi
                label="Total XP Earned"
                value={character.xp.toLocaleString()}
                sub={`of ${character.xpNext.toLocaleString()} to next level`}
                delta={trendVsLastWeek}
                delay={0}
              />
              <div className="grid grid-cols-2 gap-2">
                <KpiCard
                  label="Completion"
                  value={`${tasks.completionRate}%`}
                  sub={`${tasks.done}/${tasks.total} tasks`}
                  accent="oklch(0.76 0.14 162)"
                  delay={0.06}
                />
                <KpiCard
                  label="Day Streak"
                  value={`${character.streak}d`}
                  accent="var(--gold)"
                  delay={0.09}
                />
                <KpiCard
                  label="Daily Avg · 7d"
                  value={`${dailyAverage ?? 0}`}
                  sub="tasks/day"
                  accent="var(--cyan)"
                  delay={0.12}
                />
                <KpiCard
                  label="Focus Time"
                  value={focusHours}
                  sub={`of ${plannedHours}`}
                  accent="var(--violet)"
                  delay={0.15}
                />
              </div>
            </div>
          </section>

          {/* ── 02 · Performance ─────────────────────────────────────────────── */}
          <section>
            <SectionHead
              num="02"
              title="Performance"
              desc="Task cadence and habit streak over the week."
            />
            <div className="flex flex-col gap-2">
              {/* Task completion chart */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className={glassCard}
              >
                <div className={chartHeadCls}>
                  <div>
                    <div className={chartTitleCls}>Task Completion · 7d</div>
                    <div className={chartSubCls}>THIS WEEK VS LAST WEEK</div>
                  </div>
                  <div className="flex items-center gap-3 text-[7px] text-[var(--text-lo)]">
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block w-2 h-2 rounded-[2px]"
                        style={{ background: 'oklch(0.68 0.22 295 / 0.55)' }}
                      />
                      Last
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block w-2 h-2 rounded-[2px]"
                        style={{ background: 'oklch(0.76 0.14 162)' }}
                      />
                      This
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={90}>
                  <BarChart
                    data={chartData}
                    barGap={2}
                    barCategoryGap="25%"
                    margin={{ top: 4, right: 2, bottom: 0, left: -28 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 7, fill: 'var(--text-lo)', fontFamily: 'var(--f-body)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 7, fill: 'var(--text-lo)', fontFamily: 'var(--f-body)' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'oklch(1 0 0 / 0.03)' }} />
                    <Bar
                      dataKey="lastWeek"
                      fill="oklch(0.68 0.22 295)"
                      fillOpacity={0.45}
                      radius={[2, 2, 0, 0]}
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                    <Bar
                      dataKey="thisWeek"
                      fill="oklch(0.76 0.14 162)"
                      radius={[2, 2, 0, 0]}
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
                      animationBegin={100}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Habit streak chart */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className={glassCard}
              >
                <div className={chartHeadCls}>
                  <div>
                    <div className={chartTitleCls}>Habit Streak · 7d</div>
                    <div className={chartSubCls}>DAILY COMPLETIONS</div>
                  </div>
                  <span className="text-[9px] text-[var(--text-lo)]">
                    {habits.doneToday}/{habits.totalToday} today
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={80}>
                  <BarChart
                    data={habitChartData}
                    barCategoryGap="35%"
                    margin={{ top: 4, right: 2, bottom: 0, left: -28 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 7, fill: 'var(--text-lo)', fontFamily: 'var(--f-body)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 7, fill: 'var(--text-lo)', fontFamily: 'var(--f-body)' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-[var(--panel3)] border border-[var(--border-hi)] rounded-[var(--r-sm)] px-2.5 py-1.5 text-[9px] shadow-lg">
                            <div className="text-[var(--text-lo)] mb-0.5">{label}</div>
                            <span className="font-bold text-[var(--violet)]">
                              {payload[0]?.value} habits
                            </span>
                          </div>
                        );
                      }}
                      cursor={{ fill: 'oklch(1 0 0 / 0.03)' }}
                    />
                    <Bar
                      dataKey="done"
                      fill="oklch(0.68 0.22 295)"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            </div>
          </section>

          {/* ── 03 · Self Improvement ────────────────────────────────────────── */}
          <section>
            <SectionHead num="03" title="Self Improvement" />
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className={glassCard}
            >
              {/* Level + XP */}
              <div className="flex items-center gap-3 mb-3">
                <div className={rankBadgeCls}>
                  <span className="text-[var(--gold)] text-[11px] font-bold [font-family:var(--font-title)] leading-none">
                    {character.rank}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[22px] font-bold text-[var(--text-hi)] [font-family:var(--font-title)] leading-none">
                      Lv.{character.level}
                    </span>
                    <span className="text-[9px] text-[var(--text-lo)]">
                      {character.xp.toLocaleString()} / {character.xpNext.toLocaleString()} XP
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <XpBar xp={character.xp} xpNext={character.xpNext} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[8px] text-[var(--text-lo)] uppercase tracking-wider">
                    Progress
                  </div>
                  <div className="text-[16px] font-bold text-[var(--gold)] [font-family:var(--font-title)] leading-none mt-0.5">
                    {xpPct}%
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-0 pt-2.5 border-t border-[var(--border)]">
                <div className={selfStatCls}>
                  <Icon icon="🔥" className="text-[14px] leading-none text-[var(--gold)]" />
                  <div>
                    <div className="text-[13px] font-bold text-[var(--gold)] leading-none">
                      {character.streak}
                    </div>
                    <div className="text-[7px] text-[var(--text-lo)] mt-[1px]">streak</div>
                  </div>
                </div>
                <div className="w-px h-8 bg-[var(--border)] mx-1" />
                <div className={selfStatCls}>
                  <span className="text-[14px] leading-none">
                    <CoinIcon />
                  </span>
                  <div>
                    <div className="text-[13px] font-bold text-[var(--text-hi)] leading-none">
                      {character.coins.toLocaleString()}
                    </div>
                    <div className="text-[7px] text-[var(--text-lo)] mt-[1px]">coins</div>
                  </div>
                </div>
                <div className="w-px h-8 bg-[var(--border)] mx-1" />
                <div className={selfStatCls}>
                  <span className="text-[14px] leading-none">💎</span>
                  <div>
                    <div className="text-[13px] font-bold text-[var(--text-hi)] leading-none">
                      {character.gems}
                    </div>
                    <div className="text-[7px] text-[var(--text-lo)] mt-[1px]">gems</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          {/* ── 04 · Discipline Heatmap ──────────────────────────────────────── */}
          <section>
            <SectionHead
              num="04"
              title="Discipline Heatmap"
              desc="Every cell is a day. Brighter means more quests vanquished."
            />
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={glassCard}
            >
              <CalendarHeatmap
                activityMap={heatmapData?.activityMap ?? {}}
                streak={character.streak}
              />
            </motion.div>
          </section>

          {/* ── 05 · Oracle Insights ─────────────────────────────────────────── */}
          {insights.length > 0 && (
            <section>
              <SectionHead
                num="05"
                title="Oracle Insights"
                desc={
                  <span style={{ color: 'var(--gold)', opacity: 0.8 }}>
                    ✦ Generated by the System
                  </span>
                }
              />
              <div className="flex flex-col gap-2">
                {insights.map((ins, i) => (
                  <InsightCard key={i} insight={ins} delay={i * 0.06} />
                ))}
              </div>
            </section>
          )}

          {/* ── 06 · Needs Attention ─────────────────────────────────────────── */}
          {overdueTasks.length > 0 && (
            <section>
              <SectionHead
                num="06"
                title="Needs Attention"
                desc={
                  <span style={{ color: 'oklch(0.72 0.18 5)', fontWeight: 700 }}>
                    {overdueTasks.length} overdue
                  </span>
                }
              />
              <div className="flex flex-col gap-1.5">
                {overdueTasks.map((t, i) => (
                  <OverdueRow key={t.id} task={t} delay={i * 0.05} />
                ))}
              </div>
            </section>
          )}

          {overdueTasks.length === 0 && tasks.total > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={allClearBanner}
            >
              <span className="text-[18px]">✦</span>
              <span className="text-[11px] font-semibold text-[oklch(0.76_0.14_162)]">
                No overdue tasks
              </span>
            </motion.div>
          )}

          {/* ── 07 · Backlog ─────────────────────────────────────────────────── */}
          {unscheduledTasks.length > 0 && (
            <section>
              <SectionHead
                num="07"
                title="Backlog"
                desc={
                  <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                    {unscheduledTasks.length} unscheduled
                  </span>
                }
              />
              <div className="flex flex-col gap-1.5">
                {unscheduledTasks.slice(0, 15).map((t, i) => (
                  <UnscheduledRow key={t.id} task={t} delay={i * 0.03} onEdit={setEditingTask} />
                ))}
                {unscheduledTasks.length > 15 && (
                  <div className="text-[9px] text-[var(--text-lo)] text-center py-1">
                    +{unscheduledTasks.length - 15} more without a date
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <EditTaskModal
        task={editingTask ? taskToUITask(editingTask) : null}
        open={editingTask !== null}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveTask}
        saving={updatingTask}
      />
    </>
  );
}

// ── Style Constants ───────────────────────────────────────────────────────────

const outer = 'flex-1 overflow-hidden min-h-0 flex flex-col';
const wrap = 'flex-1 overflow-y-auto p-4 flex flex-col gap-6 min-h-0';

// Glass panel base — gradient bg, backdrop blur, hover lift + gold border glow
const glassBase =
  'relative overflow-hidden ' +
  'bg-gradient-to-br from-[color-mix(in_oklab,var(--panel)_92%,transparent)] to-[color-mix(in_oklab,var(--panel2)_88%,transparent)] ' +
  'border border-[var(--border)] rounded-[var(--r-lg)] backdrop-blur-md ' +
  'transition-all duration-300 ease-out ' +
  'hover:-translate-y-[3px] hover:border-[oklch(0.74_0.17_85/0.4)]';

const glassCard = glassBase + ' p-4';
const featuredCard = glassBase + ' px-5 py-5';
const kpiCard = glassBase + ' px-3 py-3 flex flex-col';

// KPI typography
const kpiLabelCls =
  'text-[8px] uppercase tracking-[0.12em] text-[var(--text-lo)] [font-family:var(--font-title)] mb-1.5';
const kpiValCls =
  'text-[22px] font-bold text-[var(--text-hi)] leading-none [font-family:var(--font-title)] tabular-nums';
const featuredValCls =
  'text-[32px] font-bold leading-none [font-family:var(--font-title)] tabular-nums ' +
  'text-transparent bg-clip-text bg-gradient-to-r from-[var(--gold)] to-[oklch(0.74_0.17_85)]';

// Section head — number on left, title + desc stacked on right
const sectionHeadCls = 'flex items-baseline gap-4 mb-4';
const secNumCls =
  '[font-family:var(--f-mono)] text-[11px] font-medium text-[var(--gold)] opacity-90 leading-none shrink-0 min-w-[2ch] pt-[2px]';
const secTitleCls =
  '[font-family:var(--font-title)] text-[18px] sm:text-[20px] font-bold text-[var(--text-hi)] ' +
  'tracking-[-0.02em] leading-[1.1] mb-0.5';
const secDescCls = 'text-[11px] text-[var(--text-lo)] leading-[1.6]';

// Chart card internals
const chartHeadCls = 'flex items-start justify-between mb-3';
const chartTitleCls =
  'text-[11px] font-bold text-[var(--text-hi)] [font-family:var(--font-title)] leading-snug';
const chartSubCls =
  'text-[8px] text-[var(--text-lo)] tracking-[0.08em] mt-0.5 [font-family:var(--f-mono)]';

// Page header
const headerCls = 'flex items-start justify-between gap-3 flex-wrap mb-1';
const pageTagCls =
  'text-[8px] [font-family:var(--f-mono)] text-[var(--gold)] tracking-[0.2em] opacity-60 mb-1 uppercase';
const pageTitleCls =
  'text-[44px] font-bold [font-family:var(--font-title)] leading-none tracking-[-0.02em] ' +
  'text-transparent bg-clip-text bg-gradient-to-r bg-[linear-gradient(135deg,var(--text-hi)_0%,var(--gold)_65%,var(--violet)_100%)]';
const liveDotCls = 'inline-block w-1.5 h-1.5 rounded-full bg-[oklch(0.76_0.14_162)] animate-pulse';

// Rank badge in self improvement card
const rankBadgeCls =
  'w-[40px] h-[40px] rounded-[var(--r-md)] shrink-0 flex items-center justify-center ' +
  'bg-[oklch(0.74_0.17_85/0.1)] border border-[oklch(0.74_0.17_85/0.3)]';

const selfStatCls = 'flex items-center gap-2 flex-1 px-2';

// Insight card — glass panel with coloured left border
const insightCard =
  'relative overflow-hidden ' +
  'bg-gradient-to-br from-[color-mix(in_oklab,var(--panel)_92%,transparent)] to-[color-mix(in_oklab,var(--panel2)_88%,transparent)] ' +
  'border border-[var(--border)] border-l-[3px] rounded-[var(--r-lg)] backdrop-blur-md ' +
  'px-3 py-3 transition-all duration-300 ease-out';

// Overdue row
const overdueRow =
  'flex items-center gap-2.5 px-3 py-2 ' +
  'bg-gradient-to-br from-[color-mix(in_oklab,var(--panel)_92%,transparent)] to-[color-mix(in_oklab,var(--panel2)_88%,transparent)] ' +
  'border border-[oklch(0.72_0.18_5/0.18)] rounded-[var(--r-lg)] backdrop-blur-md ' +
  'hover:border-[oklch(0.72_0.18_5/0.4)] transition-colors duration-200';
const lateBadge =
  'text-[7px] font-bold [font-family:var(--font-title)] uppercase tracking-wider px-1.5 py-[2px] rounded ' +
  'bg-[oklch(0.72_0.18_5/0.1)] border border-[oklch(0.72_0.18_5/0.25)] text-[oklch(0.72_0.18_5)]';

// Unscheduled row
const unscheduledRow =
  'w-full flex items-center gap-2.5 px-3 py-2 text-left ' +
  'bg-gradient-to-br from-[color-mix(in_oklab,var(--panel)_92%,transparent)] to-[color-mix(in_oklab,var(--panel2)_88%,transparent)] ' +
  'border border-[var(--border)] rounded-[var(--r-lg)] backdrop-blur-md ' +
  'hover:border-[oklch(0.74_0.17_85/0.35)] transition-colors group';
const scheduleBtnCls =
  'text-[8px] font-bold [font-family:var(--font-title)] tracking-[0.08em] ' +
  'text-[var(--text-lo)] group-hover:text-[var(--gold)] transition-colors shrink-0';

// Heatmap footer
const heatmapFoot =
  'flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)] flex-wrap gap-2';
const hmStatCls = 'flex flex-col items-center';
const hmStatVal =
  'text-[12px] font-bold text-[var(--text-hi)] [font-family:var(--font-title)] leading-none';
const hmStatKey = 'text-[7px] text-[var(--text-lo)] mt-[2px] uppercase tracking-wider';

const allClearBanner = 'flex items-center justify-center gap-2 py-3 text-[var(--text-lo)]';
