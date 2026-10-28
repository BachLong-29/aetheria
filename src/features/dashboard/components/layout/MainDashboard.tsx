'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { useProfile } from '@/features/profile/hooks/useProfile';

import { DEFAULT_SETTINGS, QUOTES } from '../../constants';
import { useCharacterProgress } from '../../hooks/useCharacterProgress';
import { useDailyInit } from '../../hooks/useDailyInit';
import { usePenaltyFlow } from '../../hooks/usePenaltyFlow';
import { useQuestOrchestration } from '../../hooks/useQuestOrchestration';
import type { BurstPos, CenterTab, Character, DashboardSettings } from '../../types';
import { buildEmptyChar, profileToCharacter } from '../../utils/character.utils';
import { CashLogReminderModal } from '@/features/finance/components/CashLogReminderModal';
import { useOverdueReview } from '@/features/tasks/hooks/useOverdueReview';
import { OverdueReviewModal } from '@/features/tasks/components/shared/OverdueReviewModal';
import { useUIStore } from '@/stores/ui.store';
import { useTaskById } from '../../hooks/useTaskById';
import { useUpdateTask } from '../../hooks/useUpdateTask';
import { EditTaskModal } from '@/features/tasks/components/shared/EditTaskModal';
import { taskToUITask } from '@/features/tasks/data/adapters';
import type { UpdateTaskPayload } from '@/types';
import { CenterColumn } from './CenterColumn';
import type { ScheduleSubTabRequest } from '../schedule/ScheduleView';
import DashboardTopbar from './DashboardTopbar';
import { DashboardOverlays } from './DashboardOverlays';
import { LeftColumn } from './LeftColumn';
import { MobileNav } from './MobileNav';
import { RightColumn } from './RightColumn';

type MobilePanel = 'center' | 'character' | 'timer';

const DOW_TO_HABIT_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export default function MainDashboard() {
  const settings: DashboardSettings = DEFAULT_SETTINGS;

  // Stable date strings — computed once on mount, never stale within a session.
  // Local date (not UTC) so habit/task logs match the same format used by /tasks.
  const todayDateStr = useMemo(() => {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  }, []);
  const todayDayStr = useMemo(() => DOW_TO_HABIT_DAY[new Date().getDay()] ?? 'mon', []);
  const dateStr = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [],
  );

  // Character — follows the profile API. Awards show locally at once, then the reload after the
  // server pays replaces them with the stored numbers, so the server stays the source of truth.
  const [char, setChar] = useState<Character>(buildEmptyChar);
  const { data: profileData } = useProfile();
  const [seenProfile, setSeenProfile] = useState(profileData);
  if (profileData !== seenProfile) {
    setSeenProfile(profileData);
    if (profileData?.profile) setChar(profileToCharacter(profileData.profile));
  }

  // Feedback state
  const [burst, setBurst] = useState<BurstPos | null>(null);
  const [toast, setToast] = useState<{ xp: number; coins: number } | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; rank?: string } | null>(null);

  const handleBurstDone = useCallback(() => setBurst(null), []);
  const handleToastDone = useCallback(() => setToast(null), []);
  const handleLevelUpDone = useCallback(() => setLevelUp(null), []);
  const handleLevelUp = useCallback(
    (level: number, rank?: string) => setLevelUp({ level, rank }),
    [],
  );

  const { awardProgress, applyGamePatch } = useCharacterProgress(char, setChar, handleLevelUp);

  const onBurst = useCallback(
    (pos: BurstPos) => {
      if (settings.animationsEnabled) setBurst(pos);
    },
    [settings.animationsEnabled],
  );
  const onToast = useCallback((reward: { xp: number; coins: number }) => setToast(reward), []);

  // Ticking an item done in the schedule day view pays out exactly like the quest panel does.
  const handleScheduleReward = useCallback(
    (reward: { xp: number; coins: number }) => {
      awardProgress(reward);
      onToast(reward);
    },
    [awardProgress, onToast],
  );

  // Quest / habit / task orchestration
  const { quests, pendingQuest, handleConfirmQuest, handleAddQuest, handleCancelQuest } =
    useQuestOrchestration({
      todayDateStr,
      todayDayStr,
      animationsEnabled: settings.animationsEnabled,
      onAwardProgress: awardProgress,
      onBurst,
      onToast,
    });

  // Overdue task review
  const {
    overdueItems,
    showModal: showOverdueModal,
    dismissModal: dismissOverdueModal,
    removeItem: removeOverdueItem,
  } = useOverdueReview();

  // Penalty state machine — auto-issues a penalty when tasks are overdue, and
  // when the daily rollover (below) finds quests left undone from yesterday.
  const {
    penaltyState,
    penaltyFailed,
    failedTier,
    issueQuestPenalty,
    handlePenaltyComplete,
    handlePenaltyFail,
    handleFailureContinue,
  } = usePenaltyFlow({ quests, overdueTasks: overdueItems, applyGamePatch, onToast });

  // Daily init effects (rollover, Sunday reminder, monthly reminder)
  useDailyInit({ onQuestsRolledOver: issueQuestPenalty });

  // Reschedule/done/abandon review only opens once the task-triggered penalty
  // (if any) has been resolved — the penalty modal takes priority.
  const taskPenaltyPending = penaltyState?.source === 'task';

  // Restore failed task flow (triggered by notification click)
  const pendingRestoreTaskId = useUIStore((s) => s.pendingRestoreTaskId);
  const setPendingRestoreTaskId = useUIStore((s) => s.setPendingRestoreTaskId);
  const { data: restoreTask } = useTaskById(pendingRestoreTaskId);
  const { mutate: updateTaskForRestore } = useUpdateTask();

  function handleRestoreSave(id: string, payload: UpdateTaskPayload, onSuccess: () => void) {
    updateTaskForRestore(
      { id, ...payload, active: true },
      {
        onSuccess: () => {
          setPendingRestoreTaskId(null);
          onSuccess();
        },
      },
    );
  }

  // Navigation state
  const searchParams = useSearchParams();
  const [centerTab, setCenterTab] = useState<CenterTab>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'habits' || tab === 'schedule' || tab === 'stats') return tab;
    return 'schedule';
  });

  // Re-sync when `?tab=` changes on an already-mounted dashboard — e.g. a
  // notification click does a same-route `router.push('/dashboard?tab=...')`,
  // which the lazy useState initializer above only ever reads once on mount.
  // Syncing local state to this external source (the URL) is exactly what
  // effects are for, so the setState-in-effect rule is disabled here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'habits' || tab === 'schedule' || tab === 'stats') {
      setCenterTab(tab);
    }
  }, [searchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('center');

  const handleTabChange = useCallback((tab: CenterTab) => {
    setCenterTab(tab);
    setMobilePanel('center');
  }, []);

  // WeekPeek "open week view" shortcut → jump to Schedule tab and force its Week sub-tab.
  const [scheduleSubTabRequest, setScheduleSubTabRequest] = useState<ScheduleSubTabRequest | null>(
    null,
  );
  const handleOpenWeekView = useCallback(() => {
    setCenterTab('schedule');
    setMobilePanel('center');
    setScheduleSubTabRequest({ tab: 'week', nonce: Date.now() });
  }, []);

  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? QUOTES[0]);

  return (
    <>
      {/* Group essential modals */}
      <DashboardOverlays
        burst={burst}
        animationsEnabled={settings.animationsEnabled}
        onBurstDone={handleBurstDone}
        toast={toast}
        onToastDone={handleToastDone}
        levelUp={levelUp}
        onLevelUpDone={handleLevelUpDone}
        penaltyState={penaltyState}
        penaltyFailed={penaltyFailed}
        failedTier={failedTier}
        pendingQuest={pendingQuest}
        onPenaltyComplete={handlePenaltyComplete}
        onPenaltyFail={handlePenaltyFail}
        onFailureContinue={handleFailureContinue}
        onConfirmQuest={handleConfirmQuest}
        onCancelQuest={handleCancelQuest}
      />

      {/* Last in the queue of things that greet you: a missing note is the
          mildest of them, and three dialogs at once is a wall. */}
      <CashLogReminderModal
        suppressed={!!penaltyState || penaltyFailed || (showOverdueModal && !taskPenaltyPending)}
      />

      <OverdueReviewModal
        open={showOverdueModal && !taskPenaltyPending}
        items={overdueItems}
        onRemoveItem={removeOverdueItem}
        onDismiss={dismissOverdueModal}
      />

      {/* Restore failed task — triggered by clicking a "Quest Failed" notification.
          Mounted unconditionally: EditTaskModal raises its follow-up dialogs
          after a save has cleared the task, and unmounting it here took them
          with it. */}
      <EditTaskModal
        task={restoreTask ? taskToUITask(restoreTask) : null}
        open={!!restoreTask && !!pendingRestoreTaskId}
        onClose={() => setPendingRestoreTaskId(null)}
        onSave={handleRestoreSave}
        saving={false}
      />

      {/* h-screen flex-col: establishes the flex context so flex-1/min-h-0 work on children */}
      <div className="flex flex-col h-screen">
        <DashboardTopbar char={char} dateStr={dateStr} />

        {/* Desktop / Tablet layout (1025px+) */}
        {/* 1025–1279px: 2 columns [240px + 1fr]. 1280px+: 3 columns [220px + 1fr + 260px] */}
        <div className="hidden min-[1025px]:grid min-[1025px]:grid-cols-[240px_1fr] xl:grid-cols-[220px_1fr_260px] gap-3 p-3 flex-1 overflow-hidden min-h-0">
          <div className="flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden">
            <LeftColumn char={char} settings={settings} />
            {/* Below 1280px there is no third column, and the bottom nav that
                would otherwise reach these is already hidden from 1025px — so
                they ride along here rather than being unreachable. */}
            <div className="flex flex-col gap-2.5 xl:hidden">
              <RightColumn settings={settings} quote={quote} onOpenWeek={handleOpenWeekView} />
            </div>
          </div>
          <CenterColumn
            tab={centerTab}
            onTabChange={handleTabChange}
            onAddQuest={handleAddQuest}
            onReward={handleScheduleReward}
            todayDateStr={todayDateStr}
            scheduleSubTabRequest={scheduleSubTabRequest}
          />
          {/* Right column — wide desktop only (xl+) */}
          <div className="hidden xl:flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden">
            <RightColumn settings={settings} quote={quote} onOpenWeek={handleOpenWeekView} />
          </div>
        </div>

        {/* Mobile layout (≤ 1024px) — pb-14 reserves space for fixed bottom nav */}
        <div className="flex flex-col min-[1025px]:hidden flex-1 overflow-hidden min-h-0 pb-14">
          {mobilePanel === 'character' && (
            <div className="flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden p-3 flex-1">
              <LeftColumn char={char} settings={settings} />
            </div>
          )}
          {mobilePanel === 'timer' && (
            <div className="flex flex-col gap-2.5 overflow-y-auto overflow-x-hidden p-3 flex-1">
              <RightColumn settings={settings} quote={quote} onOpenWeek={handleOpenWeekView} />
            </div>
          )}
          {mobilePanel === 'center' && (
            <div className="flex flex-col gap-2.5 flex-1 overflow-hidden min-h-0 p-3">
              <CenterColumn
                tab={centerTab}
                onTabChange={handleTabChange}
                onAddQuest={handleAddQuest}
                onReward={handleScheduleReward}
                todayDateStr={todayDateStr}
                scheduleSubTabRequest={scheduleSubTabRequest}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom nav — fixed to viewport, outside the h-screen wrapper */}
      <MobileNav
        centerTab={centerTab}
        mobilePanel={mobilePanel}
        onTabChange={handleTabChange}
        onPanelChange={setMobilePanel}
      />
    </>
  );
}
