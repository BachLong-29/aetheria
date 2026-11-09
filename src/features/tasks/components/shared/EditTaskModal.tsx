'use client';

import { useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Icon } from '@/components/common/Icon';
import { Modal, ModalBody, ModalFoot } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import type { TaskColor, TaskStatus, UpdateTaskPayload } from '@/types';
import { SessionPlanner, type PlannerTask } from '@/features/schedule/components/SessionPlanner';
import { useTaskBlocks } from '@/features/schedule/hooks/useScheduleBlocks';

import { parseDateLocal } from '../../data/adapters';
import type { UITask } from '../../data/mock';
import { planSessionMoves } from '../../utils/session-moves';
import { SessionUpdatePrompt, type SessionUpdateTarget } from './SessionUpdatePrompt';
import { TaskForm, type TaskFormValues, type TaskFormHandle } from './TaskForm';

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

const DEFER_REASON_KEYS = ['tooBusy', 'blocked', 'priorityShift', 'health'] as const;
type DeferReasonKey = (typeof DEFER_REASON_KEYS)[number];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EditTaskModalProps {
  task: UITask | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, payload: UpdateTaskPayload, onSuccess: () => void) => void;
  saving?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

/** Format a Date using local timezone — avoids UTC off-by-one for UTC+ users. */
function toLocalDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

export function EditTaskModal({ task, open, onClose, onSave, saving }: EditTaskModalProps) {
  const t = useTranslations('tasks');
  const formRef = useRef<TaskFormHandle>(null);
  const [canSave, setCanSave] = useState(false);
  const [plannerTask, setPlannerTask] = useState<PlannerTask | null>(null);

  // Warning modal — shown after save when existing blocks need to be rescheduled
  const [blockWarning, setBlockWarning] = useState<SessionUpdateTarget | null>(null);

  // Defer state — reset whenever task changes (key prop on outer element handles this)
  const [isDeferred, setIsDeferred] = useState(false);
  const [deferChipKey, setDeferChipKey] = useState<DeferReasonKey | null>(null);
  const [deferCustom, setDeferCustom] = useState('');
  const [deferDate, setDeferDate] = useState<Date>(tomorrow);

  // Fetch existing blocks so we can warn when date/duration changes
  const { data: blocks = [] } = useTaskBlocks(task?.sourceId ?? '');

  // Post-save modals must render even after task is cleared (React batches both state updates)
  const postSaveModals = (
    <>
      <SessionPlanner
        open={plannerTask !== null}
        task={plannerTask}
        onClose={() => setPlannerTask(null)}
      />
      <SessionUpdatePrompt
        target={blockWarning}
        onClose={() => setBlockWarning(null)}
        onManage={setPlannerTask}
      />
    </>
  );

  if (!task) return postSaveModals;

  function resetDefer() {
    setIsDeferred(false);
    setDeferChipKey(null);
    setDeferCustom('');
    setDeferDate(tomorrow());
  }

  function handleClose() {
    resetDefer();
    onClose();
  }

  function handleSubmit(values: TaskFormValues) {
    if (!task?.sourceId) return;

    const durationNum = values.duration ? parseInt(values.duration, 10) : NaN;
    const resolvedDuration =
      durationNum && !Number.isNaN(durationNum) ? durationNum : task.est != null ? null : undefined;
    const resolvedStartDate = values.startDate
      ? toLocalDate(values.startDate)
      : task.startDate
        ? null
        : undefined;

    const payload: UpdateTaskPayload = {
      name: values.name,
      note: values.note || undefined,
      icon: values.icon,
      tagId: values.tagId,
      color: values.color,
      status: values.status,
      duration: resolvedDuration,
      startDate: resolvedStartDate,
      endDate: values.endDate ? toLocalDate(values.endDate) : task.endDate ? null : undefined,
      projectId: values.projectId ? values.projectId : task.projectId ? null : undefined,
      dependencies: values.dependencies,
      attachments: values.attachments,
    };

    if (isDeferred) {
      const reason = deferChipKey
        ? t(`defer.reasons.${deferChipKey}`)
        : deferCustom.trim() || t('defer.checkboxLabel');
      payload.deferReason = reason;
      payload.startDate = toLocalDate(deferDate);
    } else if (task.deferReason) {
      payload.deferReason = null;
    }

    const effectiveStartDate = payload.startDate ?? undefined;

    const startDateMoved = !!resolvedStartDate && resolvedStartDate !== task.startDate;
    // Picking it back up after it was finished: the old sessions are spent, so
    // it needs planning again just as much as a date that moved.
    const reopened = !!task.done && values.status !== 'done';

    /**
     * After save: open SessionPlanner when the task is now something to do on a
     * date, with nothing scheduled against it.
     *
     * Two things used to keep this quiet. It asked whether the task had never
     * had a date at all, so a finished one dragged back to today was ignored.
     * And it required an estimate, which the planner does not actually need —
     * `PlannerTask.duration` is optional, and a task with no estimate is
     * exactly the one you want to sit down and lay out by hand.
     *
     * Blocks that already exist are the other branch's business.
     */
    const needsPlan =
      blocks.length === 0 &&
      !!effectiveStartDate &&
      values.status !== 'done' &&
      (!task.startDate || startDateMoved || reopened);

    const pendingPlanner = needsPlan
      ? {
          id: task.sourceId,
          name: values.name,
          icon: values.icon,
          color: values.color,
          duration: resolvedDuration,
          startDate: effectiveStartDate,
          endDate: values.endDate ? toLocalDate(values.endDate) : undefined,
        }
      : null;

    // After save: warn when existing blocks need rescheduling (date moved or duration changed)
    const durationChanged = resolvedDuration !== task.est;
    const needsBlockWarning = blocks.length > 0 && (startDateMoved || durationChanged);

    onSave(task.sourceId, payload, () => {
      if (pendingPlanner) {
        // Nothing scheduled yet for a task that now needs it — plan it directly
        setPlannerTask(pendingPlanner as PlannerTask);
      } else if (needsBlockWarning) {
        // Existing blocks may be out of sync — show warning modal first
        setBlockWarning({
          moves: planSessionMoves(
            blocks,
            task.startDate,
            effectiveStartDate ?? task.startDate ?? '',
          ),
          // Only a duration change leaves the sessions on the right day already.
          dateMoved: startDateMoved,
          plannerData: {
            id: task.sourceId ?? '',
            name: values.name,
            icon: values.icon,
            color: values.color,
            duration: resolvedDuration ?? undefined,
            startDate: effectiveStartDate ?? task.startDate ?? '',
            endDate: values.endDate ? toLocalDate(values.endDate) : task.endDate,
          },
        });
      }
    });
  }

  const defaultValues: Partial<TaskFormValues> = {
    name: task.title,
    note: task.desc ?? '',
    icon: task.icon ?? '',
    tagId: task.tagId ?? '',
    color: (task.color as TaskColor | undefined) ?? 'gold',
    status: (task.status as TaskStatus | undefined) ?? 'todo',
    startDate: task.startDate ? parseDateLocal(task.startDate) : null,
    endDate: task.endDate ? parseDateLocal(task.endDate) : null,
    duration: task.est != null ? String(task.est) : '',
    dependencies: task.dependencies ?? [],
    attachments: task.attachments ?? [],
    projectId: task.projectId ?? '',
  };

  const isSingleDay = !task.endDate || task.endDate === task.startDate;

  // A scheduled task (has a start date) can have its work sessions managed any time.
  const scheduledPlannerTask: PlannerTask | null =
    task.sourceId && task.startDate
      ? {
          id: task.sourceId,
          name: task.title,
          icon: task.icon,
          color: task.color,
          duration: task.est ?? undefined,
          startDate: task.startDate,
          endDate: task.endDate,
        }
      : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <>
      <Modal open={open} onClose={handleClose} maxWidth="560px" bottomSheet scrollable>
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 relative border-b border-[var(--border-lo)] shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="[font-family:var(--f-title)] text-[9px] tracking-[0.3em] text-[var(--gold)]">
              {t('editModal.tag')}
            </span>
            {scheduledPlannerTask && (
              <button
                type="button"
                onClick={() => setPlannerTask(scheduledPlannerTask)}
                className="flex items-center gap-1 px-2 py-[3px] rounded-[5px] border border-[oklch(0.74_0.17_85_/_0.3)] text-[9px] font-bold tracking-[0.08em] text-[var(--gold)] bg-[oklch(0.74_0.17_85_/_0.06)] hover:bg-[oklch(0.74_0.17_85_/_0.12)] transition-colors"
              >
                <Icon icon="calendar" /> {t('editModal.manageSchedule')}
              </button>
            )}
          </div>
          <div className="[font-family:var(--f-title)] text-[20px] sm:text-[22px] font-bold tracking-[0.04em] text-[var(--text-hi)]">
            <span className="flex items-center gap-2 truncate max-w-full">
              {task.icon && <Icon icon={task.icon} className="text-[24px] leading-none shrink-0" />}
              <span className="text-[20px] sm:text-[22px] truncate">{task.title}</span>
            </span>
          </div>
        </div>

        <ModalBody scrollable className="px-4 sm:px-6">
          <TaskForm
            ref={formRef}
            key={task.id}
            mode="edit"
            defaultValues={defaultValues}
            editingId={task.sourceId}
            onSubmit={handleSubmit}
            onCanSaveChange={setCanSave}
            saving={saving}
          />

          {/* ── Defer section — single-day tasks only ──────────────────────── */}
          {isSingleDay && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <Checkbox
                checked={isDeferred}
                onChange={(checked) => {
                  setIsDeferred(checked);
                  if (!checked) resetDefer();
                }}
              >
                {t('defer.checkboxLabel')}
              </Checkbox>

              {isDeferred && (
                <div className="mt-3 space-y-3">
                  {/* Reason chips */}
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.1em] text-[var(--text-lo)] uppercase mb-2">
                      {t('defer.reasonLabel')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFER_REASON_KEYS.map((key) => (
                        <Button
                          key={key}
                          type="button"
                          size="sm"
                          variant={deferChipKey === key ? 'primary' : 'ghost'}
                          onClick={() => setDeferChipKey(deferChipKey === key ? null : key)}
                        >
                          {t(`defer.reasons.${key}`)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Custom reason */}
                  <Input
                    value={deferChipKey ? t(`defer.reasons.${deferChipKey}`) : deferCustom}
                    disabled={!!deferChipKey}
                    maxLength={200}
                    placeholder={t('defer.reasonPlaceholder')}
                    onChange={(e) => setDeferCustom(e.target.value)}
                  />

                  {/* Date picker */}
                  <DatePicker
                    label={t('defer.dateLabel')}
                    value={deferDate}
                    onChange={(d) => {
                      if (d >= today) setDeferDate(d);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </ModalBody>

        <ModalFoot className="shrink-0">
          <div className="flex items-center justify-end gap-3 w-full">
            <Button variant="ghost" onClick={handleClose} disabled={saving}>
              {t('editModal.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => formRef.current?.submit()}
              disabled={saving || !canSave}
            >
              {saving
                ? t('editModal.saving')
                : isDeferred
                  ? t('editModal.reschedule')
                  : t('editModal.save')}
            </Button>
          </div>
        </ModalFoot>
      </Modal>

      {postSaveModals}
    </>
  );
}
