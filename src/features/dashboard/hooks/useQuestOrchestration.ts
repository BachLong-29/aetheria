import { useCallback, useEffect, useRef, useState } from 'react';

import type { Quest } from '../types';

import { useQuests } from './useQuests';

/**
 * The dashboard's local copy of the server quests. It is seeded once, then only grows through
 * `handleAddQuest`; ticking a quest goes through the quest list's own mutations, not this state.
 */
export function useQuestOrchestration() {
  const { data: serverQuests } = useQuests();

  const [quests, setQuests] = useState<Quest[]>([]);
  const questsInitialized = useRef(false);

  useEffect(() => {
    if (serverQuests && !questsInitialized.current) {
      setQuests(serverQuests as Quest[]);
      questsInitialized.current = true;
    }
  }, [serverQuests]);

  const handleAddQuest = useCallback((quest: Quest) => {
    setQuests((prev) => [quest, ...prev]);
  }, []);

  return { quests, handleAddQuest };
}
