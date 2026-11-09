'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Modal, ModalHead, ModalBody, ModalFoot } from '@/components/ui/Modal';
import { useUIStore } from '@/stores/ui.store';
import type { FinanceGoal } from '@/types';

import { useAddContribution } from '../hooks/useAddContribution';
import { formatAmountInput, formatCurrency, todayKey, toAmountDigits } from '../utils';

interface Props {
  goal: FinanceGoal | null;
  /** `withdraw` takes money back out: a negative contribution, never more than the goal holds. */
  mode: 'add' | 'withdraw';
  onClose: () => void;
}

/** Puts money into a goal (prefilled with what this month still needs) or takes it back out. */
export function GoalContributionModal({ goal, mode, onClose }: Props) {
  const t = useTranslations('finance');
  const addContribution = useAddContribution();
  const addToast = useUIStore((s) => s.addToast);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Re-seed when the modal opens for a different goal (adjusted during render, not an effect).
  const withdrawing = mode === 'withdraw';
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const key = goal ? `${goal.id}:${mode}` : null;
  if (key !== prevKey) {
    setPrevKey(key);
    setAmount(!withdrawing && goal?.unallocatedThisMonth ? String(goal.unallocatedThisMonth) : '');
    setNote('');
  }

  const amountNum = Number(amount);
  const available = goal?.currentAmount ?? 0;
  const canSave =
    amountNum > 0 && (!withdrawing || amountNum <= available) && !addContribution.isPending;

  function handleSubmit() {
    if (!goal || !canSave) return;
    addContribution.mutate(
      {
        goalId: goal.id,
        amount: withdrawing ? -amountNum : amountNum,
        date: todayKey(),
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          addToast({
            type: 'success',
            message: t(withdrawing ? 'goals.withdrawn' : 'goals.contributed', {
              amount: formatCurrency(amountNum),
              goal: goal.name,
            }),
          });
          onClose();
        },
        onError: () =>
          addToast({
            type: 'error',
            message: t(withdrawing ? 'goals.withdrawFailed' : 'goals.contributeFailed'),
          }),
      },
    );
  }

  return (
    <Modal open={!!goal} onClose={onClose} maxWidth="420px">
      <ModalHead
        tag={t(withdrawing ? 'goals.withdrawTag' : 'goals.contributeTag')}
        title={t(withdrawing ? 'goals.withdrawTitle' : 'goals.contributeTitle', {
          goal: goal?.name ?? '',
        })}
      />
      <ModalBody className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{t('goals.contributeAmount')}</span>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            className="w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[18px] font-bold tabular-nums text-[var(--text-hi)] focus:border-[var(--gold)] focus:outline-none"
            value={formatAmountInput(amount)}
            onChange={(e) => setAmount(toAmountDigits(e.target.value))}
            placeholder="0"
          />
          {withdrawing && (
            <span className="text-[11px] text-[var(--text-mid)]">
              {t('goals.withdrawAvailable', { amount: formatCurrency(available) })}
            </span>
          )}
          {!withdrawing && !!goal?.unallocatedThisMonth && (
            <span className="text-[11px] text-[var(--text-mid)]">
              {t('goals.contributeSuggested', {
                amount: formatCurrency(goal.unallocatedThisMonth),
              })}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>{t('goals.contributeNote')}</span>
          <input
            className="w-full rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text-hi)] focus:border-[var(--gold)] focus:outline-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
        </label>
      </ModalBody>
      <ModalFoot>
        <Button variant="ghost" onClick={onClose} disabled={addContribution.isPending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSave}
          isLoading={addContribution.isPending}
        >
          ✦ {t('common.save')}
        </Button>
      </ModalFoot>
    </Modal>
  );
}

const fieldLabel =
  'text-[9px] font-bold tracking-[0.12em] uppercase text-[var(--text-mid)] [font-family:var(--f-title)]';
