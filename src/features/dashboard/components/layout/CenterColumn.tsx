import { memo, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { cn } from '@/libs/utils';

import type { CenterTab, Quest } from '../../types';
import { AnalyticsPanel } from '../analytics/AnalyticsPanel';
import { HabitPanel } from '../habits/HabitPanel';
import { ScheduleView, type ScheduleSubTabRequest } from '../schedule/ScheduleView';

interface Props {
  tab: CenterTab;
  onTabChange: (tab: CenterTab) => void;
  onAddQuest: (quest: Quest) => void;
  todayDateStr: string;
  scheduleSubTabRequest?: ScheduleSubTabRequest | null;
}

export const CenterColumn = memo(function CenterColumn({
  tab,
  onTabChange,
  onAddQuest,
  todayDateStr,
  scheduleSubTabRequest,
}: Props) {
  const t = useTranslations('dashboard');

  const tabDefs = useMemo(
    () => [
      { key: 'schedule' as CenterTab, label: t('tabs.schedule') },
      { key: 'habits' as CenterTab, label: t('tabs.habits') },
      { key: 'stats' as CenterTab, label: t('tabs.stats') },
    ],
    [t],
  );

  return (
    <div className={centerCol}>
      <div className={centerTabs}>
        {tabDefs.map((tabDef) => (
          <Button
            key={tabDef.key}
            type="button"
            variant="ghost"
            className={cn(tabButtonBase, tabButtonHover, tab === tabDef.key && tabButtonActive)}
            onClick={() => onTabChange(tabDef.key)}
          >
            {tabDef.label}
          </Button>
        ))}
      </div>

      {tab === 'habits' && <HabitPanel todayStr={todayDateStr} />}
      {tab === 'schedule' && (
        <div className={cn(panelBase, panelGold, 'flex-1 overflow-hidden min-h-0 flex flex-col')}>
          <div className={cornerTL} />
          <div className={cornerTR} />
          <div className={cornerBL} />
          <div className={cornerBR} />
          <div className={panelHeader}>
            <span className={panelHeaderTitle}>{t('schedule.title')}</span>
            <span className={panelHeaderOrnament}>◆ ◆ ◆</span>
          </div>
          <ScheduleView
            onAddQuest={onAddQuest}
            onNavigateTab={onTabChange}
            subTabRequest={scheduleSubTabRequest}
          />
        </div>
      )}
      {tab === 'stats' && (
        <div className={cn(panelBase, panelViolet, 'flex-1 overflow-hidden min-h-0 flex flex-col')}>
          <div className={panelHeader}>
            <span className={panelHeaderTitle}>{t('analytics.title')}</span>
            <span className={panelHeaderOrnament}>◆ ◆ ◆</span>
          </div>
          <AnalyticsPanel />
        </div>
      )}
    </div>
  );
});

// ── Layout ────────────────────────────────────────────────────────────────────

const centerCol = 'flex flex-col gap-2.5 overflow-hidden min-h-0';
// Desktop only. Below 1025px the bottom nav already carries these same three,
// and two rows of the same choice is one row of the day list.
const centerTabs = 'hidden min-[1025px]:flex gap-1 shrink-0';

// ── Tab buttons ───────────────────────────────────────────────────────────────

const tabButtonBase =
  'font-[var(--font-title)] text-[10px] tracking-[0.12em] font-bold text-[var(--text-mid)] bg-[var(--panel)] border border-[var(--border)] rounded-[var(--r-sm)] px-[14px] py-[7px] cursor-pointer transition-all duration-200 uppercase';
const tabButtonHover = 'hover:text-[var(--text-hi)] hover:border-[oklch(0.74_0.17_85_/_0.3)]';
const tabButtonActive =
  'text-[var(--gold)] bg-[oklch(0.74_0.17_85_/_0.08)] border-[oklch(0.74_0.17_85_/_0.5)] shadow-[0_0_12px_var(--gold-glow)]';

// ── Panel styles ──────────────────────────────────────────────────────────────

const panelBase =
  "bg-[var(--panel)] border border-[var(--border)] rounded-[var(--r)] overflow-hidden relative before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:rounded-[inherit] before:[background-image:repeating-linear-gradient(0deg,transparent,transparent_28px,oklch(1_0_0_/_0.012)_28px,oklch(1_0_0_/_0.012)_29px),repeating-linear-gradient(90deg,transparent,transparent_28px,oklch(1_0_0_/_0.012)_28px,oklch(1_0_0_/_0.012)_29px)]";
const panelGold =
  'border-[oklch(0.74_0.17_85_/_0.35)] shadow-[0_0_20px_oklch(0.74_0.17_85_/_0.06),inset_0_0_20px_oklch(0.74_0.17_85_/_0.03)]';
const panelViolet =
  'border-[oklch(0.66_0.22_295_/_0.35)] shadow-[0_0_20px_oklch(0.66_0.22_295_/_0.08),inset_0_0_20px_oklch(0.66_0.22_295_/_0.03)]';

const panelHeader =
  'flex items-center gap-2 px-[14px] pt-[10px] pb-[8px] border-b border-[var(--border)]';
const panelHeaderTitle =
  'font-[var(--font-title)] text-[10px] font-bold tracking-[0.15em] text-[var(--gold)] uppercase flex-1';
const panelHeaderOrnament = 'text-[var(--gold-dim)] text-[8px] tracking-[3px] opacity-60';

const cornerBase = 'absolute w-3 h-3 pointer-events-none border-[var(--gold-dim)]';
const cornerTL = cn(cornerBase, 'top-[5px] left-[5px] border-t-[1.5px] border-l-[1.5px]');
const cornerTR = cn(cornerBase, 'top-[5px] right-[5px] border-t-[1.5px] border-r-[1.5px]');
const cornerBL = cn(cornerBase, 'bottom-[5px] left-[5px] border-b-[1.5px] border-l-[1.5px]');
const cornerBR = cn(cornerBase, 'bottom-[5px] right-[5px] border-b-[1.5px] border-r-[1.5px]');
