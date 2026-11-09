import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const OG_FONT_FAMILY = 'Noto Sans';

interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
}

// One file per script: Satori falls back from one font to the next per glyph, so together they
// cover Latin, Vietnamese and Thai. The default Geist covers neither Thai nor `✓`, and passing
// `fonts` replaces it.
const SUBSETS = ['latin', 'vietnamese', 'thai'] as const;
const WEIGHTS = [400, 700] as const;

let cached: Promise<OgFont[]> | undefined;

/** The card's fonts, read once per server process. */
export function loadOgFonts(): Promise<OgFont[]> {
  cached ??= Promise.all(
    SUBSETS.flatMap((subset) =>
      WEIGHTS.map(async (weight) => ({
        name: OG_FONT_FAMILY,
        data: await readFile(
          join(process.cwd(), 'src/features/share/fonts', `noto-sans-${subset}-${weight}.woff`),
        ),
        weight,
        style: 'normal' as const,
      })),
    ),
  ).catch((error) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
