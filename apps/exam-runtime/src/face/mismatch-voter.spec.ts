import { createMismatchVoter, CONSECUTIVE_MISMATCHES_TO_CONFIRM } from './mismatch-voter';

describe('createMismatchVoter', () => {
  it('does not confirm on a single mismatch', () => {
    const voter = createMismatchVoter(3);
    expect(voter.push('mismatch')).toBe(false);
  });

  it('confirms only on the Nth consecutive mismatch', () => {
    const voter = createMismatchVoter(3);
    expect(voter.push('mismatch')).toBe(false);
    expect(voter.push('mismatch')).toBe(false);
    expect(voter.push('mismatch')).toBe(true);
  });

  // The candidate turned back to the camera. That must clear the run, or a mismatch an hour
  // ago could combine with two now to accuse someone.
  it('a match resets the run', () => {
    const voter = createMismatchVoter(3);
    voter.push('mismatch');
    voter.push('mismatch');
    expect(voter.push('match')).toBe(false);
    expect(voter.push('mismatch')).toBe(false);
  });

  // 'uncertain' is the "we do not know" band. It must not count toward an accusation, and it
  // must not preserve a run either -- a run interrupted by ignorance is not a run.
  it('an uncertain verdict resets the run rather than counting toward it', () => {
    const voter = createMismatchVoter(3);
    voter.push('mismatch');
    voter.push('mismatch');
    expect(voter.push('uncertain')).toBe(false);
    expect(voter.push('mismatch')).toBe(false);
  });

  it('does not re-confirm on every subsequent mismatch once it has fired', () => {
    const voter = createMismatchVoter(2);
    voter.push('mismatch');
    expect(voter.push('mismatch')).toBe(true);
    expect(voter.push('mismatch')).toBe(false);
  });

  it('re-arms after a match, so a genuinely new episode can fire again', () => {
    const voter = createMismatchVoter(2);
    voter.push('mismatch');
    expect(voter.push('mismatch')).toBe(true);
    voter.push('match');
    voter.push('mismatch');
    expect(voter.push('mismatch')).toBe(true);
  });

  it('reset() clears both the run and the fired latch', () => {
    const voter = createMismatchVoter(2);
    voter.push('mismatch');
    voter.push('mismatch');
    voter.reset();
    voter.push('mismatch');
    expect(voter.push('mismatch')).toBe(true);
  });

  it('defaults to the shared constant', () => {
    const voter = createMismatchVoter();
    for (let i = 1; i < CONSECUTIVE_MISMATCHES_TO_CONFIRM; i += 1) {
      expect(voter.push('mismatch')).toBe(false);
    }
    expect(voter.push('mismatch')).toBe(true);
  });
});
