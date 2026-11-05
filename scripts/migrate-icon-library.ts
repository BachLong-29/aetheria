/**
 * Migration: fill each user's icon library with the uploaded images they already use.
 *
 * The library used to be filled lazily the first time the icon picker opened. That never ran for
 * accounts whose settings document had been created with `iconLibrary: []` (BUG-032,
 * BachLong-29/aetheria-docs#32), so the route no longer seeds; this does it once instead.
 *
 * For each user whose `iconLibrary` is empty or absent: collect the https image URLs used as the
 * icon of their tasks, habits, events and projects (most recently updated first, at most 30) and
 * store them. A user whose library already has images is left alone. Users with no settings
 * document are skipped: it is created, with its defaults, the first time they load their profile.
 *
 * Reads raw collections, like the other scripts here.
 *
 * Usage:
 *   DRY RUN (default):  npx ts-node scripts/migrate-icon-library.ts
 *   APPLY changes:      npx ts-node scripts/migrate-icon-library.ts --apply
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });
import mongoose from 'mongoose';

/** Keep in step with MAX_LIBRARY in src/app/api/v1/icon-library/route.ts. */
const MAX_LIBRARY = 30;
const SOURCES = ['tasks', 'habits', 'events', 'projects'] as const;
const UPLOADED = /^https?:\/\//i;

interface RawSetting {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  iconLibrary?: string[];
}

interface RawIconOwner {
  userId: mongoose.Types.ObjectId;
  icon?: string;
  updatedAt?: Date;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI not found in .env.local');
    process.exit(1);
  }

  console.warn('🔌  Connecting to MongoDB…');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle');
  console.warn('✅  Connected\n');

  // Every uploaded icon in use, per user.
  const inUse = new Map<string, { url: string; at: number }[]>();
  for (const name of SOURCES) {
    const docs = await db
      .collection<RawIconOwner>(name)
      .find({ icon: UPLOADED }, { projection: { userId: 1, icon: 1, updatedAt: 1 } })
      .toArray();
    for (const doc of docs) {
      const url = (doc.icon ?? '').trim();
      if (!url || !doc.userId) continue;
      const key = doc.userId.toString();
      const list = inUse.get(key) ?? [];
      list.push({ url, at: doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0 });
      inUse.set(key, list);
    }
  }
  console.warn(`📋  ${inUse.size} user(s) have an uploaded image in use\n`);

  const settingsCol = db.collection<RawSetting>('usersettings');
  let toFill = 0;
  let alreadyHave = 0;
  let noSettings = 0;

  for (const [userId, list] of inUse) {
    const setting = await settingsCol.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!setting) {
      noSettings++;
      continue;
    }
    if (setting.iconLibrary && setting.iconLibrary.length > 0) {
      alreadyHave++;
      continue;
    }

    const urls = [...new Set(list.sort((a, b) => b.at - a.at).map((entry) => entry.url))].slice(
      0,
      MAX_LIBRARY,
    );
    toFill++;
    console.warn(`  ＋ user ${userId}: ${urls.length} image(s)`);
    if (apply) {
      await settingsCol.updateOne(
        {
          _id: setting._id,
          $or: [{ iconLibrary: { $exists: false } }, { iconLibrary: { $size: 0 } }],
        },
        { $set: { iconLibrary: urls } },
      );
    }
  }

  console.warn(`\n📊  Summary:`);
  console.warn(`     Libraries to fill      : ${toFill}`);
  console.warn(`     Already have a library : ${alreadyHave}`);
  console.warn(`     No settings document   : ${noSettings}`);

  if (!apply) {
    console.warn('\n🔍  DRY RUN — no changes written. Pass --apply to apply.\n');
  } else {
    console.warn('\n✅  Migration applied.');
  }

  await mongoose.disconnect();
  console.warn('🔌  Disconnected. Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
