'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/common/Icon';
import { cn } from '@/libs/utils';
import { Modal, ModalBody, ModalFoot, ModalHead } from '@/components/ui/Modal';
import { useCategories } from '@/features/dashboard/hooks/useCategories';
import { useDeleteTask } from '@/features/dashboard/hooks/useDeleteTask';
import type { TaskPageMeta, TaskStatus } from '@/types';

import { UI_TASK_XP } from '../../data/adapters';
import { type UITask } from '../../data/mock';
import { TaskAllTable, COL_DEFS, DEFAULT_VISIBLE_COLS, type ColDef } from './TaskAllTable';
import type { ColKey } from './TaskAllRow';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Orders the whole list on the server, not just the loaded page. */
export type AllViewSort = 'deadline' | 'title';
export type AllViewStatus = 'all' | TaskStatus;

// ─── Props ────────────────────────────────────────────────────────────────────

interface TaskAllViewPagination {
  offset: number;
  limit: number;
  meta: TaskPageMeta | undefined;
  isFetching: boolean;
  onPrev: () => void;
  onNext: () => void;
}

interface TaskAllViewProps {
  tasks: UITask[];
  onEdit?: (task: UITask) => void;
  /** Server-side pagination for `tasks` — omit to render everything with no footer. */
  pagination?: TaskAllViewPagination;
  /** Sort and status filter live in the parent: they are request params, and changing one resets the page. */
  sortBy: AllViewSort;
  onSortChange: (sort: AllViewSort) => void;
  statusFilter: AllViewStatus;
  onStatusChange: (status: AllViewStatus) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskAllView({
  tasks,
  onEdit,
  pagination,
  sortBy,
  onSortChange,
  statusFilter,
  onStatusChange,
}: TaskAllViewProps) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const [deletingTask, setDeletingTask] = useState<UITask | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(DEFAULT_VISIBLE_COLS);
  const [colPickerOpen, setColPickerOpen] = useState(false);

  const pickerRef = useRef<HTMLDivElement>(null);

  const { mutate: deleteTask } = useDeleteTask();
  const { data: categories = [] } = useCategories();
  const sortByOptions: { id: AllViewSort; label: string }[] = [
    { id: 'deadline', label: t('taskAllView.sort.deadline') },
    { id: 'title', label: t('taskAllView.sort.title') },
  ];
  const statusFilterOptions: { id: AllViewStatus; label: string; color?: string }[] = [
    { id: 'all', label: t('taskAllView.status.all') },
    { id: 'todo', label: t('taskAllView.status.todo') },
    { id: 'in_progress', label: t('taskAllView.status.inProgress'), color: 'var(--cyan)' },
    { id: 'pending', label: t('taskAllView.status.pending'), color: 'var(--gold)' },
    { id: 'waiting', label: t('taskAllView.status.waiting'), color: 'var(--amber)' },
    { id: 'done', label: t('taskAllView.status.done'), color: 'var(--mint)' },
  ];
  const columnLabels: Record<ColKey, string> = {
    status: t('taskAllView.columns.status'),
    category: t('taskAllView.columns.category'),
    priority: t('taskAllView.columns.priority'),
    deadline: t('taskAllView.columns.deadline'),
    progress: t('taskAllView.columns.progress'),
    xp: t('taskAllView.columns.xp'),
    est: t('taskAllView.columns.est'),
    streak: t('taskAllView.columns.streak'),
    subtasks: t('taskAllView.columns.subtasks'),
  };

  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  // Close picker when clicking outside
  useEffect(() => {
    if (!colPickerOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [colPickerOpen]);

  function toggleCol(key: ColKey) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const taskOnly = useMemo(() => tasks.filter((t) => t.source === 'task'), [tasks]);

  // The server already filtered and ordered the page; the counts cover the whole list.
  const counts = pagination?.meta?.statusCounts;
  const countOf = (status: AllViewStatus) =>
    status === 'all'
      ? Object.values(counts ?? {}).reduce((sum, n) => sum + n, 0)
      : (counts?.[status] ?? 0);
  const total = countOf('all');
  const done = countOf('done');
  const xpTotal = total * UI_TASK_XP;
  const xpEarned = done * UI_TASK_XP;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className={toolbar}>
        {/* Summary pills */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <SummaryPill
            value={`${done}/${total}`}
            label={t('taskAllView.summary.done')}
            color="mint"
          />
          <SummaryPill
            value={`+${xpEarned}`}
            label={t('taskAllView.summary.xp', { total: xpTotal })}
            color="violet"
          />
          <SummaryPill
            value={taskOnly.filter((t) => t.saga).length}
            label={t('taskAllView.summary.sagas')}
            color="gold"
          />
        </div>

        <div className="flex-1" />

        {/* Sort — desktop only (mobile sort lives inside col picker) */}
        <div className={cn(controlGroup, 'hidden sm:flex')}>
          <span className={controlLabel}>{t('taskAllView.sort.label')}</span>
          {sortByOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={cn(segBtn, sortBy === opt.id && segBtnActive)}
              onClick={() => onSortChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Column picker — always visible */}
        <div className="relative shrink-0" ref={pickerRef}>
          <button
            type="button"
            className={cn(segBtn, colPickerOpen && segBtnActive)}
            onClick={() => setColPickerOpen((v) => !v)}
            title={t('taskAllView.columns.showHide')}
          >
            ⊞ {t('taskAllView.columns.button')}
          </button>

          {colPickerOpen && (
            <div className={colPicker}>
              {/* Mobile-only sort section */}
              <div className="sm:hidden mb-2 pb-2 border-b border-[var(--border)]">
                <span className={colPickerTitle}>{t('taskAllView.sort.mobileTitle')}</span>
                {sortByOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={cn(
                      colPickerRow,
                      sortBy === opt.id ? 'text-[var(--gold)] font-bold' : 'text-[var(--text-mid)]',
                    )}
                    onClick={() => onSortChange(opt.id)}
                  >
                    <span className="w-3 shrink-0 text-[var(--gold)]">
                      {sortBy === opt.id ? '✓' : ''}
                    </span>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Column visibility */}
              <span className={colPickerTitle}>{t('taskAllView.columns.title')}</span>
              {COL_DEFS.map((c: ColDef) => (
                <label key={c.key} className={colPickerRow}>
                  <input
                    type="checkbox"
                    checked={visibleCols.has(c.key)}
                    onChange={() => toggleCol(c.key)}
                    className="accent-[var(--gold)] shrink-0 cursor-pointer"
                  />
                  {columnLabels[c.key]}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Status filter bar — horizontal scroll on mobile ──────────────── */}
      <div className={statusBar}>
        {statusFilterOptions.map((opt) => {
          const active = statusFilter === opt.id;
          const count = countOf(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              className={cn(statusChip, active && statusChipActive)}
              style={
                active && opt.color
                  ? {
                      color: opt.color,
                      borderColor: `${opt.color}55`,
                      background: `${opt.color}12`,
                    }
                  : undefined
              }
              onClick={() => onStatusChange(opt.id)}
            >
              {opt.label}
              <span className={cn(statusCount, active && 'opacity-100')}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <TaskAllTable
        sorted={taskOnly}
        visibleCols={visibleCols}
        catMap={catMap}
        onEdit={onEdit}
        onDelete={setDeletingTask}
      />

      {/* ── Pagination footer ───────────────────────────────────────────── */}
      {pagination && (
        <div className={paginationBar}>
          <span className="text-[9px] text-[var(--text-lo)]">
            {pagination.meta
              ? t('taskAllView.pagination.range', {
                  from: pagination.meta.total === 0 ? 0 : pagination.offset + 1,
                  to: Math.min(pagination.offset + pagination.limit, pagination.meta.total),
                  total: pagination.meta.total,
                })
              : t('taskAllView.pagination.loading')}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={segBtn}
              disabled={pagination.offset === 0 || pagination.isFetching}
              onClick={pagination.onPrev}
            >
              <Icon icon="ArrowLeft" className="text-[14px]" /> {t('taskAllView.pagination.prev')}
            </button>
            <button
              type="button"
              className={segBtn}
              disabled={!pagination.meta?.hasNextPage || pagination.isFetching}
              onClick={pagination.onNext}
            >
              {t('taskAllView.pagination.next')} <Icon icon="ArrowRight" className="text-[14px]" />
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ─────────────────────────────────────────── */}
      <Modal open={!!deletingTask} onClose={() => setDeletingTask(null)} maxWidth="380px">
        <ModalHead
          title={
            <>
              <span style={{ color: 'var(--rose)' }}>⚠</span> {t('taskAllView.deleteModal.title')}
            </>
          }
        />
        <ModalBody>
          {deletingTask && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: 'var(--panel2)',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 18 }}>
                  <Icon icon={deletingTask.icon} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>
                  {deletingTask.title}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: 0, lineHeight: 1.6 }}>
                {t('taskAllView.deleteModal.description')}
              </p>
            </>
          )}
        </ModalBody>
        <ModalFoot>
          <button type="button" className="modal-btn cancel" onClick={() => setDeletingTask(null)}>
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            className="modal-btn"
            onClick={() => {
              if (deletingTask?.sourceId) deleteTask(deletingTask.sourceId);
              setDeletingTask(null);
            }}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, oklch(0.45 0.18 5), var(--rose))',
              borderColor: 'var(--rose)',
              color: '#fff',
            }}
          >
            {tCommon('delete')}
          </button>
        </ModalFoot>
      </Modal>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryPill({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span
        className="text-[15px] font-black font-[var(--font-title)]"
        style={{ color: `var(--${color})` }}
      >
        {value}
      </span>
      <span className="text-[9px] text-[var(--text-lo)]">{label}</span>
    </div>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const toolbar =
  'flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-[var(--border)] shrink-0 bg-[var(--panel)]';

const paginationBar =
  'flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-t border-[var(--border)] shrink-0 bg-[var(--panel)]';

// overflow-x-auto so chips scroll horizontally on mobile instead of wrapping
const statusBar =
  'flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b border-[var(--border)] shrink-0 bg-[var(--panel)] overflow-x-auto overscroll-x-contain';

const statusChip =
  'flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border)] text-[9px] font-bold font-[var(--font-title)] tracking-[0.06em] text-[var(--text-lo)] transition-all cursor-pointer hover:border-[var(--border-hi)] hover:text-[var(--text-mid)] shrink-0 whitespace-nowrap';
const statusChipActive = 'border-current';

const statusCount = 'text-[8px] font-bold opacity-50 bg-[var(--panel2)] px-1 py-px rounded-full';

const controlGroup = 'flex items-center gap-1';
const controlLabel =
  'text-[7px] font-bold tracking-[0.12em] text-[var(--text-lo)] font-[var(--font-title)] uppercase mr-0.5';

const segBtn =
  'text-[8px] font-bold px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-lo)] font-[var(--font-title)] tracking-[0.06em] transition-all hover:text-[var(--text-mid)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--text-lo)]';
const segBtnActive =
  'text-[var(--gold)] border-[oklch(0.74_0.17_85_/_0.4)] bg-[oklch(0.74_0.17_85_/_0.08)]';

const colPicker =
  'absolute right-0 top-full mt-1 z-50 bg-[var(--panel)] border border-[var(--border)] rounded-[var(--r-sm)] shadow-xl min-w-[140px] p-2 flex flex-col gap-0.5';
const colPickerTitle =
  'text-[7px] font-bold tracking-[0.12em] uppercase text-[var(--text-lo)] mb-1 font-[var(--font-title)] px-1 block';
const colPickerRow =
  'flex items-center gap-2 px-1 py-[3px] cursor-pointer text-[10px] text-[var(--text-mid)] hover:text-[var(--text-hi)] rounded transition-colors select-none';
