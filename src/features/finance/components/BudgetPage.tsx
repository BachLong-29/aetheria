'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Modal, ModalHead, ModalBody, ModalFoot } from '@/components/ui/Modal';
import { Progress, type ProgressVariant } from '@/components/ui/Progress';
import { SkelBlock } from '@/components/ui/Skeleton';
import { GoldPanel } from '@/components/common/GoldPanel';
import { useUIStore } from '@/stores/ui.store';
import type { Budget } from '@/types';

import { useBudgets } from '../hooks/useBudgets';
import { useFinanceCategories } from '../hooks/useFinanceCategories';
import { useDeleteBudget } from '../hooks/useDeleteBudget';
import { currentMonthKey, formatCurrency, formatMonthLabel, monthBudgetLimit } from '../utils';
import { BudgetFormModal } from './BudgetFormModal';
import { BudgetList } from './BudgetList';
import { FinancePageHeader } from './FinancePageHeader';
import { buildBudgetTemplate } from '../budget-csv';
import { BudgetImportModal } from './BudgetImportModal';
import { MonthStepper } from './MonthStepper';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function BudgetPage() {
  const t = useTranslations('finance');
  const locale = useLocale();
  const [month, setMonth] = useState(currentMonthKey());
  const { data: budgets = [], isLoading, isFetching, refetch } = useBudgets(month);
  const { data: expenseCategories = [], refetch: refetchCategories } =
    useFinanceCategories('expense');
  const deleteBudget = useDeleteBudget();
  const addToast = useUIStore((s) => s.addToast);

  const [showForm, setShowForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);

  const [showImport, setShowImport] = useState(false);

  const canCreate = month >= currentMonthKey();

  /**
   * A sheet of every category with the amounts blank. Built from the reader's
   * own categories so an import matches them by name exactly, rather than by
   * guessing — which is the one place this could quietly budget the wrong row.
   */
  function downloadTemplate() {
    // Categories kept out of the totals never accumulate spending, so a line
    // for them would only ever read 0% — see finance-exclusions.ts.
    const csv = buildBudgetTemplate(
      expenseCategories.filter((c) => !c.excludeFromTotals),
      month,
      true,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `budget-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const existingCategoryIds = budgets.map((b) => b.categoryId);

  const totals = useMemo(() => {
    // Not a plain sum: the list carries an "Overall" row alongside the
    // categories it covers, so adding everything counted the same money twice.
    const limit = monthBudgetLimit(budgets);
    const spent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const percent = limit > 0 ? Math.min(999, Math.round((spent / limit) * 100)) : 0;
    return { limit, spent, percent };
  }, [budgets]);

  function handleEdit(budget: Budget) {
    setEditingBudget(budget);
    setShowForm(true);
  }

  function handleAdd() {
    setEditingBudget(null);
    setShowForm(true);
  }

  function handleDeleteConfirm() {
    if (!deletingBudget) return;
    deleteBudget.mutate(deletingBudget.id, {
      onSuccess: () => {
        addToast({ type: 'success', message: t('budget.deleted') });
        setDeletingBudget(null);
      },
      onError: () => {
        addToast({ type: 'error', message: t('budget.deleteFailed') });
        setDeletingBudget(null);
      },
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="shrink-0"
      >
        <FinancePageHeader
          title={t('budget.title')}
          hideTitleOnMobile
          controls={
            /* One row at every width. The two buttons shed their labels below
               `sm` and become glyphs, the same way this header's own action
               button does — letting them wrap instead left the month stepper
               alone on a line with two stray pills underneath it. */
            <div className="flex w-full min-w-0 items-stretch gap-1.5 sm:w-auto">
              <MonthStepper
                month={month}
                onChange={setMonth}
                className="h-9 min-w-0 flex-1 justify-between sm:h-auto sm:w-auto sm:flex-none sm:justify-start"
              />
              <Button
                variant="ghost"
                onClick={() => {
                  void refetch();
                  void refetchCategories();
                }}
                disabled={isFetching}
                title={t('budget.reload')}
                aria-label={t('budget.reload')}
                className={compactBtn}
              >
                <span className={isFetching ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
              </Button>
              <Button
                variant="ghost"
                onClick={downloadTemplate}
                title="Download template"
                aria-label="Download template"
                className={compactBtn}
              >
                ⤓ <span className="hidden sm:inline">Template</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowImport(true)}
                disabled={!canCreate}
                title={canCreate ? 'Import budgets' : t('budget.pastMonth')}
                aria-label="Import budgets"
                className={compactBtn}
              >
                ⤒ <span className="hidden sm:inline">Import</span>
              </Button>
            </div>
          }
          stat={
            budgets.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[20px] font-bold tabular-nums text-[var(--gold)] [font-family:var(--f-title)] sm:text-[24px]">
                    {formatCurrency(totals.spent)}{' '}
                    <span className="text-[12px] font-normal text-[var(--text-lo)] sm:text-[13px]">
                      / {formatCurrency(totals.limit)}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-[12px] font-bold tabular-nums"
                    style={{
                      color:
                        totals.percent >= 100
                          ? 'var(--crimson)'
                          : totals.percent >= 80
                            ? 'var(--gold)'
                            : 'var(--text-mid)',
                    }}
                  >
                    {totals.percent}%
                  </span>
                </div>
                <Progress
                  value={totals.spent}
                  max={totals.limit}
                  variant={totalsVariant(totals.percent)}
                  tall
                  shimmer={totals.percent < 100}
                />
              </div>
            ) : undefined
          }
          subtitle={
            budgets.length > 0
              ? t('budget.summarySubtitle', { count: budgets.length, percent: totals.percent })
              : undefined
          }
          action={{
            label: t('budget.setBudget'),
            onClick: handleAdd,
            disabled: !canCreate,
            title: canCreate ? undefined : t('budget.pastMonth'),
          }}
        />
      </motion.div>

      {/* ── Budgets panel ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: EASE_OUT }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <GoldPanel background={false} className="flex min-h-0 flex-1 flex-col">
          <div className={panelHeader}>
            <span className={panelHeaderTitle}>{t('budget.panel')}</span>
            <span className={panelHeaderOrnament}>◆ ◆ ◆</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[0, 1].map((i) => (
                  <SkelBlock key={i} className="h-[132px] rounded-[var(--r-lg)]" />
                ))}
              </div>
            ) : budgets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] py-10 text-center">
                <div className="text-[32px] opacity-60">🧾</div>
                <div className="text-[13px] font-bold text-[var(--text-mid)]">
                  {t('budget.empty', { month: formatMonthLabel(month, locale) })}
                </div>
                <div className="text-[11px] text-[var(--text-lo)]">{t('budget.emptyHint')}</div>
              </div>
            ) : (
              <BudgetList
                budgets={budgets}
                categories={expenseCategories}
                onEdit={handleEdit}
                onDelete={setDeletingBudget}
              />
            )}
          </div>
        </GoldPanel>
      </motion.div>

      <BudgetFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        month={month}
        categories={expenseCategories}
        existingCategoryIds={existingCategoryIds}
        budget={editingBudget}
      />

      <BudgetImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        defaultMonth={month}
      />

      <Modal open={!!deletingBudget} onClose={() => setDeletingBudget(null)} maxWidth="380px">
        <ModalHead tag={t('budget.deleteTag')} title={`🗑 ${t('budget.deleteTitle')}`} />
        <ModalBody>
          <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
            {t('budget.confirmDelete', {
              name: deletingBudget?.categoryId ? deletingBudget.categoryName : t('budget.overall'),
              month: formatMonthLabel(month, locale),
            })}
          </p>
        </ModalBody>
        <ModalFoot>
          <Button
            variant="ghost"
            onClick={() => setDeletingBudget(null)}
            disabled={deleteBudget.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteConfirm}
            isLoading={deleteBudget.isPending}
            disabled={deleteBudget.isPending}
          >
            {t('common.delete')}
          </Button>
        </ModalFoot>
      </Modal>
    </div>
  );
}

function totalsVariant(pct: number): ProgressVariant {
  if (pct >= 100) return 'danger';
  if (pct >= 80) return 'gold';
  return 'mint';
}

// ── Panel header (GoldPanel provides the frame; this is just the title row) ────

const panelHeader =
  'flex items-center gap-2 px-[14px] pt-[10px] pb-[8px] border-b border-[var(--border)]';
const panelHeaderTitle =
  'font-[var(--font-title)] text-[10px] font-bold tracking-[0.15em] text-[var(--gold)] uppercase flex-1';
const panelHeaderOrnament = 'text-[var(--gold-dim)] text-[8px] tracking-[3px] opacity-60';

/**
 * The exact geometry of this header's own action button, so the four controls
 * in the row share one height and one type scale: a 36px square on a phone,
 * glyph plus label from `sm`. `size="sm"` here left them visibly shorter than
 * the primary button beside them.
 */
const compactBtn = 'h-9 w-9 shrink-0 justify-center gap-0 p-0 sm:h-auto sm:w-auto sm:gap-2 sm:px-4';
