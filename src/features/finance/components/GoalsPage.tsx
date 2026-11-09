'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';

import { Icon } from '@/components/common/Icon';
import { Button } from '@/components/ui/Button';
import { Modal, ModalHead, ModalBody, ModalFoot } from '@/components/ui/Modal';
import { SkelBlock } from '@/components/ui/Skeleton';
import { GoldPanel } from '@/components/common/GoldPanel';
import { useUIStore } from '@/stores/ui.store';
import type { FinanceGoal, TaskColor } from '@/types';

import { COLOR_CSS } from '../constants';
import { useGoals } from '../hooks/useGoals';
import { useDeleteGoal } from '../hooks/useDeleteGoal';
import { useUpdateGoal } from '../hooks/useUpdateGoal';
import { currentMonthKey, formatCurrency } from '../utils';
import { FinancePageHeader } from './FinancePageHeader';
import { GoalContributionModal } from './GoalContributionModal';
import { GoalFormModal } from './GoalFormModal';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function GoalsPage() {
  const t = useTranslations('finance');
  const locale = useLocale();
  const reduceMotion = useReducedMotion();

  const month = currentMonthKey();
  const { data: allGoals = [], isLoading } = useGoals(month, true);
  const goals = allGoals.filter((g) => g.status !== 'archived');
  const archivedGoals = allGoals.filter((g) => g.status === 'archived');
  const deleteGoal = useDeleteGoal();
  const updateGoal = useUpdateGoal();
  const addToast = useUIStore((s) => s.addToast);

  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FinanceGoal | null>(null);
  const [contributing, setContributing] = useState<{
    goal: FinanceGoal;
    mode: 'add' | 'withdraw';
  } | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<FinanceGoal | null>(null);

  function handleEdit(goal: FinanceGoal) {
    setEditingGoal(goal);
    setShowForm(true);
  }

  function handleAdd() {
    setEditingGoal(null);
    setShowForm(true);
  }

  function setArchived(goal: FinanceGoal, archived: boolean) {
    updateGoal.mutate(
      { id: goal.id, status: archived ? 'archived' : 'active' },
      {
        onSuccess: () =>
          addToast({
            type: 'success',
            message: t(archived ? 'goals.archivedToast' : 'goals.restoredToast', {
              goal: goal.name,
            }),
          }),
        onError: () =>
          addToast({
            type: 'error',
            message: t(archived ? 'goals.archiveFailed' : 'goals.restoreFailed'),
          }),
      },
    );
  }

  function handleDeleteConfirm() {
    if (!deletingGoal) return;
    deleteGoal.mutate(deletingGoal.id, {
      onSuccess: () => {
        addToast({ type: 'success', message: t('goals.deleted') });
        setDeletingGoal(null);
      },
      onError: () => {
        addToast({ type: 'error', message: t('goals.deleteFailed') });
        setDeletingGoal(null);
      },
    });
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
        <motion.header
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: EASE_OUT }}
          className="shrink-0"
        >
          <FinancePageHeader
            title={t('goals.title')}
            action={{ label: t('goals.addGoal'), onClick: handleAdd }}
          />
        </motion.header>

        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.35, delay: 0.05, ease: EASE_OUT }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <GoldPanel background={false} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-[14px] pb-[8px] pt-[10px]">
              <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--gold)] [font-family:var(--f-title)]">
                {t('goals.panel')}
              </span>
              <span className="text-[8px] tracking-[3px] text-[var(--gold-dim)] opacity-60">
                ◆ ◆ ◆
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {[0, 1].map((i) => (
                    <SkelBlock key={i} className="h-[160px] rounded-[var(--r-lg)]" />
                  ))}
                </div>
              ) : goals.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] py-10 text-center">
                  <div className="text-[32px] opacity-60">🎯</div>
                  <div className="text-[13px] font-bold text-[var(--text-hi)]">
                    {t('goals.empty')}
                  </div>
                  <div className="max-w-[46ch] text-[11px] text-[var(--text-mid)]">
                    {t('goals.emptyHint')}
                  </div>
                  <Button variant="primary" size="sm" onClick={handleAdd}>
                    ＋ {t('goals.addGoal')}
                  </Button>
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {goals.map((g) => {
                    const accent = COLOR_CSS[(g.color as TaskColor) ?? 'gold'] ?? 'var(--gold)';
                    const done = g.status === 'completed';

                    return (
                      <li
                        key={g.id}
                        className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--panel)] p-4 transition-colors hover:border-[var(--border-hi)]"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)] border text-[19px]"
                            style={{
                              background: `color-mix(in oklch, ${accent} 14%, transparent)`,
                              borderColor: `color-mix(in oklch, ${accent} 35%, transparent)`,
                            }}
                          >
                            <Icon icon={g.icon} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-bold text-[var(--text-hi)] [font-family:var(--f-title)]">
                              {g.name}
                            </div>
                            <div className="mt-0.5 text-[10px] text-[var(--text-mid)]">
                              {g.targetDate
                                ? t('goals.byDate', {
                                    date: new Date(`${g.targetDate}T00:00:00`).toLocaleDateString(
                                      locale,
                                    ),
                                  })
                                : t('goals.noTargetDate')}
                            </div>
                          </div>
                          {done && (
                            <span className="shrink-0 rounded-full border border-[var(--mint)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--mint)]">
                              ✓ {t('goals.completed')}
                            </span>
                          )}
                        </div>

                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-3)]">
                          <div
                            className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                            style={{ width: `${g.progress}%`, background: accent }}
                          />
                        </div>

                        <div className="flex items-baseline justify-between gap-2 text-[12px] tabular-nums">
                          <span className="text-[var(--text-hi)]">
                            {t('goals.saved', {
                              current: formatCurrency(g.currentAmount),
                              target: formatCurrency(g.targetAmount),
                            })}
                          </span>
                          <span className="text-[var(--text-mid)]">{g.progress}%</span>
                        </div>

                        {g.requiredMonthly !== null && !done && (
                          <p className="text-[11px] text-[var(--text-mid)]">
                            {t('overview.perMonthNeeded', {
                              amount: formatCurrency(g.requiredMonthly),
                            })}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3">
                          <button
                            type="button"
                            onClick={() => setContributing({ goal: g, mode: 'add' })}
                            className={actionBtn}
                          >
                            ＋ {t('goals.contribute')}
                          </button>
                          {g.currentAmount > 0 && (
                            <button
                              type="button"
                              onClick={() => setContributing({ goal: g, mode: 'withdraw' })}
                              className={actionBtn}
                            >
                              − {t('goals.withdraw')}
                            </button>
                          )}
                          <button type="button" onClick={() => handleEdit(g)} className={actionBtn}>
                            ✎ {t('common.edit')}
                          </button>
                          {!done && (
                            <button
                              type="button"
                              onClick={() => setArchived(g, true)}
                              disabled={updateGoal.isPending}
                              className={actionBtn}
                            >
                              ▣ {t('goals.archive')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeletingGoal(g)}
                            className={`${actionBtn} ml-auto hover:border-[var(--crimson)] hover:text-[var(--crimson)]`}
                          >
                            🗑 {t('common.delete')}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {archivedGoals.length > 0 && (
                <details className="mt-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--panel)]">
                  <summary className="cursor-pointer select-none px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-mid)]">
                    {t('goals.archived')} ({archivedGoals.length})
                  </summary>
                  <ul className="flex flex-col divide-y divide-[var(--border)] border-t border-[var(--border)]">
                    {archivedGoals.map((g) => (
                      <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                        <span className="text-[16px]">
                          <Icon icon={g.icon} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-bold text-[var(--text-hi)]">
                            {g.name}
                          </div>
                          <div className="text-[10px] tabular-nums text-[var(--text-mid)]">
                            {t('goals.saved', {
                              current: formatCurrency(g.currentAmount),
                              target: formatCurrency(g.targetAmount),
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setArchived(g, false)}
                          disabled={updateGoal.isPending}
                          className={actionBtn}
                        >
                          ↺ {t('goals.restore')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingGoal(g)}
                          className={`${actionBtn} hover:border-[var(--crimson)] hover:text-[var(--crimson)]`}
                        >
                          🗑 {t('common.delete')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </GoldPanel>
        </motion.div>
      </div>

      <GoalFormModal open={showForm} onClose={() => setShowForm(false)} goal={editingGoal} />

      <GoalContributionModal
        goal={contributing?.goal ?? null}
        mode={contributing?.mode ?? 'add'}
        onClose={() => setContributing(null)}
      />

      <Modal open={!!deletingGoal} onClose={() => setDeletingGoal(null)} maxWidth="380px">
        <ModalHead tag={t('goals.deleteTag')} title={`🗑 ${t('goals.deleteTitle')}`} />
        <ModalBody>
          <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
            {t('goals.confirmDelete', { name: deletingGoal?.name ?? '' })}
          </p>
        </ModalBody>
        <ModalFoot>
          <Button
            variant="ghost"
            onClick={() => setDeletingGoal(null)}
            disabled={deleteGoal.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteConfirm}
            isLoading={deleteGoal.isPending}
            disabled={deleteGoal.isPending}
          >
            {t('common.delete')}
          </Button>
        </ModalFoot>
      </Modal>
    </>
  );
}

const actionBtn =
  'inline-flex items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-mid)] transition-colors hover:border-[var(--gold)] hover:text-[var(--gold)]';
