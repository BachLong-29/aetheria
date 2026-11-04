'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/common/Icon';
import { cn } from '@/libs/utils';

import type { UITask, TaskSlot } from '../../data/mock';
import { sidePanel, panelHead, panelEyebrow, panelTitle } from '../shared/styles';
import { iconAsText } from '@/components/common/icon-registry';

// ─── Slot config ──────────────────────────────────────────────────────────────

const SLOT_ORDER: TaskSlot[] = ['morning', 'deep', 'afternoon', 'evening'];

interface SlotConfig {
  startHour: number;
  endHour: number;
  timeLabel: string; // displayed start time (HH:MM)
}

const SLOT_CONFIG: Record<TaskSlot, SlotConfig> = {
  morning: { startHour: 6, endHour: 10, timeLabel: '06:00' },
  deep: { startHour: 10, endHour: 13, timeLabel: '10:00' },
  afternoon: { startHour: 13, endHour: 17, timeLabel: '13:00' },
  evening: { startHour: 17, endHour: 22, timeLabel: '17:00' },
};

// ─── Internal types ───────────────────────────────────────────────────────────

interface ScheduleEntry {
  time: string;
  endTime: string;
  label: string;
  icon?: string;
  taskId: string;
  source: UITask['source'];
  done: boolean;
  active: boolean;
}

interface ActivityItem {
  icon: string;
  text: string;
  ts: string;
  kind: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addMins(hhmm: string, mins: number): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.min(Math.floor(total / 60), 23);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function nowMins(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function toHHMM(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Derive ordered schedule entries from today's tasks */
function buildSchedule(tasks: UITask[]): ScheduleEntry[] {
  const currentHour = new Date().getHours();
  const entries: ScheduleEntry[] = [];

  for (const slot of SLOT_ORDER) {
    const cfg = SLOT_CONFIG[slot];
    const slotTasks = tasks
      .filter((t) => t.slot === slot)
      .sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)); // done tasks sink to bottom within slot

    slotTasks.forEach((t, i) => {
      // Stagger tasks in the same slot by est (or 30-min increments)
      const prevMins = slotTasks.slice(0, i).reduce((acc, prev) => acc + (prev.est ?? 30), 0);
      const startMins = cfg.startHour * 60 + prevMins;
      const startLabel = toHHMM(Math.min(startMins, (cfg.endHour - 1) * 60));
      const endLabel = addMins(startLabel, t.est ?? 30);

      const isActive = !t.done && currentHour >= cfg.startHour && currentHour < cfg.endHour;

      entries.push({
        time: startLabel,
        endTime: endLabel,
        label: t.title,
        icon: t.icon,
        taskId: t.id,
        source: t.source,
        done: t.done ?? false,
        active: isActive,
      });
    });
  }

  return entries;
}

/** Build activity items from done / in-progress tasks */
function buildActivity(
  tasks: UITask[],
  translate: (key: string, values?: Record<string, string | number>) => string,
): ActivityItem[] {
  const items: ActivityItem[] = [];

  // In-progress tasks first (show as "active sessions")
  tasks
    .filter((task) => task.status === 'in_progress' && !task.done)
    .slice(0, 2)
    .forEach((task) => {
      items.push({
        icon: '◈',
        text: translate('scheduleStrip.activityInProgress', { title: task.title }),
        ts: translate('scheduleStrip.activityNow'),
        kind: 'start',
      });
    });

  // Completed tasks + XP/coins
  tasks
    .filter((task) => task.done)
    .slice(0, 4)
    .forEach((task) => {
      items.push({
        icon: '✓',
        text: translate('scheduleStrip.activityCleared', {
          title: [iconAsText(task.icon), task.title].filter(Boolean).join(' '),
        }),
        ts: translate('scheduleStrip.activityToday'),
        kind: 'done',
      });
      if (task.xp > 0) {
        items.push({
          icon: '✦',
          text: translate('scheduleStrip.activityXp', { xp: task.xp, coins: task.coins }),
          ts: '',
          kind: 'xp',
        });
      }
    });

  return items.slice(0, 6);
}

/** "Xm → next" label */
function nextTaskLabel(
  entries: ScheduleEntry[],
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const now = nowMins();

  // Find next upcoming entry (not done, not active)
  const next = entries
    .filter((e) => !e.done && !e.active)
    .map((e) => {
      const [h = 0, m = 0] = e.time.split(':').map(Number);
      return { ...e, startMins: h * 60 + m };
    })
    .filter((e) => e.startMins > now)
    .sort((a, b) => a.startMins - b.startMins)[0];

  if (!next) return t('scheduleStrip.none');
  const diff = next.startMins - now;
  if (diff < 60) return t('scheduleStrip.nextInMinutes', { count: diff });
  return t('scheduleStrip.nextInHoursMinutes', {
    hours: Math.floor(diff / 60),
    minutes: diff % 60,
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ScheduleStripProps {
  /** Today's tasks (day === 0) — already filtered before passing */
  tasks: UITask[];
}

export function ScheduleStrip({ tasks }: ScheduleStripProps) {
  const t = useTranslations('tasks');
  const entries = useMemo(() => buildSchedule(tasks), [tasks]);
  const activity = useMemo(() => buildActivity(tasks, t), [tasks, t]);
  const nextLabel = useMemo(() => nextTaskLabel(entries, t), [entries, t]);

  return (
    <div className={cn(sidePanel, 'flex-1 flex flex-col min-h-0')}>
      <div className={panelHead}>
        <span className={panelEyebrow}>{t('scheduleStrip.eyebrow')}</span>
        <h3 className={panelTitle}>{t('scheduleStrip.title')}</h3>
        <div className="flex-1" />
        {nextLabel !== t('scheduleStrip.none') && (
          <span className="text-[9px] text-[var(--text-lo)]">{nextLabel}</span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--text-lo)]">
          <div className="text-[22px] opacity-30 mb-1.5">◇</div>
          <div className="text-[9px] font-[var(--font-title)] tracking-[0.14em]">
            {t('scheduleStrip.empty')}
          </div>
        </div>
      ) : (
        <div className="flex flex-col overflow-y-auto mt-1 flex-1 min-h-0">
          {entries.map((entry, i) => (
            <ScheduleRow key={entry.taskId} entry={entry} isLast={i === entries.length - 1} />
          ))}
        </div>
      )}

      {/* Activity feed */}
      {activity.length > 0 && <ActivityFeed items={activity} />}
    </div>
  );
}

// ─── Schedule row ─────────────────────────────────────────────────────────────

function ScheduleRow({ entry, isLast }: { entry: ScheduleEntry; isLast: boolean }) {
  const t = useTranslations('tasks');

  return (
    <div className={cn('flex items-start gap-2 py-[5px]', entry.done && 'opacity-50')}>
      {/* Time column */}
      <div className="shrink-0 text-right w-[38px]">
        <div className="text-[8px] text-[var(--text-mid)]">{entry.time}</div>
        <div className="text-[7px] text-[var(--text-lo)]">{entry.endTime}</div>
      </div>

      {/* Spine */}
      <div className="flex flex-col items-center self-stretch shrink-0">
        <div
          className={cn(
            'w-2 h-2 rounded-full border border-[var(--border)] shrink-0',
            entry.done && 'bg-[var(--mint)] border-[var(--mint)]',
            entry.active && 'bg-[var(--cyan)] border-[var(--cyan)] shadow-[0_0_6px_var(--cyan)]',
          )}
        />
        {!isLast && <div className="w-px flex-1 bg-[var(--border)] mt-[2px]" />}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-1 min-w-0">
          {entry.icon && <Icon icon={entry.icon} className="text-[11px] shrink-0 leading-none" />}
          <span className="text-[10px] text-[var(--text-hi)] font-medium truncate">
            {entry.label}
          </span>
        </div>
        <div className="text-[8px] mt-[1px] flex items-center gap-1.5">
          {entry.active && (
            <span className="text-[var(--cyan)] font-bold">{t('scheduleStrip.now')}</span>
          )}
          {entry.done && <span className="text-[var(--mint)]">{t('scheduleStrip.done')}</span>}
          {entry.source && entry.source !== 'mock' && (
            <span className="text-[var(--text-dim)] uppercase tracking-[0.1em]">
              {entry.source}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  done: 'text-[var(--mint)]',
  xp: 'text-[var(--gold)]',
  start: 'text-[var(--cyan)]',
  streak: 'text-[var(--violet)]',
};

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const t = useTranslations('tasks');

  return (
    <div className="mt-2 pt-2 border-t border-[var(--border)] shrink-0">
      <div className="text-[8px] tracking-[0.12em] text-[var(--text-lo)] font-bold mb-1.5">
        {t('scheduleStrip.recentEchoes')}
      </div>
      <ul className="flex flex-col gap-[3px]">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 py-[3px]">
            <span
              className={cn(
                'text-[10px] shrink-0',
                KIND_COLORS[item.kind] ?? 'text-[var(--text-lo)]',
              )}
            >
              {item.icon}
            </span>
            <span className="text-[9px] text-[var(--text-mid)] flex-1 truncate">{item.text}</span>
            {item.ts && (
              <span className="text-[8px] text-[var(--text-lo)] shrink-0">{item.ts}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
