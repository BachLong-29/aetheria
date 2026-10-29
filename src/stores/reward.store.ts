import { create } from 'zustand';

import type { ProgressReward } from '@/types';

interface RewardState {
  /** The latest payout the API reported; `id` changes on every one so repeats still fire. */
  event: { id: number; reward: ProgressReward } | null;
  announce: (reward: ProgressReward) => void;
}

export const useRewardStore = create<RewardState>((set) => ({
  event: null,
  announce: (reward) => set((state) => ({ event: { id: (state.event?.id ?? 0) + 1, reward } })),
}));
