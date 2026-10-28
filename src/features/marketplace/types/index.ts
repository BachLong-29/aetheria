export type MarketRewardCategory = 'real' | 'cosmetic' | 'game' | 'booster' | 'quest';
export type MarketRarityFilter = 'all' | MarketRewardRarity;
export type MarketRewardCurrency = 'coins' | 'gems' | 'achievement';
export type MarketRewardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface MarketPlayerState {
  name: string;
  level: number;
  rank: string;
  xp: number;
  xpNext: number;
  coins: number;
  gems: number;
  achievement: number;
  streak: number;
  passLevel: number;
  passMaxLevel: number;
}

export interface MarketReward {
  id: string;
  cat: MarketRewardCategory;
  title: string;
  icon: string;
  rarity: MarketRewardRarity;
  price: number;
  currency: MarketRewardCurrency;
  /** A second price in gems, charged together with `price` (coins). */
  gemsExtra?: number;
  reqLevel: number;
  locked: boolean;
  desc: string;
  stock: number | null;
  lockReason?: string;
}

export interface MarketFeaturedReward {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  price: number;
  currency: MarketRewardCurrency;
  requireLevel: number;
  rarity: MarketRewardRarity;
  lore: string;
  icon: string;
  expiresIn: string;
  discount?: number;
  originalPrice?: number;
}

export interface MarketBattlePassNode {
  lv: number;
  reward: string;
  rarity: MarketRewardRarity;
  icon: string;
  claimed: boolean;
  current?: boolean;
}

export interface MarketRewardDetailCondition {
  label: string;
  met: boolean;
  val: string;
}
