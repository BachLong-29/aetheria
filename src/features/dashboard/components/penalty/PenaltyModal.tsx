import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { CoinIcon } from '@/components/common/CoinIcon';
import { Button } from '@/components/ui/Button';
import { penaltyEscalationFor } from '@/constants/penalty';
import { cn } from '@/libs/utils';

import type { PenaltySource, PenaltyUnfinishedItem } from '../../types';

interface PenaltyModalProps {
  unfinished: PenaltyUnfinishedItem[];
  tier: number;
  source: PenaltySource;
  onAccept?: () => void;
  onComplete: () => void;
  onFail: () => void;
}

interface PenaltyTask {
  id: string;
  title: string;
  desc: string;
  icon: string;
}

interface TierLabel {
  label: string;
  sublabel: string;
}

function pickPenalty(seed: number, source: PenaltySource): PenaltyTask {
  const pool = source === 'task' ? TASK_PENALTY_POOL : PENALTY_POOL;
  return pool[Math.abs(seed) % pool.length] ?? pool[0];
}

function GlitchTitle({ text }: { text: string }) {
  return (
    <div className={glitchTitleWrap} aria-label={text}>
      <span>{text}</span>
      <span className={cn(glitchTitleLayer, glitchTitleLayerTop)} aria-hidden="true">
        {text}
      </span>
      <span className={cn(glitchTitleLayer, glitchTitleLayerBottom)} aria-hidden="true">
        {text}
      </span>
    </div>
  );
}

export function PenaltyModal({
  unfinished,
  tier,
  source,
  onAccept,
  onComplete,
  onFail,
}: PenaltyModalProps) {
  const t = useTranslations('dashboard');
  const tierLabel =
    TIER_LABELS[Math.min(Math.max(tier, 1) - 1, TIER_LABELS.length - 1)] ?? TIER_LABELS[0];
  const escalation = { ...penaltyEscalationFor(tier), ...tierLabel };

  // Computed once on mount and kept stable — a plain value, not a ref read in render.
  const [penalty] = useState<PenaltyTask>(() => pickPenalty(unfinished.length + tier * 7, source));

  const itemNoun = source === 'task' ? 'task' : 'quest';

  const totalSecs = useMemo(() => TIME_BY_TIER[tier] ?? 60 * 60, [tier]);
  const [secsLeft, setSecsLeft] = useState(totalSecs);
  const [accepted, setAccepted] = useState(false);

  // Reset the countdown when the duration changes — the render-phase "adjust state
  // on prop change" pattern (same as FocusTimer), avoiding a setState-in-effect.
  const [prevTotalSecs, setPrevTotalSecs] = useState(totalSecs);
  if (prevTotalSecs !== totalSecs) {
    setPrevTotalSecs(totalSecs);
    setSecsLeft(totalSecs);
    setAccepted(false);
  }

  useEffect(() => {
    if (!accepted) return;
    if (secsLeft <= 0) {
      onFail();
      return;
    }
    const t = window.setTimeout(() => setSecsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secsLeft, accepted, onFail]);

  const handleAccept = () => {
    setAccepted(true);
    onAccept?.();
  };

  const mins = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const secs = String(secsLeft % 60).padStart(2, '0');
  const pctTimeLeft = secsLeft / totalSecs;
  const urgent = pctTimeLeft < 0.25;
  const critical = pctTimeLeft < 0.1;

  return (
    <div className={penaltyBackdrop}>
      <div className={penaltyBgFlash} />
      <div className={penaltyWarningStripes} />

      <div
        className={cn(penaltyModal, urgent && penaltyModalUrgent, critical && penaltyModalCritical)}
      >
        <div className={penaltyHeader}>
          <div className={penaltyStripeBar}>
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className={cn(penaltyStripe, i % 2 === 1 && penaltyStripeOdd)} />
            ))}
          </div>
          <div className={penaltySystemTag}>
            <span className={penaltyBlink}>●</span>
            <span>SYSTEM ALERT</span>
            <span className={penaltyBlink}>●</span>
          </div>
          <GlitchTitle text="PENALTY QUEST" />
          <div className={penaltySubtitle}>
            ◆ {escalation.label} · {escalation.sublabel} ◆
          </div>
        </div>

        <div className={penaltyIconWrap}>
          <div className={penaltyIconRing} />
          <div className={penaltyIconGlow} />
          <div className={penaltyIcon}>{penalty.icon}</div>
        </div>

        <div className={penaltySection}>
          <div className={penaltySectionLabel}>◆ EVIDENCE OF NEGLIGENCE</div>
          <div className={penaltyEvidenceText}>
            You failed to complete <span className={penaltyNum}>{unfinished.length}</span>{' '}
            {unfinished.length === 1 ? itemNoun : `${itemNoun}s`} before the day&apos;s end. The
            System has issued a corrective task.
          </div>
          <div className={penaltyEvidenceList}>
            {unfinished.map((item) => (
              <div key={item.id} className={penaltyEvidenceItem}>
                <span className={penaltyEvidenceCross}>✕</span>
                <span className={penaltyEvidenceName}>{item.title}</span>
                {item.difficulty && (
                  <span className={penaltyEvidenceRank}>{item.difficulty}-RANK</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={penaltyQuestCard}>
          <div className={penaltyQuestLabel}>▼ MANDATORY TASK ▼</div>
          <div className={penaltyQuestTitle}>{penalty.title}</div>
          <div className={penaltyQuestDesc}>{penalty.desc}</div>
        </div>

        <div className={penaltySection}>
          <div className={penaltySectionLabel}>◆ CONSEQUENCE OF FAILURE</div>
          <div className={penaltyConsequences}>
            <div className={penaltyConsRow}>
              <span className={penaltyConsIcon}>⚡</span>
              <span className={penaltyConsLabel}>EXP LOSS</span>
              <span className={penaltyConsVal}>−{escalation.xpLoss.toLocaleString()}</span>
            </div>
            <div className={penaltyConsRow}>
              <span className={penaltyConsIcon}>📉</span>
              <span className={penaltyConsLabel}>ALL STATS</span>
              <span className={penaltyConsVal}>−{escalation.statLoss}</span>
            </div>
            <div className={penaltyConsRow}>
              <span className={penaltyConsIcon}>
                <CoinIcon />
              </span>
              <span className={penaltyConsLabel}>COIN LOSS</span>
              <span className={penaltyConsVal}>−{escalation.coinLoss}</span>
            </div>
            {escalation.streakBreak && (
              <div className={cn(penaltyConsRow, penaltyConsRowSevere)}>
                <span className={penaltyConsIcon}>🔥</span>
                <span className={penaltyConsLabel}>STREAK</span>
                <span className={cn(penaltyConsVal, penaltyConsValSevere)}>RESET TO 0</span>
              </div>
            )}
            {escalation.rankDemote && (
              <div className={cn(penaltyConsRow, penaltyConsRowSevere)}>
                <span className={penaltyConsIcon}>⬇</span>
                <span className={penaltyConsLabel}>RANK</span>
                <span className={cn(penaltyConsVal, penaltyConsValSevere)}>DEMOTED</span>
              </div>
            )}
            <div className={cn(penaltyConsRow, penaltyConsRowSevere)}>
              <span className={penaltyConsIcon}>⚠</span>
              <span className={penaltyConsLabel}>NEXT TIER</span>
              <span className={cn(penaltyConsVal, penaltyConsValSevere)}>
                {tier < 4 ? `ESCALATE → TIER ${tier + 1}` : 'MAX PENALTY ACTIVE'}
              </span>
            </div>
          </div>
        </div>

        <div className={penaltyTimerSection}>
          <div className={penaltyTimerLabel}>{accepted ? 'TIME REMAINING' : 'DECISION WINDOW'}</div>
          <div
            className={cn(
              penaltyTimerDisplay,
              urgent && penaltyTimerDisplayUrgent,
              critical && penaltyTimerDisplayCritical,
            )}
          >
            <span className={penaltyTimerSegment}>{mins}</span>
            <span className={penaltyTimerColon}>:</span>
            <span className={penaltyTimerSegment}>{secs}</span>
          </div>
          <div className={penaltyTimerTrack}>
            <div className={penaltyTimerFill} style={{ width: `${pctTimeLeft * 100}%` }} />
          </div>
        </div>

        <div className={penaltyActions}>
          {!accepted ? (
            <Button
              type="button"
              variant="ghost"
              className={cn(penaltyBtnBase, penaltyBtnPrimary)}
              onClick={handleAccept}
            >
              ⚔ {t('penalty.buttons.acceptQuest')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className={cn(penaltyBtnBase, penaltyBtnComplete)}
              onClick={onComplete}
            >
              ✓ {t('penalty.buttons.markCompleted')}
            </Button>
          )}
          <div className={penaltyFooterText}>
            ◆ Refusal is not an option. The System is absolute. ◆
          </div>
        </div>
      </div>
    </div>
  );
}

const PENALTY_POOL: [PenaltyTask, ...PenaltyTask[]] = [
  {
    id: 'p_pushups',
    title: '30 PUSH-UPS',
    desc: 'Complete 30 push-ups in a single set. No breaks.',
    icon: '💀',
  },
  {
    id: 'p_meditate',
    title: '20 MIN SILENT FOCUS',
    desc: 'Sit in silence. No phone. No music. Pure focus.',
    icon: '🕯️',
  },
  {
    id: 'p_cold',
    title: 'COLD SHOWER',
    desc: 'Endure a 3-minute cold shower. Resist the comfort.',
    icon: '❄️',
  },
  {
    id: 'p_purge',
    title: 'DECLUTTER WORKSPACE',
    desc: 'Remove 10 items from your desk. Cleanse the chaos.',
    icon: '🗑️',
  },
  {
    id: 'p_walk',
    title: '1KM SOLO WALK',
    desc: 'Walk one kilometer alone. No headphones. Reflect.',
    icon: '🌫️',
  },
];

// Mandatory-task pool for penalties triggered by overdue tasks.
const TASK_PENALTY_POOL: [PenaltyTask, ...PenaltyTask[]] = [
  {
    id: 'p_run5k',
    title: 'CHẠY BỘ 5KM',
    desc: 'Chạy bộ 5km liên tục. Không được dừng giữa chừng.',
    icon: '🏃',
  },
  {
    id: 'p_pushup100',
    title: '100 PUSH-UP',
    desc: 'Hoàn thành 100 cái push-up. Ngắt quãng cũng được, nhưng phải xong.',
    icon: '💪',
  },
  {
    id: 'p_crunch100',
    title: '100 CRUNCH',
    desc: 'Hoàn thành 100 cái gập bụng (crunch).',
    icon: '🔥',
  },
  {
    id: 'p_squat100',
    title: '100 SQUAT',
    desc: 'Hoàn thành 100 cái squat.',
    icon: '🦵',
  },
];

/** Heading of each tier; what the tier costs comes from `PENALTY_ESCALATIONS`. */
const TIER_LABELS: [TierLabel, ...TierLabel[]] = [
  { label: 'TIER I', sublabel: 'Initial Warning' },
  { label: 'TIER II', sublabel: 'Streak Severed' },
  { label: 'TIER III', sublabel: 'RANK DEMOTION' },
  { label: 'TIER IV', sublabel: 'Maximum Penalty' },
];

const TIME_BY_TIER: Record<number, number> = {
  1: 60 * 60,
  2: 30 * 60,
  3: 15 * 60,
  4: 5 * 60,
};

const penaltyBackdrop =
  'fixed inset-0 bg-[oklch(0.05_0.04_22_/_0.92)] backdrop-blur-[6px] z-[2000] flex items-center justify-center p-5 animate-[penalty-fade-in_0.3s_ease] overflow-y-auto';
const penaltyBgFlash =
  'absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--danger-glow)_0%,transparent_65%)] animate-[penalty-pulse_2.4s_ease-in-out_infinite] pointer-events-none';
const penaltyWarningStripes =
  'absolute inset-0 pointer-events-none animate-[stripe-march_24s_linear_infinite] [background-image:repeating-linear-gradient(45deg,transparent_0,transparent_30px,oklch(0.62_0.24_22_/_0.06)_30px,oklch(0.62_0.24_22_/_0.06)_60px)]';

const penaltyModal =
  'relative bg-[linear-gradient(180deg,#150508_0%,#0c0306_100%)] border-2 border-[var(--danger)] rounded-[4px] w-[460px] max-w-full max-h-[95vh] overflow-y-auto shadow-[0_0_0_1px_oklch(0_0_0_/_0.6)_inset,0_0_40px_var(--danger-glow),0_0_100px_oklch(0.62_0.24_22_/_0.25),0_24px_80px_oklch(0_0_0_/_0.8)] animate-[penalty-slam_0.5s_cubic-bezier(0.16,1.2,0.4,1)] z-[2]';
const penaltyModalUrgent =
  'animate-[penalty-shake_0.5s_ease-in-out_infinite] border-[oklch(0.7_0.25_22)]';
const penaltyModalCritical =
  'animate-[penalty-shake-hard_0.2s_ease-in-out_infinite] shadow-[0_0_60px_var(--danger),0_0_120px_var(--danger-glow)]';

const penaltyHeader =
  'relative px-6 pt-5 pb-4 border-b border-[oklch(0.62_0.24_22_/_0.4)] text-center bg-[linear-gradient(180deg,oklch(0.62_0.24_22_/_0.18),transparent)]';
const penaltyStripeBar = 'flex gap-1 justify-center mb-3';
const penaltyStripe = 'w-[18px] h-1 bg-[var(--danger)] opacity-70 skew-x-[-25deg]';
const penaltyStripeOdd = 'bg-[oklch(0.85_0.18_22)]';
const penaltySystemTag =
  'font-[var(--font-title)] text-[10px] font-bold tracking-[0.4em] text-[var(--danger)] flex items-center justify-center gap-2 mb-1.5 uppercase';
const penaltyBlink = 'animate-[penalty-blink_0.8s_ease-in-out_infinite] text-[8px]';
const glitchTitleWrap =
  'font-[var(--font-title)] text-[32px] font-black tracking-[0.15em] text-[oklch(0.95_0.05_22)] relative [text-shadow:0_0_20px_var(--danger-glow),0_0_40px_var(--danger-glow)] animate-[penalty-glitch_4s_steps(1)_infinite]';
const glitchTitleLayer = 'absolute inset-0 pointer-events-none';
const glitchTitleLayerTop =
  'text-[oklch(0.65_0.25_22)] animate-[penalty-glitch-1_3s_infinite_linear_alternate-reverse] [clip-path:polygon(0_0,100%_0,100%_35%,0_35%)]';
const glitchTitleLayerBottom =
  'text-[oklch(0.7_0.2_200)] animate-[penalty-glitch-2_2s_infinite_linear_alternate-reverse] [clip-path:polygon(0_60%,100%_60%,100%_100%,0_100%)]';
const penaltySubtitle =
  'font-[var(--font-title)] text-[11px] tracking-[0.3em] text-[oklch(0.75_0.18_22)] mt-1.5';

const penaltyIconWrap =
  'relative w-20 h-20 my-[18px] mx-auto mb-2 flex items-center justify-center';
const penaltyIconRing =
  'absolute inset-0 border-2 border-[var(--danger)] rounded-full border-t-transparent animate-[spin_3s_linear_infinite]';
const penaltyIconGlow =
  'absolute -inset-[10px] rounded-full bg-[radial-gradient(circle,var(--danger-glow),transparent_60%)] animate-[penalty-pulse_1.5s_ease-in-out_infinite]';
const penaltyIcon = 'text-[38px] relative [filter:drop-shadow(0_0_12px_var(--danger-glow))]';

const penaltySection = 'px-6 py-3';
const penaltySectionLabel =
  'font-[var(--font-title)] text-[9px] font-bold tracking-[0.25em] text-[var(--danger)] mb-2 text-center';
const penaltyEvidenceText =
  'text-[12px] text-[oklch(0.85_0.05_22)] text-center leading-[1.6] mb-2.5';
const penaltyNum =
  'font-[var(--font-title)] text-[16px] font-black text-[var(--danger)] [text-shadow:0_0_8px_var(--danger-glow)]';
const penaltyEvidenceList =
  'bg-black/50 border border-[oklch(0.62_0.24_22_/_0.25)] rounded-[4px] px-[10px] py-2 flex flex-col gap-1 max-h-[120px] overflow-y-auto';
const penaltyEvidenceItem =
  'flex items-center gap-2 text-[11px] px-1.5 py-1 border-b border-dashed border-[oklch(0.62_0.24_22_/_0.15)] last:border-b-0';
const penaltyEvidenceCross = 'text-[var(--danger)] font-bold text-[12px]';
const penaltyEvidenceName = 'flex-1 text-[oklch(0.7_0.04_22)] line-through';
const penaltyEvidenceRank =
  'font-[var(--font-title)] text-[9px] font-bold tracking-[0.1em] text-[var(--danger)] bg-[oklch(0.62_0.24_22_/_0.15)] px-1.5 py-0.5 rounded-[3px] border border-[oklch(0.62_0.24_22_/_0.3)]';

const penaltyQuestCard =
  "mx-6 my-1.5 px-[18px] py-4 bg-[linear-gradient(135deg,oklch(0.18_0.1_22),oklch(0.1_0.06_22))] border border-[var(--danger)] rounded-[4px] text-center relative overflow-hidden before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:bg-[linear-gradient(90deg,transparent,var(--danger),transparent)] before:animate-[scan-line_2s_linear_infinite]";
const penaltyQuestLabel =
  'font-[var(--font-title)] text-[9px] tracking-[0.3em] text-[oklch(0.75_0.18_22)] mb-2';
const penaltyQuestTitle =
  'font-[var(--font-title)] text-[22px] font-black text-[oklch(0.95_0.04_22)] tracking-[0.1em] mb-1.5 [text-shadow:0_0_16px_var(--danger-glow)]';
const penaltyQuestDesc = 'text-[12px] text-[oklch(0.78_0.03_22)] leading-[1.5]';

const penaltyConsequences =
  'bg-black/50 border border-[oklch(0.62_0.24_22_/_0.25)] rounded-[4px] py-1';
const penaltyConsRow =
  'flex items-center gap-2.5 px-[14px] py-[7px] border-b border-dashed border-[oklch(0.62_0.24_22_/_0.15)] last:border-b-0';
const penaltyConsRowSevere = 'bg-[oklch(0.62_0.24_22_/_0.1)]';
const penaltyConsIcon = 'text-[13px] w-[18px]';
const penaltyConsLabel =
  'flex-1 font-[var(--font-title)] text-[10px] tracking-[0.15em] text-[oklch(0.7_0.04_22)]';
const penaltyConsVal =
  'font-[var(--font-title)] text-[12px] font-bold tracking-[0.05em] text-[var(--danger)]';
const penaltyConsValSevere = 'text-[oklch(0.85_0.18_22)] [text-shadow:0_0_8px_var(--danger-glow)]';

const penaltyTimerSection =
  'px-6 py-[14px] text-center bg-[linear-gradient(180deg,transparent,oklch(0.62_0.24_22_/_0.08))] border-t border-[oklch(0.62_0.24_22_/_0.2)] mt-1.5';
const penaltyTimerLabel =
  'font-[var(--font-title)] text-[9px] tracking-[0.3em] text-[oklch(0.7_0.1_22)] mb-1.5';
const penaltyTimerDisplay =
  'font-[var(--font-title)] text-[44px] font-black tracking-[0.1em] text-[oklch(0.95_0.05_22)] [text-shadow:0_0_18px_var(--danger-glow)] flex items-center justify-center gap-1 leading-none';
const penaltyTimerDisplayUrgent = 'text-[oklch(0.85_0.2_22)] animate-[penalty-blink_1s_infinite]';
const penaltyTimerDisplayCritical =
  'text-[oklch(0.7_0.25_22)] animate-[penalty-blink_0.4s_infinite] text-[50px]';
const penaltyTimerSegment =
  'bg-black/60 border border-[var(--danger)] rounded-[4px] px-[10px] py-1 min-w-[64px] inline-block';
const penaltyTimerColon = 'text-[var(--danger)] animate-[penalty-blink_1s_infinite]';
const penaltyTimerTrack =
  'h-1 mt-2.5 bg-black/60 border border-[oklch(0.62_0.24_22_/_0.3)] rounded-[2px] overflow-hidden';
const penaltyTimerFill =
  'h-full bg-[linear-gradient(90deg,var(--danger-deep),var(--danger),oklch(0.85_0.2_22))] shadow-[0_0_10px_var(--danger-glow)] transition-[width] duration-1000 linear';

const penaltyActions = 'px-6 pt-4 pb-[22px] flex flex-col gap-2.5 items-center';
const penaltyBtnBase =
  'w-full p-[14px] font-[var(--font-title)] text-[12px] font-bold tracking-[0.25em] text-[oklch(0.98_0.02_22)] cursor-pointer rounded-[4px] border uppercase transition-all duration-200 relative overflow-hidden';
const penaltyBtnPrimary =
  "bg-[linear-gradient(135deg,var(--danger-deep),var(--danger))] border-[oklch(0.85_0.2_22)] shadow-[0_0_20px_var(--danger-glow),inset_0_0_12px_oklch(0_0_0_/_0.5)] hover:-translate-y-px hover:shadow-[0_0_30px_var(--danger-glow),0_0_60px_var(--danger-glow),inset_0_0_12px_oklch(0_0_0_/_0.5)] before:content-[''] before:absolute before:top-0 before:left-[-100%] before:w-[60%] before:h-full before:bg-[linear-gradient(90deg,transparent,oklch(1_0_0_/_0.3),transparent)] before:animate-[penalty-sweep_2.5s_linear_infinite]";
const penaltyBtnComplete =
  'bg-[linear-gradient(135deg,oklch(0.45_0.18_145),oklch(0.6_0.2_145))] border-[oklch(0.75_0.2_145)] shadow-[0_0_20px_oklch(0.6_0.2_145_/_0.4)] hover:-translate-y-px hover:shadow-[0_0_30px_oklch(0.6_0.2_145_/_0.5)]';
const penaltyFooterText =
  'font-[var(--font-title)] text-[9px] tracking-[0.2em] text-[oklch(0.55_0.1_22)] text-center italic';
