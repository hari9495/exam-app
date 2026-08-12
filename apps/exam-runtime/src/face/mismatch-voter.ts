import { CONSECUTIVE_MISMATCHES_TO_CONFIRM, type FaceVerdict } from '@exam-platform/shared';

// PROVISIONAL, like the thresholds. Trades detection speed against false accusations: higher
// means a wrongly-classified frame is less likely to accuse anyone, at the cost of noticing a
// real swap later. Stage 3 sets this against the fixture set. Defined in the shared package so
// the browser advisory tier cannot drift from this one -- re-exported here for existing callers.
export { CONSECUTIVE_MISMATCHES_TO_CONFIRM };

export interface MismatchVoter {
  /** Returns true exactly once, on the push that confirms a mismatch episode. */
  push(verdict: FaceVerdict): boolean;
  reset(): void;
}

// Consecutive, not a sliding window. A run broken by a match OR by an uncertain frame is not a
// run: 'uncertain' means we could not tell, and ignorance must never accumulate into an
// accusation. Latches after firing so one episode produces one event, not one per snapshot.
export function createMismatchVoter(consecutive: number = CONSECUTIVE_MISMATCHES_TO_CONFIRM): MismatchVoter {
  let run = 0;
  let fired = false;

  return {
    push(verdict) {
      if (verdict !== 'mismatch') {
        run = 0;
        fired = false;
        return false;
      }
      run += 1;
      if (run >= consecutive && !fired) {
        fired = true;
        return true;
      }
      return false;
    },
    reset() {
      run = 0;
      fired = false;
    },
  };
}
