import mongoose from 'mongoose';
import { after } from 'next/server';

import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { NotificationModel } from '@/server/models/notification.model';
import { TransactionModel } from '@/server/models/transaction.model';
import { UserSettingModel } from '@/server/models/user-setting.model';
import { WalletModel } from '@/server/models/wallet.model';
import { enforceNotificationCap } from '@/server/services/notification-cleanup';
import { excludedCategoryIds } from '@/server/services/finance-exclusions';

// In-process throttle, same rationale as generateBudgetNotifications: this
// runs three queries, and every notification-list read would otherwise redo
// them. Losing the throttle on a cold serverless instance only costs one
// extra pass — the upsert below is idempotent either way.
const REGEN_THROTTLE_MS = 5 * 60 * 1000;
const lastGeneratedAt = new Map<string, number>();

/**
 * Names worth chasing the first time, matched against the user's own finance
 * categories. Substrings, lower-cased: "ăn" is meant to catch "Ăn sáng",
 * "Ăn trưa" and "Ăn tối" as three separate things to remember.
 */
const DEFAULT_CATEGORY_KEYWORDS = ['giữ xe', 'xăng', 'cafe', 'coffee', 'ăn', 'church', 'nhà thờ'];

interface CategoryLite {
  _id: mongoose.Types.ObjectId;
  name: string;
}

/**
 * Which categories this reminder covers.
 *
 * `undefined` means the user has never opened the setting, so the defaults are
 * derived from their own category names. An empty array means they looked and
 * chose none, which is honoured as-is.
 */
export function resolveCashLogCategoryIds(
  stored: mongoose.Types.ObjectId[] | undefined,
  categories: CategoryLite[],
): mongoose.Types.ObjectId[] {
  if (stored !== undefined) return stored;

  return categories
    .filter((c) => {
      const name = c.name.toLowerCase();
      return DEFAULT_CATEGORY_KEYWORDS.some((keyword) => name.includes(keyword));
    })
    .map((c) => c._id);
}

/** Wall-clock parts in a given IANA zone, or in UTC if the zone is unusable. */
function zonedParts(date: Date, timeZone: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
  } catch {
    // A stored timezone can be anything the user typed. Falling back beats
    // throwing inside a best-effort generator.
    return zonedParts(date, 'UTC');
  }

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  // `hour12: false` yields 24 rather than 0 for midnight in some engines.
  const hour = Number(get('hour')) % 24;

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
  };
}

/** Offset of a zone from UTC at a given instant, in minutes. */
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const { date: day, minutes } = zonedParts(date, timeZone);
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // Seconds are dropped on both sides, so round to the nearest minute.
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function toMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Upsert the reminder for one day, if anything is still unrecorded for it.
 *
 * Returns whether it wrote, so the caller only pays for the notification cap
 * when there was something to cap.
 */
async function remindForDay(args: {
  uid: mongoose.Types.ObjectId;
  dayISO: string;
  dayStart: Date;
  dayEnd: Date;
  categories: CategoryLite[];
  watched: Set<string>;
  cashWalletIds: mongoose.Types.ObjectId[];
  isToday: boolean;
}): Promise<boolean> {
  const { uid, dayISO, dayStart, dayEnd, categories, watched, cashWalletIds, isToday } = args;

  const excluded = await excludedCategoryIds(uid);

  const logged =
    cashWalletIds.length === 0
      ? []
      : await TransactionModel.find({
          userId: uid,
          type: 'expense',
          walletId: { $in: cashWalletIds },
          date: { $gte: dayStart, $lt: dayEnd },
          // A correction is not a spend worth remembering to write down.
          categoryId: { $nin: excluded },
          // An overdrawn auto transaction does not count as "already written
          // down" — see transaction.model.ts.
          overdraft: { $ne: true },
        })
          .select('categoryId')
          .lean();

  const loggedIds = new Set(logged.map((t) => t.categoryId.toString()));
  const missing = categories.filter(
    (c) => watched.has(c._id.toString()) && !loggedIds.has(c._id.toString()),
  );
  if (missing.length === 0) return false;

  const names = missing.map((c) => c.name).join(' · ');
  const dedupeKey = `cash-log:${dayISO}`;

  await NotificationModel.updateOne(
    { userId: uid, dedupeKey },
    {
      $setOnInsert: {
        userId: uid,
        type: 'cash-log',
        title: isToday ? '💵 Log today\u2019s cash' : '💵 Log yesterday\u2019s cash',
        message: `Nothing recorded yet for: ${names}`,
        dedupeKey,
        // Lapses at the end of the following day, so a reminder is readable
        // the morning after without piling up for a week.
        expiresAt: new Date(dayEnd.getTime() + 24 * 60 * 60_000),
      },
    },
    { upsert: true },
  );

  return true;
}

/**
 * Upsert the "write down today's cash" reminders, listing only the categories
 * with no cash spending recorded yet.
 *
 * Covers **today and yesterday**. Nothing runs on a schedule here — the
 * reminders are materialised when the bell is read — so a night the app was
 * never opened would otherwise pass with the reminder never existing at all.
 * Checking yesterday too is what makes "remind me at 22:00" survive going to
 * bed early.
 *
 * Exactly one day back, not more: a week of missed reminders arriving at once
 * is noise, and cash you cannot remember is not worth chasing.
 *
 * Idempotent via dedupeKey, so it is safe to call on every notification read.
 * Silent when there is nothing to chase: a reminder that fires on a day the
 * user already did the work is a reminder they learn to ignore.
 */
export async function generateCashLogNotifications(userId: string): Promise<void> {
  const lastRun = lastGeneratedAt.get(userId);
  if (lastRun !== undefined && Date.now() - lastRun < REGEN_THROTTLE_MS) return;
  lastGeneratedAt.set(userId, Date.now());

  // The queries run once the response has gone out, like the schedule generator: the list read
  // must not wait on them. A reminder written here shows on the next read.
  after(() =>
    runCashLogGeneration(userId).catch((err) => {
      console.error('[notifications] background cash-log generation failed', err);
    }),
  );
}

async function runCashLogGeneration(userId: string): Promise<void> {
  const uid = new mongoose.Types.ObjectId(userId);
  const setting = await UserSettingModel.findOne({ userId: uid }).lean();
  if (!setting?.cashLog?.enabled) return;

  const now = new Date();
  const timeZone = setting.timezone || 'UTC';
  const { date: today, minutes: nowMinutes } = zonedParts(now, timeZone);

  const categories = await FinanceCategoryModel.find({ userId: uid, type: 'expense' })
    .select('_id name')
    .lean();
  const watchedIds = resolveCashLogCategoryIds(setting.cashLog.categoryIds, categories);
  if (watchedIds.length === 0) return;
  const watched = new Set(watchedIds.map((id) => id.toString()));

  // Cash only: bank and e-wallet spending arrives through the SePay webhook
  // without anyone typing it, which is the whole reason this reminder exists.
  const cashWallets = await WalletModel.find({ userId: uid, type: 'cash' }).select('_id').lean();
  const cashWalletIds = cashWallets.map((w) => w._id);

  // The day's bounds as absolute instants, so the query matches the user's
  // day rather than the server's.
  const offset = zoneOffsetMinutes(now, timeZone);
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  const dayStart = new Date(Date.UTC(y, m - 1, d) - offset * 60_000);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  // Yesterday's bounds are derived from an instant inside yesterday rather
  // than by subtracting 24h from today's start: in a zone that shifts for DST
  // those two are not the same day length.
  const midYesterday = new Date(dayStart.getTime() - 12 * 60 * 60_000);
  const yesterday = zonedParts(midYesterday, timeZone).date;
  const yesterdayOffset = zoneOffsetMinutes(midYesterday, timeZone);
  const [yy = 0, ym = 1, yd = 1] = yesterday.split('-').map(Number);
  const yesterdayStart = new Date(Date.UTC(yy, ym - 1, yd) - yesterdayOffset * 60_000);

  const shared = { uid, categories, watched, cashWalletIds };

  // Yesterday is over whatever the clock says, so it needs no time check.
  const wroteYesterday = await remindForDay({
    ...shared,
    dayISO: yesterday,
    dayStart: yesterdayStart,
    dayEnd: dayStart,
    isToday: false,
  });

  const wroteToday =
    nowMinutes < toMinutes(setting.cashLog.time)
      ? false
      : await remindForDay({
          ...shared,
          dayISO: today,
          dayStart,
          dayEnd,
          isToday: true,
        });

  if (wroteYesterday || wroteToday) await enforceNotificationCap(uid);
}
