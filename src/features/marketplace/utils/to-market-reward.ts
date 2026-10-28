import { rankMeets } from '@/constants/reward-rank';
import type { Reward } from '@/types';

import type { MarketReward } from '../types';

/**
 * Shapes a stored reward for the storefront cards. A card shows one price, so coins win
 * and a second gem price rides along in `gemsExtra`. Rank is the only thing that "seals" a
 * card; level, funds and stock are judged live against the player by the card and the modal.
 */
export function toMarketReward(reward: Reward, playerRank: string): MarketReward {
  const coins = reward.coinCost ?? 0;
  const gems = reward.gemCost ?? 0;
  const minRank = reward.unlockCondition?.minRank;
  const sealed = !!minRank && !rankMeets(playerRank, minRank);
  const soldOut = reward.status === 'sold_out';

  return {
    id: reward.id,
    cat: 'real',
    title: reward.name,
    icon: reward.icon ?? '🎁',
    rarity: reward.rarity,
    price: coins > 0 ? coins : gems,
    currency: coins > 0 ? 'coins' : 'gems',
    gemsExtra: coins > 0 && gems > 0 ? gems : undefined,
    reqLevel: reward.unlockCondition?.minLevel ?? 1,
    locked: sealed,
    lockReason: sealed ? `Requires rank ${minRank}` : undefined,
    desc: reward.description ?? '',
    stock: soldOut ? 0 : (reward.stock ?? null),
  };
}
