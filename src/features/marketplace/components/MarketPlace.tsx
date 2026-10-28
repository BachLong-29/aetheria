'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { CoinIcon } from '@/components/common/CoinIcon';
import { GoldPanel } from '@/components/common/GoldPanel';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import DashboardTopbar from '@/features/dashboard/components/layout/DashboardTopbar';
import type { Character } from '@/features/dashboard/types';
import { buildEmptyChar, profileToCharacter } from '@/features/dashboard/utils/character.utils';
import { useRewards } from '@/features/rewards/hooks/useRewards';
import { useProfile } from '@/features/profile/hooks/useProfile';
import { Link } from '@/i18n/navigation';
import { cn } from '@/libs/utils';

import { REWARD_DATA } from '../data/mock';
import { MARKET_RARITY_FILTERS, RARITY_COLOR, RARITY_LABEL } from '../constants';
import { useRedeemReward } from '../hooks/useRedeemReward';
import type {
  MarketPlayerState,
  MarketReward,
  MarketRarityFilter,
  MarketBattlePassNode as MarketBattlePassNodeData,
} from '../types';
import { toMarketReward } from '../utils/to-market-reward';
import { MarketRewardCard } from './MarketRewardCard';
import { MarketRewardDetailModal } from './MarketRewardDetailModal';
import { MarketBattlePassNode } from './MarketBattlePassNode';

const REWARDS_PAGE_SIZE = 12;

export function MarketPlace() {
  const tMarket = useTranslations('marketplace');

  // ── Character snapshot for the shared app topbar — same pattern as TaskManagement ──
  const { data: profileData } = useProfile();
  const charInitialized = useRef(false);
  const [char, setChar] = useState<Character>(() => buildEmptyChar());
  useEffect(() => {
    const profile = profileData?.profile;
    if (!profile || charInitialized.current) return;
    setChar(profileToCharacter(profile));
    charInitialized.current = true;
  }, [profileData]);
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const [activeCat, setActiveCat] = useState<MarketRarityFilter>('all');
  // Held by id so the open modal tracks the live reward (stock drops after a redeem).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [flashColor, setFlashColor] = useState<string | null>(null);

  // The storefront sells the user's own rewards; the shop hides the ones switched off.
  const {
    data: rewardData,
    isPending: rewardsPending,
    isError: rewardsFailed,
  } = useRewards({
    limit: 100,
  });
  const { mutate: redeem, isPending: redeeming } = useRedeemReward();

  const player = useMemo<MarketPlayerState>(
    () => ({
      ...(REWARD_DATA.player as Omit<MarketPlayerState, 'achievement'>),
      level: char.level,
      rank: char.rank,
      coins: char.coins,
      gems: char.gems,
      achievement: 0,
    }),
    [char.level, char.rank, char.coins, char.gems],
  );

  const rewards = useMemo(
    () =>
      (rewardData?.items ?? [])
        .filter((r) => r.status !== 'inactive')
        .map((r) => toMarketReward(r, char.rank)),
    [rewardData, char.rank],
  );
  const selected = rewards.find((r) => r.id === selectedId) ?? null;

  const filtered = useMemo(
    () => (activeCat === 'all' ? rewards : rewards.filter((r) => r.rarity === activeCat)),
    [activeCat, rewards],
  );

  // Client-side pagination over the reward list.
  const [page, setPage] = useState(1);
  const [prevActiveCat, setPrevActiveCat] = useState(activeCat);
  if (prevActiveCat !== activeCat) {
    setPrevActiveCat(activeCat);
    if (page !== 1) setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / REWARDS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRewards = filtered.slice(
    (safePage - 1) * REWARDS_PAGE_SIZE,
    safePage * REWARDS_PAGE_SIZE,
  );

  // Milestone catalog (level/reward/rarity) stays mock content — there's no real battle-pass
  // system in the backend — but claimed/current are derived from the real profile level so the
  // track always reflects where the player actually stands.
  const battlePassNodes = useMemo(() => {
    const nodes = REWARD_DATA.battlePass as MarketBattlePassNodeData[];
    const nextLv = nodes.find((n) => n.lv > char.level)?.lv;
    return nodes.map((n) => ({ ...n, claimed: n.lv <= char.level, current: n.lv === nextLv }));
  }, [char.level]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rewards.length };
    rewards.forEach((r) => {
      c[r.rarity] = (c[r.rarity] || 0) + 1;
    });
    return c;
  }, [rewards]);

  const handleRedeem = (reward: MarketReward) => {
    if (redeeming) return;
    redeem(reward.id, {
      onSuccess: ({ coins, gems }) => {
        // The topbar reads `char`, which only seeds itself once from the profile.
        setChar((c) => ({ ...c, coins, gems }));
        setFlashColor(RARITY_COLOR[reward.rarity]);
        window.setTimeout(() => setFlashColor(null), 800);
        setSuccessMsg(`✦ ${reward.title.toUpperCase()} ACQUIRED ✦`);
        window.setTimeout(() => setSuccessMsg(null), 3000);
        setSelectedId(null);
      },
      // The server judges level, rank, funds and stock again, so a stale card gets the real reason.
      onError: (err) => {
        const message = (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message;
        setErrorMsg(message ?? 'Could not redeem this reward');
        window.setTimeout(() => setErrorMsg(null), 3000);
      },
    });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]">
      <DashboardTopbar char={char} dateStr={dateStr} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {flashColor && <div className={redeemFlash} style={{ color: flashColor }} />}
        {successMsg && (
          <div className={successToast}>
            <span>✓</span>
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className={cn(successToast, errorToast)}>
            <span>!</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <div className={hero}>
          <GoldPanel className="mb-4 flex flex-col gap-3 p-3 sm:mb-6 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className={heroTitle}>Reward Vault</h1>
                <div className={heroSub}>◆ The Spoils of Discipline ◆</div>
              </div>

              <Link
                href="/manage/rewards"
                className={manageBtn}
                aria-label="Manage Rewards"
                title="Manage Rewards"
              >
                <span aria-hidden="true">◈</span>
                <span className="hidden sm:inline">Manage Rewards</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className={cn(currencyPill, currencyPillXp)}>
                <span className={currencyPillIcon}>⚡</span>
                <span>LV.{char.level}</span>
              </div>
              <div className={cn(currencyPill, currencyPillGems)}>
                <span className={currencyPillIcon}>💠</span>
                <span>{char.gems.toLocaleString()}</span>
              </div>
              <div className={cn(currencyPill, currencyPillCoins)}>
                <span className={currencyPillIcon}>
                  <CoinIcon />
                </span>
                <span>{char.coins.toLocaleString()}</span>
              </div>
            </div>
          </GoldPanel>

          <div className={battlePass}>
            <div className={bpHeader}>
              <span className={bpTitle}>◆ Aetheric Path</span>
              <span className="flex-1" />
              <span className={bpProgress}>
                <strong className={bpProgressStrong}>Lv.{char.level}</strong> /{' '}
                {player.passMaxLevel} milestones
              </span>
            </div>
            <div className={bpTrack}>
              {battlePassNodes.map((node) => (
                <MarketBattlePassNode key={node.lv} node={node} />
              ))}
            </div>
          </div>
        </div>

        <div className={marketWrap}>
          <div className={catTabs}>
            {MARKET_RARITY_FILTERS.map((key) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                className={cn(catTab, activeCat === key && catTabActive)}
                onClick={() => setActiveCat(key)}
              >
                <span>{key === 'all' ? tMarket('categories.all') : RARITY_LABEL[key]}</span>
                <span className={cn(catTabCount, activeCat === key && catTabCountActive)}>
                  {counts[key] || 0}
                </span>
              </Button>
            ))}
          </div>

          {rewardsPending ? (
            <div className={emptyNote}>Loading rewards…</div>
          ) : rewardsFailed ? (
            <div className={emptyNote}>Could not load rewards. Try again later.</div>
          ) : rewards.length === 0 ? (
            <div className={emptyNote}>
              Nothing on the shelf yet.{' '}
              <Link href="/manage/rewards" className="text-[var(--gold)] underline">
                Forge a reward
              </Link>
            </div>
          ) : (
            <div className={rewardsGrid}>
              {pageRewards.map((r) => (
                <MarketRewardCard
                  key={r.id}
                  reward={r}
                  player={player}
                  onClick={(reward) => setSelectedId(reward.id)}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-6 flex justify-center sm:mt-8">
              <Pagination page={safePage} total={totalPages} onChange={setPage} />
            </div>
          )}
        </div>
      </div>

      {selected && (
        <MarketRewardDetailModal
          reward={selected}
          player={player}
          onClose={() => setSelectedId(null)}
          onRedeem={handleRedeem}
        />
      )}

      <style jsx global>{`
        @keyframes marketplace-aurora-drift {
          0%,
          100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(-30px, 20px);
          }
        }
        @keyframes marketplace-featured-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        @keyframes marketplace-spin-rev {
          to {
            transform: rotate(-360deg);
          }
        }
        @keyframes marketplace-holo-shift {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 300% 50%;
          }
        }
        @keyframes marketplace-legend-sweep {
          to {
            left: 200%;
          }
        }
        @keyframes marketplace-detail-in {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes marketplace-redeem-flash {
          0% {
            opacity: 0;
          }
          30% {
            opacity: 0.4;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes marketplace-toast-in {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        @keyframes marketplace-toast-out {
          to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
        }
      `}</style>
    </div>
  );
}

const manageBtn = cn(
  buttonVariants({ variant: 'violet', size: 'sm' }),
  'h-9 w-9 shrink-0 justify-center gap-0 p-0 no-underline sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-[7px]',
);

const currencyPill =
  'flex items-center gap-1.5 bg-[var(--panel2)] border border-[var(--border)] rounded-[20px] px-3 py-[5px] pl-[10px] text-[11px] sm:text-[13px] font-bold font-[var(--font-title)] tracking-[0.05em]';
const currencyPillIcon = 'text-[14px]';
const currencyPillGems =
  'border-[oklch(0.66_0.22_295_/_0.4)] text-[var(--violet)] shadow-[0_0_12px_oklch(0.66_0.22_295_/_0.15)]';
const currencyPillCoins =
  'border-[oklch(0.74_0.17_85_/_0.4)] text-[var(--gold)] shadow-[0_0_12px_var(--gold-glow)]';
const currencyPillXp = 'border-[oklch(0.76_0.16_205_/_0.4)] text-[var(--cyan)]';

const hero = 'px-3 pt-3 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 max-w-[1400px] mx-auto';
const heroTitle =
  'truncate font-[var(--font-title)] text-[20px] sm:text-[28px] lg:text-[36px] font-black tracking-[0.06em] leading-none bg-[linear-gradient(135deg,var(--gold)_0%,oklch(0.85_0.15_60)_30%,var(--violet)_70%,oklch(0.78_0.18_320)_100%)] bg-clip-text text-transparent [text-shadow:0_0_60px_var(--gold-glow)]';
const heroSub =
  'mt-1 text-[9px] sm:text-[11px] text-[var(--text-mid)] tracking-[0.18em] font-[var(--font-title)] uppercase';

const battlePass =
  'bg-[var(--panel)] border border-[var(--border)] rounded-[14px] px-4 py-4 sm:px-6 sm:py-5 mb-6 sm:mb-8 relative overflow-hidden before:content-[\"\"] before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_50%_0%,var(--gold-glow),transparent_60%)] before:opacity-30 before:pointer-events-none';
const bpHeader = 'flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 sm:mb-4 relative';
const bpTitle =
  'font-[var(--font-title)] text-[13px] sm:text-[16px] font-bold tracking-[0.15em] text-[var(--gold)] uppercase';
const bpProgress =
  'text-[10px] sm:text-[11px] text-[var(--text-mid)] font-[var(--font-title)] tracking-[0.1em]';
const bpProgressStrong = 'text-[var(--text-hi)] text-[13px] sm:text-[14px]';
const bpTrack = 'flex gap-1 overflow-x-auto py-1 pb-2 relative [&::-webkit-scrollbar]:h-1';

const marketWrap = 'px-3 pb-10 sm:px-6 sm:pb-12 lg:px-8 lg:pb-[60px] max-w-[1400px] mx-auto';
const catTabs = 'flex gap-1.5 mb-4 sm:mb-5 flex-wrap';
const catTab =
  'font-[var(--font-title)] text-[10px] sm:text-[11px] tracking-[0.15em] font-bold text-[var(--text-mid)] bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-2 sm:px-[18px] sm:py-[9px] cursor-pointer transition-all duration-200 uppercase flex items-center gap-1.5 hover:text-[var(--text-hi)] hover:border-[oklch(0.74_0.17_85_/_0.4)]';
const catTabActive =
  'text-[var(--gold)] bg-[oklch(0.74_0.17_85_/_0.1)] border-[var(--gold)] shadow-[0_0_16px_var(--gold-glow)]';
const catTabCount =
  'text-[9px] bg-[var(--panel3)] rounded-lg px-1.5 py-[1px] text-[var(--text-mid)]';
const catTabCountActive = 'bg-[var(--gold-fill)] text-[var(--on-gold-fill)]';

const rewardsGrid =
  'grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4';

const emptyNote =
  'py-12 text-center text-[13px] text-[var(--text-mid)] font-[var(--font-title)] tracking-[0.1em]';
const errorToast =
  'bg-[linear-gradient(135deg,oklch(0.4_0.2_25),oklch(0.55_0.22_25))] border-[oklch(0.7_0.2_25)] shadow-[0_0_40px_oklch(0.6_0.2_25_/_0.5)]';
const successToast =
  'fixed top-6 left-1/2 -translate-x-1/2 bg-[linear-gradient(135deg,oklch(0.4_0.18_145),oklch(0.55_0.2_145))] border border-[oklch(0.7_0.18_145)] px-7 py-3.5 rounded-[30px] font-[var(--font-title)] font-bold tracking-[0.15em] text-white z-[1000] flex items-center gap-2.5 shadow-[0_0_40px_oklch(0.6_0.18_145_/_0.5)] animate-[marketplace-toast-in_0.4s_cubic-bezier(0.34,1.56,0.64,1),marketplace-toast-out_0.4s_ease_2.5s_forwards]';
const redeemFlash =
  'fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,currentColor,transparent_50%)] opacity-0 z-[999] animate-[marketplace-redeem-flash_0.8s_ease]';
