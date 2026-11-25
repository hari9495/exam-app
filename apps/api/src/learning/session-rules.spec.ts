import { codeWindow, placeIn, secondsLeft, sessionResult, sixDigits } from './session-rules';

describe('session rules', () => {
  it('a seat while one is free, else the waitlist', () => {
    expect(placeIn(14, 15)).toBe('enrolled');
    expect(placeIn(15, 15)).toBe('waitlisted');
  });

  it('no slot attended is a no-show; below the share is not complete; otherwise complete', () => {
    expect(sessionResult(0, 2, 75)).toEqual({ status: 'no_show', reason: 'Did not attend any slot' });
    expect(sessionResult(1, 2, 75)).toEqual({ status: 'failed', reason: 'Attended 1 of 2 slots; needs 75%' });
    expect(sessionResult(3, 4, 75)).toEqual({ status: 'completed', reason: 'Attended 3 of 4 slots' });
    expect(sessionResult(2, 2, 100)).toMatchObject({ status: 'completed' });
  });

  it('the code window turns every 30 seconds; six digits from the hash', () => {
    expect(codeWindow(60_000)).toBe(2);
    expect(codeWindow(89_999)).toBe(2);
    expect(codeWindow(90_000)).toBe(3);
    expect(secondsLeft(61_000)).toBe(29);
    expect(sixDigits('000000000000')).toBe('000000');
    expect(sixDigits('ffffffffffff')).toMatch(/^\d{6}$/);
  });
});
