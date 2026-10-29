import type { Document } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

export interface IHeroStats {
  discipline: number;
  wisdom: number;
  endurance: number;
  composition: number;
  serenity: number;
}

export interface IUserProfile extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  heroName: string;
  title: string;
  handle: string;
  pronouns: string;
  region: string;
  sigil: string;
  motto: string;
  classId: string;
  companionId: string;
  accent: string;
  stats: IHeroStats;
  statPool: number;
  primaryFocus: string[];
  badges: string[];
  joined: string;
  // game mechanics
  level: number;
  xp: number;
  xpNext: number;
  streak: number;
  /** `YYYY-MM-DD` (user's timezone) of the last day something was finished; drives `streak`. */
  lastActiveDay?: string;
  coins: number;
  gems: number;
  rank: string;
  createdAt: Date;
  updatedAt: Date;
}

const heroStatsSchema = new Schema<IHeroStats>(
  {
    discipline: { type: Number, default: 6, min: 1, max: 10 },
    wisdom: { type: Number, default: 6, min: 1, max: 10 },
    endurance: { type: Number, default: 5, min: 1, max: 10 },
    composition: { type: Number, default: 7, min: 1, max: 10 },
    serenity: { type: Number, default: 6, min: 1, max: 10 },
  },
  { _id: false },
);

const userProfileSchema = new Schema<IUserProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    heroName: { type: String, default: '', maxlength: 40, trim: true },
    title: { type: String, default: '', maxlength: 60, trim: true },
    handle: { type: String, default: '', maxlength: 24, trim: true },
    pronouns: { type: String, default: 'they / them', maxlength: 24, trim: true },
    region: { type: String, default: '', maxlength: 40, trim: true },
    sigil: { type: String, default: '✦', maxlength: 2, trim: true },
    motto: { type: String, default: '', maxlength: 120, trim: true },
    classId: { type: String, default: 'scribe', trim: true },
    companionId: { type: String, default: 'fox', trim: true },
    accent: { type: String, default: 'amber', trim: true },
    stats: { type: heroStatsSchema, default: () => ({}) },
    statPool: { type: Number, default: 30, min: 10, max: 50 },
    primaryFocus: { type: [String], default: [] },
    badges: { type: [String], default: [] },
    joined: { type: String, default: '' },
    level: { type: Number, default: 1, min: 1 },
    xp: { type: Number, default: 0, min: 0 },
    xpNext: { type: Number, default: 1000, min: 1 },
    streak: { type: Number, default: 0, min: 0 },
    lastActiveDay: { type: String, trim: true },
    coins: { type: Number, default: 0, min: 0 },
    gems: { type: Number, default: 0, min: 0 },
    rank: { type: String, default: 'E', trim: true },
  },
  { timestamps: true },
);

export const UserProfileModel =
  (mongoose.models.UserProfile as mongoose.Model<IUserProfile>) ??
  mongoose.model<IUserProfile>('UserProfile', userProfileSchema);
