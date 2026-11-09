'use client';

import { useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { GoldPanel } from '@/components/common/GoldPanel';
import { Link } from '@/i18n/navigation';
import type { FinanceGoal } from '@/types';

import { useWallets } from '../hooks/useWallets';
import { useFinanceCategories } from '../hooks/useFinanceCategories';
import { useBudgets } from '../hooks/useBudgets';
import { useFinanceOverview } from '../hooks/useFinanceOverview';
import { useGoals } from '../hooks/useGoals';
import { useForecast } from '../hooks/useForecast';
import type { QuickEntryDraft } from '../quick-entry';
import { currentMonthKey } from '../utils';
import { FinancePageHeader } from './FinancePageHeader';
import { MonthStepper } from './MonthStepper';
import { TransactionFormModal } from './TransactionFormModal';
import { GoalContributionModal } from './GoalContributionModal';
import { AllocationBanner } from './overview/AllocationBanner';
import { MonthlyReportBanner } from './overview/MonthlyReportBanner';
import { BalanceCard } from './overview/BalanceCard';
import { BalanceForecastCard } from './overview/BalanceForecastCard';
import { BudgetProgressCard } from './overview/BudgetProgressCard';
import { LeftToSpendCard } from './overview/LeftToSpendCard';
import { MonthSummaryCard } from './overview/MonthSummaryCard';
import { RecentTransactionsCard } from './overview/RecentTransactionsCard';
import { SavingsGoalsCard } from './overview/SavingsGoalsCard';
import { TopSpendingCard } from './overview/TopSpendingCard';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const DESKTOP_QUERY = '(min-width: 1024px)';

type MobileGroup = 'budget' | 'spending' | 'goals';

function subscribeToDesktopQuery(callback: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getIsDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/** Server/first-paint default — corrected synchronously on the client before it's visible. */
function getIsDesktopServerSnapshot() {
  return false;
}

/**
 * Below `lg`, the six secondary cards are split into tabs instead of stacked — otherwise the
 * overview never fits a phone screen without scrolling. Resolved via JS (not just `lg:hidden`)
 * so the charts inside only ever mount once, sized against a real box instead of a
 * `display:none` one.
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktopQuery,
    getIsDesktopSnapshot,
    getIsDesktopServerSnapshot,
  );
}

/**
 * Finance overview — what's in the accounts, how the month is going, how much is still safe to
 * spend, whether the savings goals are on pace, and where the balance is heading. Managing
 * wallets, budgets, goals and the full ledger each live in their own tab.
 */
export function FinancePage() {
  const t = useTranslations('finance');
  const reduceMotion = useReducedMotion();

  const [month, setMonth] = useState(currentMonthKey());
  const [showAddTx, setShowAddTx] = useState(false);
  const [quickDraft, setQuickDraft] = useState<QuickEntryDraft | null>(null);
  const [contributingGoal, setContributingGoal] = useState<FinanceGoal | null>(null);
  const [mobileGroup, setMobileGroup] = useState<MobileGroup>('budget');
  const isDesktop = useIsDesktop();

  const { data: wallets = [], isLoading: walletsLoading } = useWallets();
  const { data: categories = [] } = useFinanceCategories();
  const { data: budgets = [], isLoading: budgetsLoading } = useBudgets(month);
  const { data: overview = null, isLoading: overviewLoading } = useFinanceOverview(month);
  const { data: goals = [], isLoading: goalsLoading } = useGoals(month);
  const { data: forecast = null, isLoading: forecastLoading } = useForecast();

  const overallBudget = budgets.find((b) => b.categoryId === null) ?? null;
  const hasWallets = wallets.length > 0;

  // Nag about the goal that's furthest from its monthly share — one decision, not a list.
  const goalToAllocate =
    goals
      .filter((g) => g.status === 'active' && g.unallocatedThisMonth > 0)
      .sort((a, b) => b.unallocatedThisMonth - a.unallocatedThisMonth)[0] ?? null;

  function handleQuickAdd(draft: QuickEntryDraft) {
    setQuickDraft(draft);
    setShowAddTx(true);
  }

  function closeTxModal() {
    setShowAddTx(false);
    setQuickDraft(null);
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:gap-4 sm:p-4">
        <motion.header
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: EASE_OUT }}
          className="shrink-0"
        >
          <FinancePageHeader
            title={t('overview.title')}
            hideTitleOnMobile
            controls={
              <MonthStepper
                month={month}
                onChange={setMonth}
                className="h-9 w-full justify-between sm:h-auto sm:w-auto sm:justify-start"
              />
            }
            action={{
              label: t('overview.addTransaction'),
              onClick: () => setShowAddTx(true),
              disabled: !hasWallets,
            }}
          />
        </motion.header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!hasWallets && !walletsLoading ? (
            <GoldPanel
              background={false}
              className="flex flex-col items-center gap-3 p-10 text-center"
            >
              <span className="text-[34px] opacity-70">🏦</span>
              <p className="text-[14px] font-bold text-[var(--text-hi)]">
                {t('overview.noWallets')}
              </p>
              <p className="max-w-[42ch] text-[12px] text-[var(--text-mid)]">
                {t('overview.noWalletsHint')}
              </p>
              <Link
                href="/finance/wallets"
                className={buttonVariants({ variant: 'primary', size: 'sm' })}
              >
                ＋ {t('overview.addWallet')}
              </Link>
            </GoldPanel>
          ) : (
            <div className="flex flex-col gap-2 sm:gap-4">
              <MonthlyReportBanner month={month} />

              <AllocationBanner
                goal={goalToAllocate}
                month={month}
                onAllocate={setContributingGoal}
              />

              {/* Always visible — the cards worth seeing without tapping anything. */}
              <BalanceCard wallets={wallets} isLoading={walletsLoading} />
              <MonthSummaryCard overview={overview} month={month} isLoading={overviewLoading} />

              {isDesktop ? (
                <div className="grid gap-4 lg:grid-cols-12">
                  <div className="flex flex-col gap-4 lg:col-span-7">
                    <BudgetProgressCard
                      budgets={budgets}
                      categories={categories}
                      isLoading={budgetsLoading}
                    />
                    <TopSpendingCard overview={overview} isLoading={overviewLoading} />
                  </div>

                  <div className="flex flex-col gap-4 lg:col-span-5">
                    <LeftToSpendCard
                      overallBudget={overallBudget}
                      overview={overview}
                      isLoading={budgetsLoading || overviewLoading}
                    />
                    <SavingsGoalsCard
                      goals={goals}
                      isLoading={goalsLoading}
                      onContribute={setContributingGoal}
                    />
                    <BalanceForecastCard forecast={forecast} isLoading={forecastLoading} />
                    <RecentTransactionsCard
                      overview={overview}
                      categories={categories}
                      wallets={wallets}
                      isLoading={overviewLoading}
                      onQuickAdd={handleQuickAdd}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <Tabs
                    variant="pill"
                    className="self-start"
                    activeKey={mobileGroup}
                    onChange={(key) => setMobileGroup(key as MobileGroup)}
                    tabs={[
                      { key: 'budget', label: t('overview.groupBudget') },
                      { key: 'spending', label: t('overview.groupSpending') },
                      { key: 'goals', label: t('overview.groupGoals') },
                    ]}
                  />

                  {mobileGroup === 'budget' && (
                    <div className="flex flex-col gap-2">
                      <BudgetProgressCard
                        budgets={budgets}
                        categories={categories}
                        isLoading={budgetsLoading}
                      />
                      <LeftToSpendCard
                        overallBudget={overallBudget}
                        overview={overview}
                        isLoading={budgetsLoading || overviewLoading}
                      />
                    </div>
                  )}

                  {mobileGroup === 'spending' && (
                    <div className="flex flex-col gap-2">
                      <TopSpendingCard overview={overview} isLoading={overviewLoading} />
                      <RecentTransactionsCard
                        overview={overview}
                        categories={categories}
                        wallets={wallets}
                        isLoading={overviewLoading}
                        onQuickAdd={handleQuickAdd}
                      />
                    </div>
                  )}

                  {mobileGroup === 'goals' && (
                    <div className="flex flex-col gap-2">
                      <SavingsGoalsCard
                        goals={goals}
                        isLoading={goalsLoading}
                        onContribute={setContributingGoal}
                      />
                      <BalanceForecastCard forecast={forecast} isLoading={forecastLoading} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <TransactionFormModal
        open={showAddTx}
        onClose={closeTxModal}
        wallets={wallets}
        categories={categories}
        draft={quickDraft}
      />

      <GoalContributionModal
        goal={contributingGoal}
        mode="add"
        onClose={() => setContributingGoal(null)}
      />
    </>
  );
}
