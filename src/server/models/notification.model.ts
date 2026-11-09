import type { Document } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

export type NotificationType =
  | 'planning'
  | 'monthly-plan'
  | 'reminder'
  | 'system'
  | 'reward'
  | 'deadline'
  | 'overload'
  | 'conflict'
  /** End-of-day nudge to write down cash spending — see cash-log-notifications. */
  | 'cash-log';

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  /**
   * Set when the user dismisses it. The row has to survive, not vanish: the
   * schedule generator upserts on `dedupeKey`, so a deleted row is simply
   * recreated on the next run. A dismissed row still matches, so the upsert
   * finds it and its `$setOnInsert` does nothing.
   */
  dismissedAt?: Date;
  /** Idempotency key for engine-generated notifications (e.g. `overload:2026-06-19`) */
  dedupeKey?: string;
  /** Optional reference to an entity (e.g. task ObjectId as string) */
  entityId?: string;
  /**
   * When it starts showing. A reminder is created in the morning but only appears `lead` minutes
   * before its item; unset means visible as soon as it exists.
   */
  notifyAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'planning',
        'monthly-plan',
        'reminder',
        'system',
        'reward',
        'deadline',
        'overload',
        'conflict',
        'cash-log',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    dismissedAt: {
      type: Date,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    dedupeKey: {
      type: String,
    },
    entityId: {
      type: String,
    },
    notifyAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { sparse: true });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as Record<string, unknown>).Notification;
}

export const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<INotification>) ??
  mongoose.model<INotification>('Notification', notificationSchema);
