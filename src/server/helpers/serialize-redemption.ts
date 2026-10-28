import type { IRedemption } from '@/server/models/redemption.model';
import type { Redemption } from '@/types/reward';

export function serializeRedemption(r: IRedemption): Redemption {
  return {
    id: r._id.toString(),
    rewardId: r.rewardId.toString(),
    name: r.name,
    icon: r.icon,
    color: r.color,
    rarity: r.rarity,
    coinCost: r.coinCost,
    gemCost: r.gemCost,
    usedAt: r.usedAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}
