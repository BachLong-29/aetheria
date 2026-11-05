import type mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

import { EventModel } from '@/server/models/event.model';
import { FinanceCategoryModel } from '@/server/models/finance-category.model';
import { FinanceGoalModel } from '@/server/models/finance-goal.model';
import { HabitModel } from '@/server/models/habit.model';
import { ProjectModel } from '@/server/models/project.model';
import { RewardModel } from '@/server/models/reward.model';
import { TaskModel } from '@/server/models/task.model';
import { WalletModel } from '@/server/models/wallet.model';

type IdLike = mongoose.Types.ObjectId | string;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * The Cloudinary public id of an image `POST /upload/attachment` stored for this user —
 * `attachments/<userId>_<timestamp>` — or null for anything else. Attachment URLs are free-form
 * strings in the API, so this is also what stops a crafted URL from deleting someone else's file.
 */
function ownUploadPublicId(userId: IdLike, url: string | undefined | null): string | null {
  if (!url) return null;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) return null;
  const match = new RegExp(
    `^https://res\\.cloudinary\\.com/${cloud}/image/upload/(?:v\\d+/)?(attachments/${userId}_\\d+)(?:\\.\\w+)?$`,
  ).exec(url);
  return match?.[1] ?? null;
}

/** True when any of the user's records still points at this image, as an icon or an attachment. */
async function stillReferenced(userId: IdLike, url: string): Promise<boolean> {
  const byIcon = { userId, icon: url };
  const hits = await Promise.all([
    TaskModel.exists({ userId, $or: [{ icon: url }, { attachments: url }] }),
    HabitModel.exists(byIcon),
    EventModel.exists(byIcon),
    ProjectModel.exists(byIcon),
    WalletModel.exists(byIcon),
    FinanceCategoryModel.exists(byIcon),
    FinanceGoalModel.exists(byIcon),
    RewardModel.exists(byIcon),
  ]);
  return hits.some(Boolean);
}

/**
 * Delete the uploads behind `urls` from Cloudinary once nothing references them any more.
 *
 * Call it after the write that dropped them. It is best-effort: a failure leaves an orphaned file,
 * which is no worse than before, so it never fails the request that triggered it.
 */
export async function releaseUploads(
  userId: IdLike,
  urls: Array<string | undefined | null>,
): Promise<void> {
  const unique = [...new Set(urls)].filter((u): u is string => !!u);
  await Promise.all(
    unique.map(async (url) => {
      try {
        const publicId = ownUploadPublicId(userId, url);
        if (!publicId || (await stillReferenced(userId, url))) return;
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      } catch {
        // Leave the file; see above.
      }
    }),
  );
}
