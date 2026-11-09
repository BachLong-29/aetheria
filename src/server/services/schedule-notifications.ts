import { after } from 'next/server';
import mongoose from 'mongoose';

import { NotificationGenStateModel } from '@/server/models/notification-gen-state.model';
import { NotificationModel } from '@/server/models/notification.model';
import { DEFAULT_SCHEDULE_SETTINGS, UserSettingModel } from '@/server/models/user-setting.model';
import { buildCalendar } from '@/server/services/schedule-engine';
import { computeCapacity, detectConflicts } from '@/server/services/schedule-insights';
import { enforceNotificationCap } from '@/server/services/notification-cleanup';

interface PendingNotification {
  type: 'reminder' | 'deadline' | 'overload' | 'conflict';
  title: string;
  message: string;
  dedupeKey: string;
  expiresAt: Date;
  /** Hidden until then; omit to show at once. */
  notifyAt?: Date;
  entityId?: string;
}

// Persistent (DB-backed) throttle: this rebuilds the whole calendar + writes
// upserts, so skip it if we already ran for this user within the window —
// every notification-list read (including ones triggered by mark-read/dismiss
// invalidation) would otherwise redo this on every request. An in-memory Map
// doesn't work here because Vercel serverless invocations don't share
// process state, so the throttle is claimed atomically in Mongo instead.
const REGEN_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Atomically claims the right to (re)generate this user's schedule
 * notifications, returning `false` if another request already claimed a
 * still-fresh slot. Relies on the unique index on `userId`: when no fresh
 * doc matches the filter, the upsert either creates the first-ever doc
 * (success) or collides with an existing-but-fresh one (duplicate key ->
 * someone else holds the claim -> not our turn).
 */
async function claimGenerationSlot(userId: string): Promise<boolean> {
  const uid = new mongoose.Types.ObjectId(userId);
  const cutoff = new Date(Date.now() - REGEN_THROTTLE_MS);
  try {
    await NotificationGenStateModel.findOneAndUpdate(
      { userId: uid, lastGeneratedAt: { $lt: cutoff } },
      { $set: { userId: uid, lastGeneratedAt: new Date() } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

function toKey(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** `minutes` after midnight of `day` (never before it). */
function minutesToday(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(0, Math.max(0, minutes), 0, 0);
  return d;
}

function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Claims the generation slot (fast, indexed) and, if claimed, schedules the
 * actual calendar rebuild + notification upserts to run via `after()` —
 * after the response has already been sent, instead of blocking the
 * notifications-list request that triggered it. Idempotent via dedupeKey.
 */
export async function generateScheduleNotifications(userId: string): Promise<void> {
  const claimed = await claimGenerationSlot(userId);
  if (!claimed) return;

  after(() =>
    runScheduleNotificationGeneration(userId).catch((err) => {
      console.error('[notifications] background schedule generation failed', err);
    }),
  );
}

async function runScheduleNotificationGeneration(userId: string): Promise<void> {
  const setting = await UserSettingModel.findOne({ userId }).lean();
  const sched = setting?.schedule ?? DEFAULT_SCHEDULE_SETTINGS;

  const today = new Date();
  const todayKey = toKey(today);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  // Window covers today + deadline look-ahead
  const lookAhead = new Date(today);
  lookAhead.setDate(lookAhead.getDate() + (sched.deadlineWarningDays ?? 1));
  const toKeyAhead = toKey(lookAhead);

  const items = await buildCalendar(userId, todayKey, toKeyAhead);
  const todayItems = items.filter((i) => i.date === todayKey);

  const pending: PendingNotification[] = [];
  const minutesNow = nowMinutes();

  // ── Reminders — upcoming timed items today, not done ─────────────────────
  for (const item of todayItems) {
    if (item.status !== 'planned' || item.startTime === null) continue;
    if (item.sourceType === 'task') continue; // reminders for habit/quest only
    const start = timeToMinutes(item.startTime);
    const lead = item.sourceType === 'habit' ? sched.habitReminderLead : sched.questReminderLead;
    if (start < minutesNow) continue; // already past
    pending.push({
      type: 'reminder',
      title: `⏰ ${item.title}`,
      message: `Sắp tới lúc ${item.startTime}${lead ? ` (nhắc trước ${lead} phút)` : ''}`,
      dedupeKey: `reminder:${item.id}`,
      expiresAt: endOfToday,
      notifyAt: minutesToday(today, start - lead),
    });
  }

  // ── Deadline warnings — quests/tasks due within the look-ahead window ────
  for (const item of items) {
    const isDeadline = item.meta?.deadline || item.sourceType === 'task';
    if (!isDeadline || item.status === 'done') continue;
    if (item.date < todayKey || item.date > toKeyAhead) continue;
    const when = item.date === todayKey ? 'hôm nay' : `ngày ${item.date}`;
    pending.push({
      type: 'deadline',
      title: `⚠ Đến hạn: ${item.title}`,
      message: `"${item.title}" đến hạn ${when}`,
      // Scoped by todayKey (like overload/conflict below) so this regenerates
      // each day instead of being created once and then silently disappearing
      // after its first day's expiresAt passes.
      dedupeKey: `deadline:${todayKey}:${item.sourceType}:${item.sourceId}`,
      expiresAt: endOfToday,
      entityId: item.sourceId,
    });
  }

  // ── Overload warning — today's capacity ──────────────────────────────────
  const [capacity] = computeCapacity(todayItems, [todayKey], sched.dailyCapacityMinutes ?? 600);
  if (capacity && capacity.status === 'overloaded') {
    const h = (n: number) => (n / 60).toFixed(1).replace(/\.0$/, '');
    pending.push({
      type: 'overload',
      title: '🔥 Ngày quá tải',
      message: `Hôm nay đã lên ${h(capacity.plannedMinutes)}h / ${h(capacity.availableMinutes)}h khả dụng`,
      dedupeKey: `overload:${todayKey}`,
      expiresAt: endOfToday,
    });
  }

  // ── Conflict warnings — today's hard conflicts ───────────────────────────
  const conflicts = detectConflicts(todayItems, sched.minBreakMinutes ?? 15);
  for (const c of conflicts.filter((x) => x.type === 'hard')) {
    pending.push({
      type: 'conflict',
      title: '✕ Trùng lịch',
      message: `${c.a.title} (${c.a.startTime}) trùng giờ ${c.b.title} (${c.b.startTime})`,
      dedupeKey: `conflict:${todayKey}:${c.a.id}:${c.b.id}`,
      expiresAt: endOfToday,
    });
  }

  if (pending.length === 0) return;

  const uid = new mongoose.Types.ObjectId(userId);
  await Promise.all(
    pending.map((n) =>
      NotificationModel.updateOne(
        { userId: uid, dedupeKey: n.dedupeKey },
        {
          $setOnInsert: {
            userId: uid,
            type: n.type,
            title: n.title,
            message: n.message,
            dedupeKey: n.dedupeKey,
            expiresAt: n.expiresAt,
            notifyAt: n.notifyAt,
            entityId: n.entityId,
            isRead: false,
          },
        },
        { upsert: true },
      ),
    ),
  );

  await enforceNotificationCap(uid);
}
