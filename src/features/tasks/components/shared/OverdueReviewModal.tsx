'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Modal, ModalHead, ModalBody, ModalFoot } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { useUpdateTask } from '@/features/dashboard/hooks/useUpdateTask';
import { SessionPlanner, type PlannerTask } from '@/features/schedule/components/SessionPlanner';
import { useRescheduleAllOverdue } from '../../hooks/useRescheduleAllOverdue';
import { useTaskBlocks } from '@/features/schedule/hooks/useScheduleBlocks';
import { cn } from '@/libs/utils';

import type { OverdueItem } from '../../hooks/useOverdueReview';
import { planSessionMoves, type SessionMove } from '../../utils/session-moves';
import { SessionUpdatePrompt, type SessionUpdateTarget } from './SessionUpdatePrompt';
import { Icon } from '@/components/common/Icon';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  items: OverdueItem[];
  onRemoveItem: (taskId: string) => void;
  onDismiss: () => void;
}

// ─── Row component ────────────────────────────────────────────────────────────

interface OverdueRowProps {
  item: OverdueItem;
  onRemove: (id: string) => void;
  /** Fires after a successful reschedule when the task already has scheduled
   * sessions, so the caller can prompt the user to go update them. Block ids
   * travel along so the prompt can move them without a second fetch. */
  onNeedsScheduleUpdate: (plannerTask: PlannerTask, moves: SessionMove[]) => void;
}

function OverdueRow({ item, onRemove, onNeedsScheduleUpdate }: OverdueRowProps) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const { mutate: updateTask, isPending } = useUpdateTask();
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  // Existing scheduled sessions for this task — if any, moving the due date
  // leaves them pointing at the old date, so the user needs to update them too.
  const { data: blocks = [] } = useTaskBlocks(item.id);

  function handleDone() {
    updateTask({ id: item.id, status: 'done' }, { onSuccess: () => onRemove(item.id) });
  }

  function handleReschedule() {
    if (!rescheduleDate) return;
    const newStartDate = toLocalDate(rescheduleDate);
    updateTask(
      { id: item.id, startDate: newStartDate, endDate: null },
      {
        onSuccess: () => {
          onRemove(item.id);
          if (blocks.length > 0) {
            onNeedsScheduleUpdate(
              {
                id: item.id,
                name: item.name,
                icon: item.icon,
                color: item.color,
                duration: item.duration,
                startDate: newStartDate,
              },
              planSessionMoves(blocks, item.startDate, newStartDate),
            );
          }
        },
      },
    );
  }

  function handleAbandon() {
    updateTask({ id: item.id, active: false }, { onSuccess: () => onRemove(item.id) });
  }

  const levelBadge =
    item.overdueLevel === 'critical'
      ? 'bg-[oklch(0.72_0.18_5_/_0.12)] border-[oklch(0.72_0.18_5_/_0.3)] text-[var(--rose)]'
      : 'bg-[oklch(0.74_0.17_85_/_0.1)] border-[oklch(0.74_0.17_85_/_0.3)] text-[var(--gold)]';

  const levelLabel =
    item.overdueLevel === 'critical'
      ? t('overdueReview.levelCritical')
      : t('overdueReview.levelLate');

  return (
    <div
      className={cn(
        'flex flex-col gap-2 p-3 rounded-[var(--r-md)] border transition-all',
        item.overdueLevel === 'critical'
          ? 'border-[oklch(0.72_0.18_5_/_0.2)] bg-[oklch(0.72_0.18_5_/_0.04)]'
          : 'border-[var(--border)] bg-[var(--bg-2)]',
      )}
    >
      {/* Task info row */}
      <div className="flex items-start gap-2">
        <span className="text-[18px] leading-none shrink-0 mt-0.5">
          <Icon icon={item.icon} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-[12px] font-semibold text-[var(--text-hi)] truncate">
              {item.name}
            </span>
            <span
              className={cn(
                'text-[8px] font-bold px-1.5 py-0.5 rounded border tracking-[0.06em] font-[var(--font-title)] shrink-0',
                item.overdueLevel === 'critical' ? 'animate-pulse' : '',
                levelBadge,
              )}
            >
              {levelLabel}
            </span>
          </div>
          <p className="text-[10px] text-[var(--text-lo)]">
            {t('overdueReview.daysOverdue', { count: item.daysOverdue })}
            {item.endDate
              ? ` ${t('overdueReview.dueDate', { date: item.endDate })}`
              : item.startDate
                ? ` ${t('overdueReview.wasDate', { date: item.startDate })}`
                : ''}
          </p>
        </div>
      </div>

      {/* Reschedule date picker — inline */}
      {showReschedule && (
        <div className="flex items-end gap-2 pl-[26px]">
          <div className="flex-1">
            <DatePicker
              label={t('overdueReview.newDate')}
              value={rescheduleDate}
              onChange={setRescheduleDate}
              onClear={() => setRescheduleDate(null)}
            />
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={handleReschedule}
            disabled={!rescheduleDate || isPending}
            className="h-[42px]"
          >
            {isPending ? '…' : t('overdueReview.set')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowReschedule(false);
              setRescheduleDate(null);
            }}
            disabled={isPending}
            className="h-[42px]"
          >
            ✕
          </Button>
        </div>
      )}

      {/* Action buttons */}
      {!showReschedule && (
        <div className="pl-0 sm:pl-[26px]">
          {!confirmAbandon ? (
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowReschedule(true)}
                disabled={isPending}
                className="w-full justify-center whitespace-nowrap px-1.5 text-[9px] tracking-[0.04em]"
              >
                {t('editModal.reschedule')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleDone}
                disabled={isPending}
                className="w-full justify-center whitespace-nowrap px-1.5 text-[9px] tracking-[0.04em]"
              >
                {isPending ? '…' : t('overdueReview.doneAction')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmAbandon(true)}
                disabled={isPending}
                className="w-full justify-center whitespace-nowrap px-1.5 text-[9px] tracking-[0.04em] text-[var(--rose)] hover:border-[oklch(0.72_0.18_5_/_0.4)]"
              >
                {t('overdueReview.abandon')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-[var(--rose)]">
                {t('overdueReview.confirmAbandon')}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAbandon}
                  disabled={isPending}
                  className="w-full justify-center whitespace-nowrap px-1.5 text-[9px] tracking-[0.04em]"
                >
                  {isPending ? '…' : t('overdueReview.yesAbandon')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmAbandon(false)}
                  disabled={isPending}
                  className="w-full justify-center whitespace-nowrap px-1.5 text-[9px] tracking-[0.04em]"
                >
                  {tCommon('cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Reschedule-all bar ───────────────────────────────────────────────────────

interface RescheduleAllBarProps {
  items: OverdueItem[];
  onRemoveItem: (taskId: string) => void;
  onNeedsScheduleUpdate: (target: SessionUpdateTarget) => void;
}

function RescheduleAllBar({ items, onRemoveItem, onNeedsScheduleUpdate }: RescheduleAllBarProps) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const { rescheduleAll, isPending } = useRescheduleAllOverdue();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | null>(null);
  const [failedCount, setFailedCount] = useState(0);

  async function apply(target: Date) {
    const newStartDate = toLocalDate(target);
    const result = await rescheduleAll(items, newStartDate);
    result.movedIds.forEach(onRemoveItem);
    setFailedCount(result.failedCount);
    if (result.failedCount === 0) {
      setOpen(false);
      setDate(null);
    }
    if (result.moves.length > 0) {
      const first = items.find((i) => i.id === result.movedIds[0]);
      if (!first) return;
      onNeedsScheduleUpdate({
        moves: result.moves,
        dateMoved: true,
        bulkTaskCount: result.movedIds.length,
        plannerData: { id: first.id, name: first.name, startDate: newStartDate },
      });
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="min-w-0 flex-1 justify-center"
      >
        {t('overdueReview.rescheduleAll')}
      </Button>
    );
  }

  return (
    <div className="flex w-full basis-full flex-col gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-2)] p-3">
      <p className="text-[11px] text-[var(--text-mid)]">
        {t('overdueReview.rescheduleAllHint', { count: items.length })}
      </p>
      <DatePicker
        label={t('overdueReview.newDate')}
        value={date}
        onChange={setDate}
        onClear={() => setDate(null)}
        minDate={new Date()}
      />
      {failedCount > 0 && (
        <p className="text-[10px] text-[var(--rose)]">
          ✕ {t('overdueReview.rescheduleAllFailed', { count: failedCount })}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setDate(null);
            setFailedCount(0);
          }}
          disabled={isPending}
          className="w-full min-w-0 justify-center"
        >
          {tCommon('cancel')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setDate(new Date())}
          disabled={isPending}
          className="w-full min-w-0 justify-center"
        >
          {t('overdueReview.today')}
        </Button>
        <Button
          variant="primary"
          onClick={() => date && apply(date)}
          disabled={!date || isPending}
          className="w-full min-w-0 justify-center"
        >
          {isPending ? '…' : t('overdueReview.set')}
        </Button>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function OverdueReviewModal({ open, items, onRemoveItem, onDismiss }: Props) {
  const t = useTranslations('tasks');
  const allDone = items.length === 0;

  // Post-reschedule prompt — lives on the parent (not OverdueRow) so it
  // survives the row being removed/unmounted when the item is rescheduled.
  const [blockWarning, setBlockWarning] = useState<SessionUpdateTarget | null>(null);
  const [plannerTask, setPlannerTask] = useState<PlannerTask | null>(null);

  return (
    <>
      <Modal open={open} onClose={onDismiss} maxWidth="520px">
        <ModalHead
          tag="OVERDUE"
          title={
            allDone ? (
              t('overdueReview.allCaughtUp')
            ) : (
              <span className="flex flex-col gap-0.5">
                <span>⚠ {t('overdueReview.title')}</span>
                <span className="text-[var(--text-lo)] font-normal text-[11px] tracking-[0.08em]">
                  {t('overdueReview.missedCount', { count: items.length })}
                </span>
              </span>
            )
          }
        />

        <ModalBody className="max-h-[calc(72vh-120px)] overflow-y-auto">
          {allDone ? (
            <p className="text-[12px] text-[var(--text-lo)] text-center py-6">
              {t('overdueReview.empty')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <OverdueRow
                  key={item.id}
                  item={item}
                  onRemove={onRemoveItem}
                  onNeedsScheduleUpdate={(plannerData, moves) =>
                    setBlockWarning({ moves, plannerData, dateMoved: true })
                  }
                />
              ))}
            </div>
          )}
        </ModalBody>

        <ModalFoot>
          <div className="flex w-full flex-wrap items-center gap-2">
            {!allDone && items.length > 1 && (
              <RescheduleAllBar
                items={items}
                onRemoveItem={onRemoveItem}
                onNeedsScheduleUpdate={setBlockWarning}
              />
            )}
            {!allDone && items.length <= 1 && (
              <p className="flex-1 text-[10px] text-[var(--text-lo)]">
                {t('overdueReview.reviewHint')}
              </p>
            )}
            <Button
              variant="ghost"
              onClick={onDismiss}
              className={cn('min-w-0 justify-center', items.length > 1 ? 'flex-1' : 'ml-auto')}
            >
              {t('overdueReview.dismiss')}
            </Button>
          </div>
        </ModalFoot>
      </Modal>

      {/* Post-reschedule — nudge the user to update the task's existing sessions */}
      <SessionUpdatePrompt
        target={blockWarning}
        onClose={() => setBlockWarning(null)}
        onManage={setPlannerTask}
      />

      <SessionPlanner
        open={plannerTask !== null}
        task={plannerTask}
        onClose={() => setPlannerTask(null)}
      />
    </>
  );
}
