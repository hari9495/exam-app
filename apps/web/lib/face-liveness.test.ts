import { createBlinkChallenge } from './face-liveness';

// MediaPipe emits eyeBlinkLeft/eyeBlinkRight blendshape scores in 0..1; high means closed.
function frame(blink: number) {
  return {
    faceBlendshapes: [
      { categories: [
        { categoryName: 'eyeBlinkLeft', score: blink },
        { categoryName: 'eyeBlinkRight', score: blink },
      ] },
    ],
  } as never;
}

describe('createBlinkChallenge', () => {
  it('is not satisfied by open eyes alone — a photo would pass that', () => {
    const challenge = createBlinkChallenge();
    for (let i = 0; i < 20; i += 1) expect(challenge.push(frame(0.02))).not.toBe('satisfied');
  });

  it('is satisfied only by open → closed → open', () => {
    const challenge = createBlinkChallenge();
    expect(challenge.push(frame(0.02))).toBe('waiting_close');
    // Still 'waiting_close': the state names what the machine is waiting to observe next, and
    // after a closure it is waiting for the eyes to reopen to complete the same blink.
    expect(challenge.push(frame(0.8))).toBe('waiting_close');
    expect(challenge.push(frame(0.02))).toBe('satisfied');
  });

  // A frame that starts mid-blink must not count the first opening as a completed blink.
  it('requires eyes open FIRST, so starting closed does not shortcut it', () => {
    const challenge = createBlinkChallenge();
    expect(challenge.push(frame(0.9))).toBe('waiting_open');
    expect(challenge.push(frame(0.02))).toBe('waiting_close');
    expect(challenge.push(frame(0.02))).toBe('waiting_close');
  });

  it('ignores frames with no face rather than losing progress', () => {
    const challenge = createBlinkChallenge();
    challenge.push(frame(0.02));
    expect(challenge.push({ faceBlendshapes: [] } as never)).toBe('waiting_close');
  });

  it('stays satisfied once satisfied, so a later frame cannot un-verify it', () => {
    const challenge = createBlinkChallenge();
    challenge.push(frame(0.02));
    challenge.push(frame(0.8));
    expect(challenge.push(frame(0.02))).toBe('satisfied');
    expect(challenge.push(frame(0.8))).toBe('satisfied');
  });

  it('reset() starts a fresh challenge for a retry', () => {
    const challenge = createBlinkChallenge();
    challenge.push(frame(0.02));
    challenge.push(frame(0.8));
    challenge.push(frame(0.02));
    challenge.reset();
    expect(challenge.push(frame(0.02))).toBe('waiting_close');
  });
});
