import { useCallback, useLayoutEffect, useRef } from 'react';

import type { Character } from '../types';

/**
 * Local-only changes to the hero panel (a penalty's stat loss). The API owns xp, coins, gems,
 * level and rank: it pays when something is finished and the panel follows the profile reload.
 */
export function useCharacterProgress(
  char: Character,
  setChar: React.Dispatch<React.SetStateAction<Character>>,
) {
  // Always-fresh ref — avoids stale closure without adding char as a callback dep
  const charRef = useRef(char);
  useLayoutEffect(() => {
    charRef.current = char;
  });

  const applyGamePatch = useCallback(
    (updater: (prev: Character) => Character) => {
      setChar(updater(charRef.current));
    },
    [setChar],
  );

  return { applyGamePatch };
}
