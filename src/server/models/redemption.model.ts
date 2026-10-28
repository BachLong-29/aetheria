import type { Document } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

import type { RewardColor, RewardRarity } from '@/types/reward';

export interface IRedemption extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  rewardId: mongoose.Types.ObjectId;
  /** Copied from the reward at redeem time, so the history survives the reward being edited or deleted. */
  name: string;
  icon?: string;
  color: RewardColor;
  rarity: RewardRarity;
  coinCost: number;
  gemCost: number;
  /** Set once the user has actually enjoyed the reward. */
  usedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const redemptionSchema = new Schema<IRedemption>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rewardId: { type: Schema.Types.ObjectId, ref: 'Reward', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    icon: { type: String, trim: true, maxlength: 10 },
    color: { type: String, required: true, default: 'gold' },
    rarity: { type: String, required: true, default: 'common' },
    coinCost: { type: Number, required: true, default: 0, min: 0 },
    gemCost: { type: Number, required: true, default: 0, min: 0 },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

export const RedemptionModel =
  (mongoose.models.Redemption as mongoose.Model<IRedemption>) ??
  mongoose.model<IRedemption>('Redemption', redemptionSchema);
