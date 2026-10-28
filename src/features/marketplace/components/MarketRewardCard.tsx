'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { cn } from '@/libs/utils';

import { RARITY_COLOR, RARITY_LABEL, CURRENCY_ICON } from '../constants';
import type {
  MarketPlayerState,
  MarketReward,
  MarketRewardCurrency,
  MarketRewardRarity,
} from '../types';

function formatPrice(reward: MarketReward): string {
  if (reward.currency === 'achievement' || reward.price === 0) return 'ACHIEVEMENT';
  return reward.price.toLocaleString();
}

interface MarketRewardCardProps {
  reward: MarketReward;
  player: MarketPlayerState;
  onClick: (reward: MarketReward) => void;
}

export function MarketRewardCard({ reward, player, onClick }: MarketRewardCardProps) {
  const tMarket = useTranslations('marketplace');
  const hasStock = reward.stock == null || reward.stock > 0;
  const hasCurrency =
    (reward.currency === 'achievement' ? true : player[reward.currency] >= reward.price) &&
    player.gems >= (reward.gemsExtra ?? 0);
  const canRedeem = hasCurrency && player.level >= reward.reqLevel && hasStock;

  return (
    <div
      className={cn(
        rewardCard,
        rewardCardByRarity[reward.rarity],
        reward.locked && rewardCardLocked,
        reward.rarity === 'mythic' && rewardCardMythic,
      )}
      style={{ color: RARITY_COLOR[reward.rarity] }}
      onClick={() => onClick(reward)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(reward);
      }}
      role="button"
      tabIndex={0}
    >
      <div className={rewardCardBody}>
        <div className={cn(rewardArt, reward.rarity === 'legendary' && rewardArtLegendary)}>
          <div className={rewardArtGlow} />
          <div className={rewardArtRays} />
          <span className={rewardRarityTag}>{RARITY_LABEL[reward.rarity]}</span>
          {reward.stock != null && reward.stock <= 5 && !reward.locked && (
            <span className={rewardStock}>⚠ {reward.stock} LEFT</span>
          )}
          <span className={cn(rewardIcon, reward.locked && rewardIconLocked)}>{reward.icon}</span>

          {reward.locked && (
            <div className={rewardSeal}>
              <div className={sealEmblem}>
                <span className={sealEmblemIcon}>🔒</span>
              </div>
              <div className={sealText}>◆ Sealed ◆</div>
              <div className={sealCond}>{reward.lockReason}</div>
            </div>
          )}
        </div>

        <div className={cn(rewardInfo, reward.locked && rewardInfoLocked)}>
          <div className={rewardTitle}>{reward.title}</div>
          <div className={rewardDesc}>{reward.desc}</div>
          <div className={rewardBottom}>
            <div className={cn(rewardPrice, rewardPriceByCurrency[reward.currency])}>
              <span>{CURRENCY_ICON[reward.currency]}</span>
              <span>
                {formatPrice(reward)}
                {reward.gemsExtra
                  ? ` + ${CURRENCY_ICON.gems} ${reward.gemsExtra.toLocaleString()}`
                  : ''}
              </span>
            </div>
            {!reward.locked && (
              <Button
                type="button"
                variant="ghost"
                className={cn(rewardRedeem, !canRedeem && rewardRedeemCant)}
                onClick={(e) => {
                  e.stopPropagation();
                  onClick(reward);
                }}
              >
                {canRedeem ? tMarket('buttons.redeem') : tMarket('buttons.view')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const rewardCard =
  "group relative border-[1.5px] border-[var(--border)] rounded-[12px] overflow-hidden cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex flex-col min-h-[240px] sm:min-h-[280px] hover:-translate-y-1.5 before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:[background-image:repeating-linear-gradient(0deg,transparent,transparent_30px,oklch(1_0_0_/_0.015)_30px,oklch(1_0_0_/_0.015)_31px),repeating-linear-gradient(90deg,transparent,transparent_30px,oklch(1_0_0_/_0.015)_30px,oklch(1_0_0_/_0.015)_31px)]";
const rewardCardLocked =
  'before:[background-image:repeating-linear-gradient(45deg,transparent_0,transparent_14px,oklch(0_0_0_/_0.3)_14px,oklch(0_0_0_/_0.3)_16px)]';
// Animated holo ring — a real (transparent) border painted through by the card's own
// background, so `rewardCardBody`'s opaque panel background (which exactly fills the
// content box) is what keeps the gradient confined to a thin ring instead of covering
// the whole card. Simpler and more robust than the mask/composite trick this replaces,
// which rendered as a solid diagonal fill instead of a ring on locked+mythic cards.
const rewardCardMythic =
  'border-transparent hover:border-transparent bg-[linear-gradient(135deg,oklch(0.78_0.22_340)_0%,oklch(0.78_0.18_80)_20%,oklch(0.78_0.18_240)_40%,oklch(0.78_0.22_295)_60%,oklch(0.78_0.22_340)_80%,oklch(0.78_0.22_340)_100%)] [background-size:300%_300%] animate-[marketplace-holo-shift_4s_linear_infinite]';
const rewardCardBody =
  'relative flex h-full flex-1 flex-col overflow-hidden rounded-[10.5px] bg-[linear-gradient(180deg,var(--panel2),var(--panel))]';

const rewardCardByRarity: Record<MarketRewardRarity, string> = {
  common: '',
  uncommon:
    'border-[oklch(0.7_0.18_145_/_0.4)] hover:border-[oklch(0.7_0.18_145)] hover:shadow-[0_12px_40px_oklch(0.7_0.18_145_/_0.25)]',
  rare: 'border-[oklch(0.7_0.18_240_/_0.45)] hover:border-[oklch(0.7_0.18_240)] hover:shadow-[0_12px_40px_oklch(0.7_0.18_240_/_0.3)]',
  epic: 'border-[oklch(0.7_0.22_295_/_0.45)] hover:border-[oklch(0.7_0.22_295)] hover:shadow-[0_12px_40px_oklch(0.7_0.22_295_/_0.35)]',
  legendary:
    'border-[oklch(0.78_0.18_80_/_0.55)] shadow-[0_0_20px_oklch(0.78_0.18_80_/_0.12)] hover:border-[oklch(0.85_0.18_80)] hover:shadow-[0_12px_50px_oklch(0.78_0.18_80_/_0.5)]',
  mythic:
    'border-[oklch(0.78_0.22_340_/_0.55)] shadow-[0_0_24px_oklch(0.78_0.22_340_/_0.18)] hover:border-[oklch(0.85_0.22_340)] hover:shadow-[0_16px_60px_oklch(0.78_0.22_340_/_0.5)]',
};

const rewardArt =
  'relative h-[100px] sm:h-[130px] flex items-center justify-center text-[40px] sm:text-[56px] bg-[linear-gradient(180deg,var(--panel3),var(--panel))] overflow-hidden';
const rewardArtLegendary =
  "after:content-[''] after:absolute after:top-0 after:left-[-100%] after:w-1/2 after:h-full after:bg-[linear-gradient(90deg,transparent,oklch(0.85_0.18_80_/_0.3),transparent)] after:animate-[marketplace-legend-sweep_4s_linear_infinite]";
const rewardArtGlow =
  'absolute w-[140%] h-[140%] rounded-full bg-[radial-gradient(circle,currentColor_0%,transparent_60%)] opacity-15 blur-[20px] transition-opacity duration-300 group-hover:opacity-40';
const rewardArtRays =
  'absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0deg,currentColor_5deg,transparent_10deg,transparent_60deg,currentColor_65deg,transparent_70deg,transparent_120deg,currentColor_125deg,transparent_130deg,transparent_180deg,currentColor_185deg,transparent_190deg,transparent_240deg,currentColor_245deg,transparent_250deg,transparent_300deg,currentColor_305deg,transparent_310deg,transparent_360deg)] opacity-0 transition-opacity duration-300 animate-[spin_12s_linear_infinite] blur-[8px] group-hover:opacity-25';
const rewardIcon =
  'relative z-[2] [filter:drop-shadow(0_4px_12px_currentColor)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:rotate-[-5deg]';
const rewardIconLocked =
  '[filter:grayscale(0.7)_brightness(0.5)_drop-shadow(0_0_8px_currentColor)]';
const rewardRarityTag =
  'absolute top-[10px] left-[10px] font-[var(--font-title)] text-[9px] font-bold tracking-[0.18em] px-2 py-[3px] rounded-[4px] uppercase bg-black/70 border border-[currentColor] z-[3]';
const rewardStock =
  'absolute top-[10px] right-[10px] font-[var(--font-title)] text-[9px] tracking-[0.1em] text-[oklch(0.85_0.15_22)] bg-[oklch(0.62_0.24_22_/_0.15)] border border-[oklch(0.62_0.24_22_/_0.4)] px-2 py-[3px] rounded-[4px] z-[3]';

const rewardInfo = 'px-[14px] pt-3 pb-[14px] flex flex-col gap-1.5 flex-1';
const rewardInfoLocked = '[&>*]:opacity-60';
const rewardTitle =
  'font-[var(--font-title)] text-[13px] font-semibold tracking-[0.04em] text-[var(--text-hi)]';
const rewardDesc =
  'text-[11px] text-[var(--text-mid)] leading-[1.45] flex-1 overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]';
const rewardBottom =
  'flex items-center justify-between gap-2 mt-2 pt-2.5 border-t border-[var(--border)]';
const rewardPrice = 'flex items-center gap-1.5 font-[var(--font-title)] text-[14px] font-bold';
const rewardPriceByCurrency: Record<MarketRewardCurrency, string> = {
  coins: 'text-[var(--gold)]',
  gems: 'text-[var(--violet)]',
  achievement: 'text-[var(--cyan)] text-[10px] tracking-[0.15em]',
};
const rewardRedeem =
  'font-[var(--font-title)] text-[10px] tracking-[0.12em] font-bold bg-[linear-gradient(135deg,var(--gold-fill-deep),var(--gold-fill))] text-[var(--on-gold-fill)] px-3 py-1.5 rounded-md cursor-pointer uppercase transition-all duration-200 shadow-[0_0_12px_var(--gold-glow)] hover:scale-105 hover:shadow-[0_0_20px_var(--gold-glow)]';
const rewardRedeemCant =
  'bg-[var(--panel3)] text-[var(--text-lo)] shadow-none cursor-not-allowed hover:scale-100 hover:shadow-none';

const rewardSeal =
  'absolute inset-0 z-[4] flex flex-col items-center justify-center bg-[oklch(0.05_0.02_260_/_0.65)] backdrop-blur-[2px] pointer-events-none transition-all duration-300 group-hover:bg-[oklch(0.05_0.02_260_/_0.45)]';
const sealEmblem =
  'w-11 h-11 sm:w-16 sm:h-16 rounded-full bg-[radial-gradient(circle,oklch(0.2_0.05_50),oklch(0.08_0.02_50))] border-2 border-[var(--gold-dim)] flex items-center justify-center text-[18px] sm:text-[28px] relative mb-1.5 sm:mb-3 shadow-[0_0_20px_oklch(0.5_0.12_85_/_0.3),inset_0_0_10px_oklch(0_0_0_/_0.5)] before:content-[\"\"] before:absolute before:inset-[-8px] before:rounded-full before:border before:border-[var(--gold-dim)] before:opacity-40 after:content-[\"\"] after:absolute after:inset-[-16px] after:rounded-full after:border after:border-[var(--gold-dim)] after:opacity-20';
const sealEmblemIcon =
  '[filter:drop-shadow(0_0_8px_oklch(0.7_0.15_85_/_0.6))] text-[16px] sm:text-[26px]';
const sealText =
  'font-[var(--font-title)] text-[8px] sm:text-[9px] font-bold tracking-[0.3em] text-[var(--gold)] uppercase mb-1';
const sealCond =
  'text-[9px] sm:text-[11px] text-[var(--text-hi)] text-center px-3 sm:px-4 font-medium leading-[1.4]';
