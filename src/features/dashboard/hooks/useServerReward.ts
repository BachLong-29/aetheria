'use client';

import { useEffect, useRef } from 'react';

import { useRewardStore } from '@/stores/reward.store';
import { useUIStore } from '@/stores/ui.store';
import type { ProgressReward } from '@/types';

interface Handlers {
  /** Something was paid — show the toast with what the server actually paid. */
  onPaid?: (reward: ProgressReward) => void;
  /** The payout took the hero up a level. */
  onLevelUp?: (level: number, promotedRank?: string) => void;
}

/**
 * Reacts to the payouts the API reports (see `awardProgress` there). The numbers on screen are the
 * server's, never a local guess, so a capped or repeated tick can't show a reward that wasn't paid.
 */
export function useServerReward({ onPaid, onLevelUp }: Handlers) {
  const addToast = useUIStore((s) => s.addToast);

  const handlers = useRef({ onPaid, onLevelUp });
  useEffect(() => {
    handlers.current = { onPaid, onLevelUp };
  });

  useEffect(() => {
    // Subscribed rather than selected: only payouts that arrive while mounted should speak.
    return useRewardStore.subscribe((state, previous) => {
      const reward = state.event?.reward;
      if (!reward || state.event === previous.event) return;

      if (reward.capped) {
        addToast({ type: 'info', message: 'Daily XP limit reached — more tomorrow.' });
      }
      if (reward.xp > 0 || reward.coins > 0 || reward.gems > 0) handlers.current.onPaid?.(reward);
      if (reward.leveledUp) handlers.current.onLevelUp?.(reward.level, reward.promotedRank);
    });
  }, [addToast]);
}
