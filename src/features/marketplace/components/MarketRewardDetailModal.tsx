'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/libs/utils';

import { RARITY_COLOR, RARITY_LABEL, CURRENCY_ICON, MARKET_CATEGORY_LABELS } from '../constants';
import type { MarketPlayerState, MarketReward, MarketRewardDetailCondition } from '../types';

interface MarketRewardDetailModalProps {
  reward: MarketReward;
  player: MarketPlayerState;
  onClose: () => void;
  onRedeem: (reward: MarketReward) => void;
}

export function MarketRewardDetailModal({
  reward,
  player,
  onClose,
  onRedeem,
}: MarketRewardDetailModalProps) {
  const tMarket = useTranslations('marketplace');
  const hasCurrency =
    (reward.currency === 'achievement' ? true : player[reward.currency] >= reward.price) &&
    player.gems >= (reward.gemsExtra ?? 0);
  const hasLevel = player.level >= reward.reqLevel;
  const hasStock = reward.stock == null || reward.stock > 0;
  const canRedeem = !reward.locked && hasCurrency && hasLevel && hasStock;

  const conditions: MarketRewardDetailCondition[] = [
    {
      label: `Reach Level ${reward.reqLevel}`,
      met: hasLevel,
      val: `Lv.${player.level} / ${reward.reqLevel}`,
    },
  ];

  if (reward.currency !== 'achievement' && reward.price > 0) {
    conditions.push({
      label: `${reward.price.toLocaleString()} ${CURRENCY_ICON[reward.currency]} ${reward.currency}`,
      met: hasCurrency,
      val: `${player[reward.currency].toLocaleString()} owned`,
    });
  }

  if (reward.gemsExtra) {
    conditions.push({
      label: `${reward.gemsExtra.toLocaleString()} ${CURRENCY_ICON.gems} gems`,
      met: player.gems >= reward.gemsExtra,
      val: `${player.gems.toLocaleString()} owned`,
    });
  }

  if (reward.locked && reward.lockReason) {
    conditions.push({ label: reward.lockReason, met: false, val: 'Sealed' });
  }

  if (reward.stock != null) {
    conditions.push({
      label: 'Stock available',
      met: reward.stock > 0,
      val: `${reward.stock} remaining`,
    });
  }

  const lore = reward.locked
    ? 'The seal is unbroken. Whispers from the realm say its power awakens only for the dedicated.'
    : `Forged in the ${reward.rarity === 'mythic' ? 'Eclipse Forge' : reward.rarity === 'legendary' ? 'Sun Temple' : 'Aetheric Vault'}. Carries the resonance of countless completed quests.`;

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth="540px"
      scrollable
      closeButton
      className="!border-[1.5px] !border-[currentColor] !rounded-[16px] animate-[marketplace-detail-in_0.4s_cubic-bezier(0.34,1.56,0.64,1)]"
      containerStyle={{
        color: RARITY_COLOR[reward.rarity],
        background: 'linear-gradient(180deg,var(--panel),var(--bg-2))',
        boxShadow: `0 0 60px ${RARITY_COLOR[reward.rarity]}, 0 24px 80px oklch(0 0 0 / 0.6)`,
      }}
    >
      <div style={{ color: RARITY_COLOR[reward.rarity] }}>
        <Button
          type="button"
          variant="ghost"
          className={detailClose}
          aria-label={tMarket('buttons.close')}
          title={tMarket('buttons.close')}
          onClick={onClose}
        >
          ✕
        </Button>

        <div className={detailArt}>
          <div className={detailArtRune} />
          <div className={cn(detailArtRune, detailArtRune2)} />
          <span className={detailRarityBanner}>◆ {RARITY_LABEL[reward.rarity]} ◆</span>
          <span className={detailArtIcon}>{reward.icon}</span>
        </div>

        <div className={detailBody}>
          <div className={detailCat}>{MARKET_CATEGORY_LABELS[reward.cat] || reward.cat}</div>
          <div className={detailTitle}>{reward.title}</div>
          <div className={detailDesc}>{reward.desc}</div>
          <div className={detailLore}>&quot;{lore}&quot;</div>

          <div className={detailConditions}>
            {conditions.map((c, i) => (
              <div
                key={i}
                className={cn(detailCondRow, c.met ? detailCondRowMet : detailCondRowUnmet)}
              >
                <span
                  className={cn(detailCondIcon, c.met ? detailCondIconMet : detailCondIconUnmet)}
                >
                  {c.met ? '✓' : '!'}
                </span>
                <span className={detailCondLabel}>{c.label}</span>
                <span className={detailCondVal}>{c.val}</span>
              </div>
            ))}
          </div>

          <div className={detailActions}>
            <Button
              type="button"
              variant="ghost"
              className={cn(detailBtn, detailBtnSecondary)}
              onClick={onClose}
            >
              {tMarket('buttons.cancel')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn(detailBtn, detailBtnPrimary)}
              disabled={!canRedeem}
              onClick={() => onRedeem(reward)}
            >
              {reward.locked
                ? `🔒 ${tMarket('buttons.sealed')}`
                : !hasLevel
                  ? tMarket('buttons.needHigherLevel')
                  : !hasCurrency
                    ? tMarket('buttons.insufficientFunds')
                    : !hasStock
                      ? tMarket('buttons.outOfStock')
                      : `✦ ${tMarket('buttons.redeemNow')} ✦`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const detailClose =
  'absolute top-[14px] right-[14px] w-8 h-8 bg-black/50 border border-[var(--border)] rounded-full text-[var(--text-mid)] cursor-pointer text-[16px] z-[5] flex items-center justify-center transition-all duration-200 hover:text-[var(--text-hi)] hover:border-[var(--text-hi)]';

const detailArt =
  'relative h-[220px] flex items-center justify-center bg-[radial-gradient(circle_at_center,currentColor,transparent_55%),linear-gradient(180deg,var(--panel3),var(--panel))] overflow-hidden border-b border-[currentColor]';
const detailArtIcon =
  'text-[110px] relative z-[2] [filter:drop-shadow(0_8px_24px_currentColor)] animate-[marketplace-featured-float_3.5s_ease-in-out_infinite]';
const detailArtRune =
  'absolute w-[240px] h-[240px] border border-dashed border-[currentColor] rounded-full opacity-30 animate-[spin_16s_linear_infinite]';
const detailArtRune2 =
  'w-[300px] h-[300px] opacity-[0.18] animate-[marketplace-spin-rev_24s_linear_infinite]';
const detailRarityBanner =
  'absolute top-[14px] left-[14px] font-[var(--font-title)] text-[10px] tracking-[0.3em] font-bold px-3 py-1 bg-black/75 border border-[currentColor] rounded-[4px] uppercase';

const detailBody = 'px-[26px] pt-5 pb-[22px]';
const detailCat =
  'font-[var(--font-title)] text-[10px] tracking-[0.25em] text-[var(--text-mid)] uppercase mb-1';
const detailTitle =
  'font-[var(--font-title)] text-[26px] font-bold tracking-[0.04em] text-[var(--text-hi)] mb-2.5';
const detailDesc = 'text-[13px] text-[var(--text-mid)] leading-[1.6] mb-3.5';
const detailLore =
  'text-[11px] italic text-[oklch(0.75_0.08_60)] leading-[1.5] px-[14px] py-3 bg-black/30 border-l-2 border-[currentColor] rounded-r-[4px] mb-[18px]';

const detailConditions = 'flex flex-col gap-2 mb-[18px]';
const detailCondRow =
  'flex items-center gap-2.5 px-3 py-2 bg-[var(--panel2)] border border-[var(--border)] rounded-lg';
const detailCondRowMet = 'border-[oklch(0.6_0.18_145_/_0.4)]';
const detailCondRowUnmet = 'border-[oklch(0.62_0.24_22_/_0.4)]';
const detailCondIcon =
  'w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0';
const detailCondIconMet = 'bg-[oklch(0.6_0.18_145)] text-white';
const detailCondIconUnmet = 'bg-[oklch(0.62_0.24_22)] text-white';
const detailCondLabel = 'flex-1 text-[12px] text-[var(--text-hi)]';
const detailCondVal =
  'font-[var(--font-title)] text-[11px] font-bold tracking-[0.05em] text-[var(--text-mid)]';

const detailActions = 'flex gap-2.5';
const detailBtn =
  'flex-1 font-[var(--font-title)] text-[12px] tracking-[0.15em] font-bold p-[14px] rounded-lg border cursor-pointer uppercase transition-all duration-200';
const detailBtnPrimary =
  'bg-[linear-gradient(135deg,var(--gold-fill-deep),var(--gold-fill))] border-[var(--gold-fill)] text-[var(--on-gold-fill)] shadow-[0_0_20px_var(--gold-glow)] hover:-translate-y-0.5 hover:shadow-[0_0_30px_var(--gold-glow)] disabled:bg-[var(--panel3)] disabled:border-[var(--border)] disabled:text-[var(--text-lo)] disabled:shadow-none disabled:cursor-not-allowed disabled:translate-y-0';
const detailBtnSecondary =
  'bg-[var(--panel2)] border-[var(--border)] text-[var(--text-mid)] hover:text-[var(--text-hi)] hover:border-[var(--text-hi)]';
