import { UserProfileModel } from '@/server/models/user-profile.model';
import { buildCalendar } from '@/server/services/schedule-engine';

/** Days looked back in one go; a longer silence is read as a broken streak. */
const MAX_SCAN_DAYS = 62;

/** `none`: nothing was asked of the day · `done`: all of it finished · `incomplete`: some left. */
type DayState = 'none' | 'done' | 'incomplete';

const shiftDay = (day: string, by: number) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + by * 86_400_000).toISOString().slice(0, 10);

/**
 * What each day in the range asked of the user: every habit, scheduled task session and quest
 * on it. Events are reminders, and a task with only an estimate has no session, so neither is
 * owed. Days that ask nothing are absent from the map.
 */
async function dayStates(userId: string, from: string, to: string): Promise<Map<string, DayState>> {
  const items = await buildCalendar(userId, from, to);
  const states = new Map<string, DayState>();
  for (const item of items) {
    if (item.sourceType === 'event') continue;
    if (item.sourceType === 'task' && item.startTime === null) continue;
    if (item.status !== 'done') states.set(item.date, 'incomplete');
    else if (!states.has(item.date)) states.set(item.date, 'done');
  }
  return states;
}

/**
 * Brings the streak up to date and returns it. A day counts only when everything it asked for
 * is done: past days are settled oldest first (+1 for a finished day, back to 0 for one with
 * work left, unchanged for one that asked nothing), and with `includeToday` today is counted
 * the moment its last item is finished. Today is never settled while work remains, so it can
 * still be completed. `lastActiveDay` is the last day folded in, and the write only applies
 * while that is still what was read, so two requests cannot count the same day twice.
 */
export async function syncStreak(
  userId: string,
  today: string,
  includeToday: boolean,
): Promise<number> {
  const profile = await UserProfileModel.findOne({ userId }).select('streak lastActiveDay');
  if (!profile) return 0;

  const yesterday = shiftDay(today, -1);
  const settled = profile.lastActiveDay ?? yesterday;
  if (settled >= (includeToday ? today : yesterday)) return profile.streak;

  let streak = profile.streak;
  let from = shiftDay(settled, 1);
  const earliest = shiftDay(yesterday, 1 - MAX_SCAN_DAYS);
  if (from < earliest) {
    streak = 0;
    from = earliest;
  }

  const states = await dayStates(userId, from, includeToday ? today : yesterday);
  for (let day = from; day <= yesterday; day = shiftDay(day, 1)) {
    const state = states.get(day);
    if (state === 'incomplete') streak = 0;
    else if (state === 'done') streak += 1;
  }
  let upTo = yesterday > settled ? yesterday : settled;
  if (includeToday && states.get(today) === 'done') {
    streak += 1;
    upTo = today;
  }

  const written = await UserProfileModel.updateOne(
    { userId, lastActiveDay: profile.lastActiveDay ?? null },
    { $set: { streak, lastActiveDay: upTo } },
  );
  if (written.matchedCount > 0) return streak;
  // Another request settled these days first; use what it wrote.
  const latest = await UserProfileModel.findOne({ userId }).select('streak');
  return latest?.streak ?? streak;
}
