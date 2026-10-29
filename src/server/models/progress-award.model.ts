import type { Document } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

export type ProgressAwardKind = 'task' | 'task-log' | 'habit' | 'quest' | 'penalty' | 'goal';

export interface IProgressAward extends Document {
  userId: mongoose.Types.ObjectId;
  kind: ProgressAwardKind;
  /** The thing that was finished (task, habit, quest or penalty id). */
  refId: string;
  /** `YYYY-MM-DD` for things that pay once a day, `once` for things that pay once ever. */
  date: string;
  /** What was actually paid — less than the item is worth once the daily cap bites. */
  xp: number;
  coins: number;
  gems: number;
  /** `YYYY-MM-DD` in the user's timezone, the day the daily cap counts against. */
  day: string;
  createdAt: Date;
}

const progressAwardSchema = new Schema<IProgressAward>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, required: true },
    refId: { type: String, required: true },
    date: { type: String, required: true },
    xp: { type: Number, required: true, default: 0 },
    coins: { type: Number, required: true, default: 0 },
    gems: { type: Number, required: true, default: 0 },
    day: { type: String, required: true, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The unique key is what makes a payout happen once: a second tick hits it and is refused.
progressAwardSchema.index({ userId: 1, kind: 1, refId: 1, date: 1 }, { unique: true });
progressAwardSchema.index({ userId: 1, day: 1 });

// Force re-register in dev to avoid stale schema after hot-reload
if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).ProgressAward;
}

export const ProgressAwardModel =
  (mongoose.models.ProgressAward as mongoose.Model<IProgressAward>) ??
  mongoose.model<IProgressAward>('ProgressAward', progressAwardSchema);
