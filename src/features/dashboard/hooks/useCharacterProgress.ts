import { useCallback, useLayoutEffect, useRef } from 'react';

import { RANKS, RANK_LEVEL_THRESHOLDS } from '../constants';
import type { Character } from '../types';

interface ProgressAward {
  xp: number;
  coins: number;
  gems?: number;
}

/** Returns the highest rank the character qualifies for at `level`. */
function resolveRankForLevel(level: number): (typeof RANKS)[number] {
  const sorted = (Object.entries(RANK_LEVEL_THRESHOLDS) as [(typeof RANKS)[number], number][]).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [rank, threshold] of sorted) {
    if (level >= threshold) return rank;
  }
  return 'F';
}

export function useCharacterProgress(
  char: Character,
  setChar: React.Dispatch<React.SetStateAction<Character>>,
  onLevelUp?: (newLevel: number, promotedRank?: string) => void,
) {
  // Always-fresh ref — avoids stale closure without adding char as a callback dep
  const charRef = useRef(char);
  useLayoutEffect(() => {
    charRef.current = char;
  });

  // Use after quest / habit / task completion.
  // Shows the payout at once, level-up and rank promotion included. The server pays the same
  // amount when the completion request lands (see `awardProgress` in the API) and the profile
  // reload that follows replaces this local guess with the stored numbers.
  const awardProgress = useCallback(
    (award: ProgressAward) => {
      const c = charRef.current;
      const newXp = c.xp + award.xp;
      const leveled = newXp >= c.xpNext;

      let newRank = c.rank;
      let promotedRank: string | undefined;

      if (leveled) {
        const newLevel = c.level + 1;
        const qualified = resolveRankForLevel(newLevel);
        const qualIdx = RANKS.indexOf(qualified);
        const curIdx = RANKS.indexOf(c.rank as (typeof RANKS)[number]);
        if (qualIdx > curIdx) {
          newRank = qualified;
          promotedRank = qualified;
        }
      }

      const next: Character = {
        ...c,
        xp: leveled ? newXp - c.xpNext : newXp,
        coins: c.coins + award.coins,
        gems: c.gems + (award.gems ?? 0),
        level: leveled ? c.level + 1 : c.level,
        xpNext: leveled ? Math.round(c.xpNext * 1.3) : c.xpNext,
        rank: newRank,
      };
      setChar(next);

      if (leveled) onLevelUp?.(next.level, promotedRank);
    },
    [setChar, onLevelUp],
  );

  // Use for penalties and other arbitrary char mutations.
  // Local only: the API owns xp, coins, gems, level and rank.
  const applyGamePatch = useCallback(
    (updater: (prev: Character) => Character) => {
      const next = updater(charRef.current);
      setChar(next);
    },
    [setChar],
  );

  return { awardProgress, applyGamePatch };
}
