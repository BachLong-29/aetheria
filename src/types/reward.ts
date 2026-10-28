export type RewardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type RewardStatus = 'active' | 'inactive' | 'limited' | 'sold_out';
export type RewardColor = 'gold' | 'mint' | 'violet' | 'cyan' | 'rose' | 'amber' | 'blue';

export interface RewardUnlockCondition {
  /** Minimum hero level required to unlock */
  minLevel?: number;
  /** Minimum rank required to unlock (e.g. "Silver", "Gold") */
  minRank?: string;
}

export interface Reward {
  id: string;
  userId: string;
  name: string;
  description?: string;
  icon?: string;
  color: RewardColor;
  rarity: RewardRarity;
  status: RewardStatus;
  /** Cost in coins to redeem */
  coinCost?: number;
  /** Cost in gems to redeem */
  gemCost?: number;
  /** Optional unlock condition */
  unlockCondition?: RewardUnlockCondition;
  /** Available stock (undefined = unlimited) */
  stock?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRewardPayload {
  name: string;
  description?: string;
  icon?: string;
  color: RewardColor;
  rarity: RewardRarity;
  status?: RewardStatus;
  coinCost?: number;
  gemCost?: number;
  unlockCondition?: RewardUnlockCondition;
  stock?: number;
}

export interface UpdateRewardPayload {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: RewardColor;
  rarity?: RewardRarity;
  status?: RewardStatus;
  coinCost?: number | null;
  gemCost?: number | null;
  unlockCondition?: RewardUnlockCondition | null;
  stock?: number | null;
  active?: boolean;
}

export interface RewardListResponse {
  items: Reward[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Redemption {
  id: string;
  rewardId: string;
  name: string;
  icon?: string;
  color: RewardColor;
  rarity: RewardRarity;
  coinCost: number;
  gemCost: number;
  /** ISO time the reward was marked as used; absent = still waiting to be enjoyed. */
  usedAt?: string;
  createdAt: string;
}

export interface RedeemResult {
  redemption: Redemption;
  /** Balances after the purchase, so the client can show them without another round trip. */
  coins: number;
  gems: number;
}
