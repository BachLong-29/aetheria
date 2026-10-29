'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/libs/utils';
import { useUIStore } from '@/stores/ui.store';

import { Link } from '@/i18n/navigation';
import { ScheduleDisplayMenu } from './ScheduleDisplayMenu';
import { useScheduleState, type ScheduleSubTab } from '../../hooks/useScheduleState';
import type { CenterTab, Quest } from '../../types';
import { MonthView } from './MonthView';
import { ScheduleDayViewPanel } from './ScheduleDayViewPanel';
import { WeekView } from './WeekView';

/** A one-shot request to switch the schedule sub-tab; `nonce` re-triggers even for a repeat target. */
export interface ScheduleSubTabRequest {
  tab: ScheduleSubTab;
  nonce: number;
}

interface ScheduleViewProps {
  onAddQuest?: (quest: Quest) => void;
  onNavigateTab?: (tab: CenterTab) => void;
  subTabRequest?: ScheduleSubTabRequest | null;
}

/**
 * Sub-tabs on offer. Month is parked for now — put `'month'` back here and the
 * view, its state and its navigation all light up again; nothing else was
 * removed.
 */
const SUB_TABS = ['day', 'week'] as const;

export function ScheduleView({ onAddQuest, onNavigateTab, subTabRequest }: ScheduleViewProps) {
  const tDash = useTranslations('dashboard');
  const tShare = useTranslations('share');
  const {
    tab,
    year,
    dayDate,
    weekStart,
    month,
    display,
    setTab,
    setYear,
    setDayDate,
    setWeekStart,
    setMonth,
    setDisplay,
    getMonday,
  } = useScheduleState();

  // Apply a one-shot navigation intent (e.g. from clicking a notification)
  // whenever it's set — works whether ScheduleView is already mounted or was
  // just mounted by a tab switch, unlike a mount-only localStorage read.
  const openShareAgenda = useUIStore((s) => s.openShareAgenda);
  const pendingNav = useUIStore((s) => s.pendingScheduleNav);
  const setPendingNav = useUIStore((s) => s.setPendingScheduleNav);
  const monthHidden = !(SUB_TABS as readonly ScheduleSubTab[]).includes('month');
  useEffect(() => {
    if (monthHidden && tab === 'month') setTab('day');
  }, [monthHidden, tab, setTab]);

  useEffect(() => {
    if (!pendingNav) return;
    if (pendingNav.year !== undefined) setYear(pendingNav.year);
    setTab(pendingNav.tab);
    if (pendingNav.dayDate) setDayDate(pendingNav.dayDate);
    if (pendingNav.weekStart) setWeekStart(pendingNav.weekStart);
    if (pendingNav.month !== undefined) setMonth(pendingNav.month);
    setPendingNav(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNav]);

  // Apply an external sub-tab request (e.g. WeekPeek's "open week view" shortcut).
  useEffect(() => {
    if (subTabRequest) setTab(subTabRequest.tab);
    // Keyed on nonce so a repeat request to the same tab still fires after a manual switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTabRequest?.nonce]);

  // Three switches that hide content, and no other sign they are off — a view
  // that silently drops half the week reads as lost data, not as a filter.
  const hiddenCount = [
    display.showTasks,
    display.showQuests,
    display.showHabits,
    display.showEvents,
  ].filter((on) => !on).length;

  function handleNavigateDay(date: string) {
    setDayDate(date);
    setTab('day');
  }

  function handleWeekNavigateDay(date: string) {
    setDayDate(date);
    setTab('day');
  }

  return (
    <div className={outerWrap}>
      {/* Sub-tab bar + display toggles */}
      <div className={controlBar}>
        <div className={subTabGroup}>
          {SUB_TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={cn(subTab, tab === t && subTabActive)}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className={rightControls}>
          {/* Below sm the five labelled buttons cannot share a row with the
              sub-tabs, and a second row comes straight out of the day list.
              Only the three filters collapse — they are a set, and the control
              still shows which of them are off. The two single actions stay
              out here, one tap each. */}
          <div className="flex items-center gap-1.5 sm:hidden">
            <button
              type="button"
              className={compactBtn}
              onClick={openShareAgenda}
              title={tShare('title')}
              aria-label={tShare('title')}
            >
              ⇪
            </button>
            <Link
              href="/tasks"
              className={cn(compactBtn, compactBtnQuestLog)}
              title={tDash('scheduleView.openQuestLog')}
              aria-label={tDash('scheduleView.openQuestLog')}
            >
              ❖
            </Link>
            {/* Last, because it is the only one that opens something rather
                than doing something. */}
            <ScheduleDisplayMenu display={display} setDisplay={setDisplay} />
          </div>

          {/* Sits before the display toggles so it never splits that pair. */}
          <button
            type="button"
            className={cn(toggleBtn, 'hidden sm:inline-block')}
            onClick={openShareAgenda}
            title={tShare('title')}
            aria-label={tShare('title')}
          >
            ⇪ {tShare('short')}
          </button>
          <button
            type="button"
            className={cn(
              toggleBtn,
              'hidden sm:inline-block',
              display.showTasks && toggleBtnActive,
            )}
            onClick={() => setDisplay({ showTasks: !display.showTasks })}
            // A switch, not a link: screen readers should say whether it is on.
            aria-pressed={display.showTasks}
            title={tDash('scheduleView.toggleTasks')}
          >
            📋 {tDash('scheduleView.tasks')}
          </button>
          <button
            type="button"
            className={cn(
              toggleBtn,
              'hidden sm:inline-block',
              display.showQuests && toggleBtnActive,
            )}
            onClick={() => setDisplay({ showQuests: !display.showQuests })}
            // A switch, not a link: screen readers should say whether it is on.
            aria-pressed={display.showQuests}
            title={tDash('scheduleView.toggleQuests')}
          >
            ⚡ {tDash('scheduleView.quests')}
          </button>
          <button
            type="button"
            className={cn(
              toggleBtn,
              'hidden sm:inline-block',
              display.showHabits && toggleBtnActive,
            )}
            onClick={() => setDisplay({ showHabits: !display.showHabits })}
            // A switch, not a link: screen readers should say whether it is on.
            aria-pressed={display.showHabits}
            title={tDash('scheduleView.toggleHabits')}
          >
            ✦ {tDash('scheduleView.habits')}
          </button>
          <button
            type="button"
            className={cn(
              toggleBtn,
              'hidden sm:inline-block',
              display.showEvents && toggleBtnActive,
            )}
            onClick={() => setDisplay({ showEvents: !display.showEvents })}
            // A switch, not a link: screen readers should say whether it is on.
            aria-pressed={display.showEvents}
            title={tDash('scheduleView.toggleEvents')}
          >
            📅 {tDash('scheduleView.events')}
          </button>

          {hiddenCount > 0 && (
            <button
              type="button"
              className={cn(filterAlert, 'hidden sm:inline-block')}
              title={tDash('scheduleView.filtered')}
              onClick={() =>
                setDisplay({
                  showTasks: true,
                  showQuests: true,
                  showHabits: true,
                  showEvents: true,
                })
              }
            >
              ⚠ {tDash('scheduleView.showAll')} ({hiddenCount})
            </button>
          )}

          <Link
            href="/tasks"
            className={cn(taskLogBtn, 'hidden sm:inline-block')}
            title={tDash('scheduleView.openQuestLog')}
            aria-label={tDash('scheduleView.openQuestLog')}
          >
            ❖ {tDash('questLog')}
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className={contentArea}>
        {tab === 'day' && (
          <ScheduleDayViewPanel
            date={dayDate}
            onDateChange={(d) => {
              setDayDate(d);
              setWeekStart(getMonday(d));
              setMonth(new Date(d).getMonth());
            }}
            showTasks={display.showTasks}
            showQuests={display.showQuests}
            showHabits={display.showHabits}
            onAddQuest={onAddQuest}
          />
        )}
        {tab === 'week' && (
          <WeekView
            weekStart={weekStart}
            display={display}
            onWeekChange={(ws) => {
              setWeekStart(ws);
              setYear(new Date(ws).getFullYear());
            }}
            onNavigateDay={handleWeekNavigateDay}
            onNavigateTab={onNavigateTab}
          />
        )}
        {tab === 'month' && (
          <MonthView
            year={year}
            month={month}
            display={display}
            quests={[]}
            onMonthChange={(m, y) => {
              setMonth(m);
              setYear(y);
            }}
            onNavigateDay={handleNavigateDay}
            onNavigateTab={onNavigateTab}
          />
        )}
      </div>
    </div>
  );
}

const outerWrap = 'flex flex-col flex-1 min-h-0 overflow-hidden';

// One row at every width. Wrapping cost a second row on a phone, and the day
// list below is what that height came out of.
const controlBar =
  'flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 border-b border-[var(--border)] shrink-0 flex-nowrap';

const subTabGroup = 'flex gap-1 shrink-0';
const subTab =
  'px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase font-[var(--font-title)] rounded border border-[var(--border)] bg-[var(--panel2)] text-[var(--text-mid)] cursor-pointer transition-all hover:text-[var(--text-hi)] hover:border-[oklch(0.74_0.17_85_/_0.3)]';
const subTabActive =
  'text-[var(--gold)] border-[oklch(0.74_0.17_85_/_0.5)] bg-[oklch(0.74_0.17_85_/_0.08)] shadow-[0_0_8px_var(--gold-glow)]';

/**
 * Right-aligned while the controls fit, and a swipeable strip once they do
 * not: the last button sits half-cut against the edge, which is the cue that
 * there is more. Kept scrollable rather than collapsed into a menu so every
 * control stays one tap away.
 */
const rightControls = cn(
  // The scroll is the wide-screen safety net only; below sm the controls are
  // collapsed to two, and an overflow here would clip their menus.
  'flex items-center gap-1.5 ml-auto min-w-0 flex-nowrap sm:overflow-x-auto',
  '[&>*]:shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
);

const toggleBtn =
  'px-2 py-1 text-[10px] font-bold tracking-[0.08em] uppercase font-[var(--font-title)] rounded border border-[var(--border)] bg-[var(--panel2)] text-[var(--text-lo)] cursor-pointer transition-all hover:text-[var(--text-mid)]';
/** Icon-only twins of the wide-screen buttons, sized for a thumb. */
const compactBtn =
  'flex items-center justify-center rounded border border-[var(--border)] bg-[var(--panel2)] px-2 py-1 text-[13px] leading-none text-[var(--text-mid)] no-underline cursor-pointer transition-colors hover:text-[var(--text-hi)]';
const compactBtnQuestLog =
  'border-[oklch(0.66_0.22_295_/_0.4)] bg-[oklch(0.66_0.22_295_/_0.06)] text-[var(--violet)]';

const filterAlert =
  'px-2 py-1 text-[10px] font-bold tracking-[0.08em] uppercase font-[var(--font-title)] rounded border border-[var(--warning)] bg-[var(--warning)]/10 text-[var(--warning)] cursor-pointer transition-all hover:bg-[var(--warning)]/20';

const toggleBtnActive =
  'text-[var(--gold)] border-[oklch(0.74_0.17_85_/_0.4)] bg-[oklch(0.74_0.17_85_/_0.06)]';

const contentArea = 'flex-1 min-h-0 overflow-hidden flex flex-col';

const taskLogBtn =
  'px-2 py-1 text-[10px] font-bold tracking-[0.08em] uppercase font-[var(--font-title)] rounded border border-[oklch(0.66_0.22_295_/_0.4)] bg-[oklch(0.66_0.22_295_/_0.06)] text-[var(--violet)] no-underline transition-all hover:bg-[oklch(0.66_0.22_295_/_0.14)] hover:border-[oklch(0.66_0.22_295_/_0.65)]';
