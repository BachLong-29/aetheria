'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

import { useProfile } from '@/features/profile/hooks/useProfile';
import { buildEmptyChar, profileToCharacter } from '@/features/dashboard/utils/character.utils';
import { toLocalDate } from '../utils/date.utils';
import { useScheduleDayTasks } from '@/features/dashboard/hooks/useScheduleDayTasks';
import { useTasksPaged } from '@/features/dashboard/hooks/useTasksPaged';
import { useCategories } from '@/features/dashboard/hooks/useCategories';
import { useCharacterProgress } from '@/features/dashboard/hooks/useCharacterProgress';
import { XPToast } from '@/features/dashboard/components/feedback/XPToast';
import type { Character } from '@/features/dashboard/types';
import type { TaskColor } from '@/types';
import DashboardTopbar from '@/features/dashboard/components/layout/DashboardTopbar';
import { AddQuestModal } from '@/features/dashboard/components/schedule/AddQuestModal';
import { AddTaskModal } from './shared/AddTaskModal';
import { EditTaskModal } from './shared/EditTaskModal';
import type { TaskFormValues } from './shared/TaskForm';

import { type TaskDiff, type UITask } from '../data/mock';
import { questToUITask, parseDateLocal, taskToUITask, type QuestLike } from '../data/adapters';
import { PageHeader, type ViewMode } from './PageHeader';
import { TaskDayView } from './day/TaskDayView';
import { TaskAllView } from './all/TaskAllView';
import { matchesQuery } from '@/libs/utils';

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskManagement({ initialSearch = '' }: { initialSearch?: string } = {}) {
  const router = useRouter();
  const params = useParams<{ locale: string }>();

  // ── Selected date for day view ────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const selectedDateStr = useMemo(() => toLocalDate(selectedDate), [selectedDate]);

  // ── Character state (for topbar) ────────────────────────────────────────────
  const { data: profileData } = useProfile();
  const charInitialized = useRef(false);
  const [char, setChar] = useState<Character>(() => buildEmptyChar());

  useEffect(() => {
    const profile = profileData?.profile;
    if (!profile || charInitialized.current) return;
    setChar(profileToCharacter(profile));
    charInitialized.current = true;
  }, [profileData]);

  const { awardProgress } = useCharacterProgress(char, setChar);

  // Reward feedback for items ticked done on this page — same payout as the dashboard.
  const [reward, setReward] = useState<{ xp: number; coins: number } | null>(null);
  const handleReward = useCallback(
    (next: { xp: number; coins: number }) => {
      awardProgress(next);
      setReward(next);
    },
    [awardProgress],
  );

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // ── Day-ledger data + mutations (shared with the dashboard schedule) ──────────
  // The full task page shows every project, sources the day list client-side (no
  // extra fetch when navigating dates), keeps backlog visible, and routes habit
  // edits to the Habits tab.
  const {
    tasks,
    visibleTasks,
    weekTaskBlocks,
    isFetchingDayTasks,
    isRescheduling,
    editingTask,
    isSavingEdit,
    onToggleDone,
    onCompleteTask,
    onMoveToSlot,
    onRescheduleHabit,
    onEdit,
    onSaveEdit,
    onCloseEdit,
    prependTask,
  } = useScheduleDayTasks({
    date: selectedDateStr,
    projectScope: 'all',
    dayTasksSource: 'client',
    preserveBacklog: false,
    // Only surface tasks that have a planned session (schedule block) on the day —
    // tasks with a start/end date but no session plan are hidden from the grid.
    requireBlock: true,
    onReward: handleReward,
    onEditHabit: () => {
      const locale = params?.locale ?? 'en';
      router.push(`/${locale}/dashboard?tab=habits`);
    },
  });

  // ── Forge modal ──────────────────────────────────────────────────────────────
  const [showForgeModal, setShowForgeModal] = useState(false);

  function handleQuestForged(quest: QuestLike) {
    // Optimistically prepend the new quest so it appears immediately.
    prependTask(questToUITask(quest));
  }

  // ── Add task modal ────────────────────────────────────────────────────────────
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [cloneDefaults, setCloneDefaults] = useState<Partial<TaskFormValues> | undefined>();

  function handleCloneTask(task: UITask) {
    setCloneDefaults({
      name: `Copy of ${task.title}`,
      icon: task.icon ?? '',
      note: task.desc ?? '',
      tagId: task.tagId ?? '',
      color: (task.color as TaskColor) ?? 'gold',
      startDate: null,
      endDate: task.endDate ? parseDateLocal(task.endDate) : null,
      duration: task.est != null ? String(task.est) : '',
      dependencies: task.dependencies ?? [],
    });
    setShowAddTaskModal(true);
  }

  // ── View / filter state ─────────────────────────────────────────────────────
  // 'day' view temporarily hidden (see PageHeader's VIEW_META) — default to 'all'.
  const [view, setView] = useState<ViewMode>('all');
  const { data: categories = [] } = useCategories();
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterDiff, setFilterDiff] = useState<TaskDiff | 'all'>('all');
  const [search, setSearch] = useState(initialSearch);
  const [splitMode, setSplitMode] = useState<'week' | 'month'>('week');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      visibleTasks.filter((t) => {
        if (filterCat !== 'all' && t.tagId !== filterCat) return false;
        if (filterDiff !== 'all' && t.diff !== filterDiff) return false;
        if (search) {
          if (
            !matchesQuery(t.title, search) &&
            !matchesQuery(t.desc, search) &&
            !(t.projectName ? matchesQuery(t.projectName, search) : false) &&
            !t.tags.some((x) => matchesQuery(x, search))
          )
            return false;
        }
        return true;
      }),
    [visibleTasks, filterCat, filterDiff, search],
  );

  // ── "All" view — server-paginated, independent of the day-grid's in-memory ledger ──
  const ALL_VIEW_PAGE_SIZE = 20;
  const [allViewOffset, setAllViewOffset] = useState(0);
  const allViewTagId = filterCat !== 'all' ? filterCat : undefined;
  const allViewSearch = search.trim() || undefined;

  // Filters changed — jump back to page 1 (render-phase reset, no extra effect pass).
  const [prevAllViewFilters, setPrevAllViewFilters] = useState([allViewTagId, allViewSearch]);
  if (prevAllViewFilters[0] !== allViewTagId || prevAllViewFilters[1] !== allViewSearch) {
    setPrevAllViewFilters([allViewTagId, allViewSearch]);
    if (allViewOffset !== 0) setAllViewOffset(0);
  }

  const { data: allViewPage, isFetching: isFetchingAllView } = useTasksPaged({
    offset: allViewOffset,
    limit: ALL_VIEW_PAGE_SIZE,
    q: allViewSearch,
    tagId: allViewTagId,
  });
  const allViewTasks = useMemo(
    () => (allViewPage?.tasks ?? []).map((t) => taskToUITask(t)),
    [allViewPage],
  );

  // ── Header counts ────────────────────────────────────────────────────────────
  const todayDone = visible.filter((t) => t.day === 0 && t.done).length;
  const todayTotal = visible.filter((t) => t.day === 0).length;
  const weekDone = visible.filter((t) => t.day >= 0 && t.day <= 6 && t.done).length;
  const weekTotal = visible.filter((t) => t.day >= 0 && t.day <= 6).length;
  return (
    <div className="flex flex-col h-screen bg-[var(--bg)] overflow-hidden">
      {/* Topbar */}
      <DashboardTopbar char={char} dateStr={dateStr} />

      {/* Page content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3 gap-3">
        {/* Header + filters */}
        <PageHeader
          view={view}
          onViewChange={setView}
          categories={categories}
          filterCat={filterCat}
          onFilterCat={setFilterCat}
          filterDiff={filterDiff}
          onFilterDiff={setFilterDiff}
          splitMode={splitMode}
          onSplitMode={setSplitMode}
          search={search}
          onSearch={setSearch}
          onForge={() => setShowForgeModal(true)}
          onAddTask={() => setShowAddTaskModal(true)}
          todayDone={todayDone}
          todayTotal={todayTotal}
          weekDone={weekDone}
          weekTotal={weekTotal}
        />

        {/* Active view */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {view === 'day' && (
            <TaskDayView
              tasks={visible}
              allTasks={tasks}
              taskBlocks={weekTaskBlocks}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              isLoadingDay={isFetchingDayTasks}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              onToggleDone={onToggleDone}
              onMoveToSlot={onMoveToSlot}
              onRescheduleHabit={onRescheduleHabit}
              onCompleteTask={onCompleteTask}
              onEdit={onEdit}
              onClone={handleCloneTask}
              rescheduleLoading={isRescheduling}
              splitMode={splitMode}
            />
          )}
          {view === 'all' && (
            <TaskAllView
              tasks={allViewTasks}
              onEdit={onEdit}
              pagination={{
                offset: allViewOffset,
                limit: ALL_VIEW_PAGE_SIZE,
                meta: allViewPage?.meta,
                isFetching: isFetchingAllView,
                onPrev: () => setAllViewOffset((o) => Math.max(0, o - ALL_VIEW_PAGE_SIZE)),
                onNext: () => setAllViewOffset((o) => o + ALL_VIEW_PAGE_SIZE),
              }}
            />
          )}
        </div>
      </div>

      {/* ── Forge Quest modal ──────────────────────────────────────────────── */}
      {showForgeModal && (
        <AddQuestModal onAdd={handleQuestForged} onClose={() => setShowForgeModal(false)} />
      )}

      {/* ── Add Task modal ─────────────────────────────────────────────────── */}
      <AddTaskModal
        open={showAddTaskModal}
        defaultValues={cloneDefaults}
        onClose={() => {
          setShowAddTaskModal(false);
          setCloneDefaults(undefined);
        }}
        onSaved={() => {
          setShowAddTaskModal(false);
          setCloneDefaults(undefined);
        }}
      />

      {/* ── Edit Task modal ───────────────────────────────────────────────── */}
      <EditTaskModal
        task={editingTask}
        open={editingTask !== null}
        onClose={onCloseEdit}
        onSave={onSaveEdit}
        saving={isSavingEdit}
      />

      {reward && <XPToast xp={reward.xp} coins={reward.coins} onDone={() => setReward(null)} />}
    </div>
  );
}
