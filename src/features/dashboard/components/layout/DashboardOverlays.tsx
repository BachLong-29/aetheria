import { memo } from 'react';

import type { PenaltyState } from '../../types';
import { LevelUpToast } from '../feedback/LevelUpToast';
import { PenaltyFailureModal } from '../penalty/PenaltyFailureModal';
import { PenaltyModal } from '../penalty/PenaltyModal';
import { XPToast } from '../feedback/XPToast';

interface Props {
  toast: { xp: number; coins: number } | null;
  onToastDone: () => void;
  levelUp: { level: number; rank?: string } | null;
  onLevelUpDone: () => void;
  penaltyState: PenaltyState | null;
  penaltyFailed: boolean;
  failedTier: number;
  onPenaltyComplete: () => void;
  onPenaltyFail: () => void;
  onFailureContinue: () => void;
}

/**
 * Group essential modals
 */
export const DashboardOverlays = memo(function DashboardOverlays({
  toast,
  onToastDone,
  levelUp,
  onLevelUpDone,
  penaltyState,
  penaltyFailed,
  failedTier,
  onPenaltyComplete,
  onPenaltyFail,
  onFailureContinue,
}: Props) {
  return (
    <>
      {toast && <XPToast xp={toast.xp} coins={toast.coins} onDone={onToastDone} />}
      {levelUp && <LevelUpToast level={levelUp.level} rank={levelUp.rank} onDone={onLevelUpDone} />}
      {penaltyState && (
        <PenaltyModal
          unfinished={penaltyState.unfinished}
          tier={penaltyState.tier}
          source={penaltyState.source}
          onComplete={onPenaltyComplete}
          onFail={onPenaltyFail}
        />
      )}
      {penaltyFailed && <PenaltyFailureModal tier={failedTier} onContinue={onFailureContinue} />}
    </>
  );
});
