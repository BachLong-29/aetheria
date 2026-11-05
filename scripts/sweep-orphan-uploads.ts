/**
 * Sweep: delete uploaded images that no record references any more.
 *
 * `POST /upload/attachment` stores every image in Cloudinary under `attachments/`. A file ends up
 * unreferenced when the form is closed before saving, or when it was dropped before
 * `releaseUploads` (src/server/helpers/upload-cleanup.ts) existed. See
 * aetheria-docs/requirements/task-attachments.md.
 *
 * A file is deleted only when it is NOT in the set of images the database still points at (icon
 * or attachment on a task, habit, event, project, wallet, finance category, goal or reward —
 * archived records count, they can be restored) AND it is older than the grace period, so an
 * image whose form is still open is left alone.
 *
 * Refuses to run when the database references no image at all while Cloudinary holds some: that
 * is almost always the wrong database, and applying it would wipe every upload.
 *
 * Usage:
 *   DRY RUN (default):  npx ts-node scripts/sweep-orphan-uploads.ts
 *   APPLY changes:      npx ts-node scripts/sweep-orphan-uploads.ts --apply
 *   Grace period:       --grace-hours=48   (default 24)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';

const PREFIX = 'attachments/';
const DEFAULT_GRACE_HOURS = 24;
const DELETE_BATCH = 100;

/** Collection → the string fields that may hold an uploaded image URL. */
const REFERENCING: Record<string, string[]> = {
  tasks: ['icon', 'attachments'],
  habits: ['icon'],
  events: ['icon'],
  projects: ['icon'],
  wallets: ['icon'],
  financecategories: ['icon'],
  financegoals: ['icon'],
  rewards: ['icon'],
};

/** `attachments/<userId>_<timestamp>` out of a Cloudinary URL, or null for any other string. */
function publicIdOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /\/(attachments\/[^/.?]+)(?:\.\w+)?(?:\?.*)?$/.exec(value);
  return match?.[1] ?? null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const graceArg = process.argv.find((a) => a.startsWith('--grace-hours='));
  const graceHours = graceArg ? Number(graceArg.split('=')[1]) : DEFAULT_GRACE_HOURS;
  if (!Number.isFinite(graceHours) || graceHours < 0) {
    console.error('❌  --grace-hours must be a non-negative number');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI not found in .env.local');
    process.exit(1);
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error('❌  CLOUDINARY_* not found in .env.local');
    process.exit(1);
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  console.warn('🔌  Connecting to MongoDB…');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle');

  // ── What the database still points at ──────────────────────────────────────
  const referenced = new Set<string>();
  for (const [collection, fields] of Object.entries(REFERENCING)) {
    const projection = Object.fromEntries(fields.map((f) => [f, 1]));
    const cursor = db.collection(collection).find({}, { projection });
    for await (const doc of cursor) {
      for (const field of fields) {
        const raw = doc[field] as unknown;
        for (const value of Array.isArray(raw) ? raw : [raw]) {
          const id = publicIdOf(value);
          if (id) referenced.add(id);
        }
      }
    }
  }
  console.warn(`📎  ${referenced.size} image(s) referenced in the database`);

  // ── What Cloudinary holds ──────────────────────────────────────────────────
  const files: Array<{ publicId: string; createdAt: Date }> = [];
  let cursorToken: string | undefined;
  do {
    const page = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'image',
      prefix: PREFIX,
      max_results: 500,
      next_cursor: cursorToken,
    });
    for (const r of page.resources as Array<{ public_id: string; created_at: string }>) {
      files.push({ publicId: r.public_id, createdAt: new Date(r.created_at) });
    }
    cursorToken = page.next_cursor as string | undefined;
  } while (cursorToken);
  console.warn(`☁️   ${files.length} file(s) under ${PREFIX} on Cloudinary`);

  if (referenced.size === 0 && files.length > 0) {
    console.error(
      '❌  The database references no image but Cloudinary holds some — wrong database?',
    );
    process.exit(1);
  }

  // ── Orphans past the grace period ──────────────────────────────────────────
  const cutoff = Date.now() - graceHours * 3_600_000;
  const orphans = files.filter((f) => !referenced.has(f.publicId));
  const stale = orphans.filter((f) => f.createdAt.getTime() < cutoff);
  console.warn(
    `🗑   ${orphans.length} unreferenced, ${stale.length} older than ${graceHours}h` +
      ` (${orphans.length - stale.length} kept for the grace period)\n`,
  );
  for (const f of stale) console.warn(`    ${f.publicId}  ${f.createdAt.toISOString()}`);

  if (!apply) {
    console.warn('\nDRY RUN — nothing deleted. Re-run with --apply to delete the files above.');
  } else {
    let deleted = 0;
    for (let i = 0; i < stale.length; i += DELETE_BATCH) {
      const batch = stale.slice(i, i + DELETE_BATCH).map((f) => f.publicId);
      await cloudinary.api.delete_resources(batch, { resource_type: 'image', type: 'upload' });
      deleted += batch.length;
    }
    console.warn(`\n✅  Deleted ${deleted} file(s)`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌  Sweep failed:', err);
  process.exit(1);
});
