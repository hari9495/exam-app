import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type BlinkState = 'waiting_open' | 'waiting_close' | 'satisfied';

export interface BlinkChallenge {
  push(result: FaceLandmarkerResult): BlinkState;
  reset(): void;
}

const CLOSED_THRESHOLD = 0.5;
const OPEN_THRESHOLD = 0.2;

function blinkScore(result: FaceLandmarkerResult): number | null {
  const categories = result?.faceBlendshapes?.[0]?.categories;
  if (!categories) return null;
  const scores = categories
    .filter((category) => category.categoryName === 'eyeBlinkLeft' || category.categoryName === 'eyeBlinkRight')
    .map((category) => category.score);
  if (scores.length === 0) return null;
  // Both eyes: take the lower score so one eye's tracking noise cannot fake a blink.
  return Math.min(...scores);
}

// A deliberate open -> closed -> open sequence. Requiring the OPEN state FIRST is what stops a
// frame that happens to start mid-blink from registering a blink it never saw begin -- without it,
// a candidate who is already blinking when the challenge starts would pass on a half-observation.
export function createBlinkChallenge(): BlinkChallenge {
  let state: BlinkState = 'waiting_open';
  let sawClosed = false;

  return {
    push(result) {
      if (state === 'satisfied') return state;
      const score = blinkScore(result);
      // No face in this frame: hold position rather than losing progress.
      if (score === null) return state;

      if (state === 'waiting_open' && score < OPEN_THRESHOLD) {
        state = 'waiting_close';
        return state;
      }
      if (state === 'waiting_close' && score > CLOSED_THRESHOLD) {
        sawClosed = true;
        return state;
      }
      if (state === 'waiting_close' && sawClosed && score < OPEN_THRESHOLD) {
        state = 'satisfied';
      }
      return state;
    },
    reset() {
      state = 'waiting_open';
      sawClosed = false;
    },
  };
}
