import { useCallback, useEffect, useRef, useState } from 'react';

import type { OverdueItem } from '@/features/tasks/hooks/useOverdueReview';
import { ESCALATIONS, TASK_PENALTY_KEY } from '../constants';
import type {
  Character,
  PenaltySource,
  PenaltyState,
  PenaltyUnfinishedItem,
  Quest,
} from '../types';
import { useCreateNotification } from './useNotificationActions';
import { useCompletePenalty, useCreatePenalty, useFailPenalty } from './usePenalty';

interface Params {
  quests: Quest[];
  overdueTasks: OverdueItem[];
  applyGamePatch: (updater: (prev: Character) => Character) => void;
}

export function usePenaltyFlow({ quests, overdueTasks, applyGamePatch }: Params) {
  const { mutate: createPenalty } = useCreatePenalty();
  const { mutate: completePenalty } = useCompletePenalty();
  const { mutate: failPenalty } = useFailPenalty();

  const { mutate: createNotification } = useCreateNotification();
  const notifyRef = useRef(createNotification);
  useEffect(() => {
    notifyRef.current = createNotification;
  }, [createNotification]);

  const [penaltyState, setPenaltyState] = useState<PenaltyState | null>(null);
  const [penaltyFailed, setPenaltyFailed] = useState(false);
  const [failedTier, setFailedTier] = useState(1);

  // Snapshot of the tier/source/items that just failed — penaltyState is nulled
  // the moment failure hits, so handleFailureContinue can't read it from there.
  const lastPenaltyRef = useRef<{
    tier: number;
    source: PenaltySource;
    unfinished: PenaltyUnfinishedItem[];
  } | null>(null);

  // Ref for the deferred state transition after failure animation
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
    },
    [],
  );

  // Auto-issue a quest-sourced penalty when the daily rollover finds quests
  // left undone from the previous day — the quest equivalent of the task
  // auto-trigger below, replacing the old manual "End Day" button.
  const issueQuestPenalty = useCallback(
    (items: PenaltyUnfinishedItem[]) => {
      if (penaltyState) return;
      if (items.length === 0) return;
      createPenalty(
        { items, source: 'quest' },
        {
          onSuccess: () => {
            setPenaltyState({ tier: 1, unfinished: items, source: 'quest' });
            notifyRef.current({
              type: 'reminder',
              title: '⚠ Penalty Quest Issued',
              message: `You left ${items.length} quest${items.length > 1 ? 's' : ''} unfinished yesterday. A corrective penalty task has been assigned.`,
            });
          },
        },
      );
    },
    [penaltyState, createPenalty],
  );

  // Auto-issue a task-sourced penalty once per day when tasks were left overdue —
  // the task equivalent of the quest "End Day" trigger, but automatic since
  // overdue tasks are detected on load rather than via a manual button.
  useEffect(() => {
    if (penaltyState) return;
    if (overdueTasks.length === 0) return;
    const today = new Date().toDateString();
    if (localStorage.getItem(TASK_PENALTY_KEY) === today) return;
    localStorage.setItem(TASK_PENALTY_KEY, today);

    const items: PenaltyUnfinishedItem[] = overdueTasks.map((t) => ({ id: t.id, title: t.name }));
    createPenalty(
      { items, source: 'task' },
      {
        onSuccess: () => {
          setPenaltyState({ tier: 1, unfinished: items, source: 'task' });
          notifyRef.current({
            type: 'reminder',
            title: '⚠ Penalty Quest Issued',
            message: `You left ${items.length} task${items.length > 1 ? 's' : ''} overdue. A corrective penalty has been issued.`,
          });
        },
      },
    );
  }, [overdueTasks, penaltyState, createPenalty]);

  const handlePenaltyComplete = useCallback(() => {
    completePenalty();
    setPenaltyState(null);
    notifyRef.current({
      type: 'reward',
      title: '✓ Penalty Quest Complete',
      message: 'You completed the corrective task. Consequences averted. Well done.',
    });
  }, [completePenalty]);

  const handlePenaltyFail = useCallback(() => {
    if (!penaltyState) return;
    const esc = ESCALATIONS[Math.min(penaltyState.tier - 1, ESCALATIONS.length - 1)];
    if (!esc) return;
    applyGamePatch((c) => ({
      ...c,
      stats: c.stats.map((s) => ({ ...s, value: Math.max(0, s.value - esc.statLoss) })),
    }));
    failPenalty();
    lastPenaltyRef.current = {
      tier: penaltyState.tier,
      source: penaltyState.source,
      unfinished: penaltyState.unfinished,
    };
    setPenaltyFailed(true);
    setFailedTier(penaltyState.tier);
    setPenaltyState(null);
    const nextTier = Math.min(penaltyState.tier + 1, 4);
    notifyRef.current({
      type: 'system',
      title: '☠ Penalty Escalated',
      message: `You failed the penalty quest. Consequences applied. ${nextTier <= 4 ? `Tier ${nextTier} now active.` : 'Maximum penalty reached.'}`,
    });
  }, [penaltyState, applyGamePatch, failPenalty]);

  const handleFailureContinue = useCallback(() => {
    const last = lastPenaltyRef.current;
    const tier = last?.tier ?? 1;
    const source = last?.source ?? 'quest';
    const nextTier = Math.min(tier + 1, 4);
    setPenaltyFailed(false);
    if (failTimerRef.current) clearTimeout(failTimerRef.current);
    failTimerRef.current = setTimeout(() => {
      if (source === 'task') {
        const items: PenaltyUnfinishedItem[] = overdueTasks.length
          ? overdueTasks.map((t) => ({ id: t.id, title: t.name }))
          : (last?.unfinished ?? []);
        setPenaltyState({ tier: nextTier, unfinished: items, source });
      } else {
        const unfinished = quests.filter((q) => !q.done);
        setPenaltyState({
          tier: nextTier,
          unfinished: (unfinished.length ? unfinished : quests.slice(0, 1)).map((q) => ({
            id: q.id,
            title: q.title,
            difficulty: q.difficulty,
          })),
          source,
        });
      }
      failTimerRef.current = null;
    }, 400);
  }, [quests, overdueTasks]);

  return {
    penaltyState,
    penaltyFailed,
    failedTier,
    issueQuestPenalty,
    handlePenaltyComplete,
    handlePenaltyFail,
    handleFailureContinue,
  };
}
