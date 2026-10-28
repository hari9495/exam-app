import { MAX_PUNCH_AGE_MS, MAX_PUNCH_AHEAD_MS, OFFLINE_AFTER_MS, PHONE_INACTIVE_AFTER_MS, PIN_LOCK_MS, STALE_AFTER_MS, afterWrongPin, kioskHealth, newDeviceToken, newSetupCode, normalSetupCode, phoneInactive, pinLocked, pinProblem, punchTimeProblem, tokenOrg } from './device-rules';

const NOW = new Date('2026-10-29T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('kiosk health (TIM-14: stale after 15 min, offline after an hour)', () => {
  it('not set up until the set-up code is used', () => expect(kioskHealth({ setUp: false, lastSeenAt: NOW }, NOW)).toBe('not_set_up'));
  it('set up but never heard from is offline', () => expect(kioskHealth({ setUp: true, lastSeenAt: null }, NOW)).toBe('offline'));
  it.each([
    [0, 'online'],
    [STALE_AFTER_MS - 1, 'online'],
    [STALE_AFTER_MS, 'stale'],
    [OFFLINE_AFTER_MS - 1, 'stale'],
    [OFFLINE_AFTER_MS, 'offline'],
  ])('%i ms since last seen is %s', (ms, health) => expect(kioskHealth({ setUp: true, lastSeenAt: ago(ms) }, NOW)).toBe(health));
});

describe('phone inactive after 30 days', () => {
  it('29 days is active, 30 days is inactive', () => {
    expect(phoneInactive(ago(PHONE_INACTIVE_AFTER_MS - 1), ago(400 * 86_400_000), NOW)).toBe(false);
    expect(phoneInactive(ago(PHONE_INACTIVE_AFTER_MS), ago(400 * 86_400_000), NOW)).toBe(true);
  });
  it('a phone never seen counts from its approval', () => expect(phoneInactive(null, ago(86_400_000), NOW)).toBe(false));
});

describe('device punch time window (72 h back, 2 min ahead)', () => {
  it.each([
    [0, null],
    [MAX_PUNCH_AGE_MS, null],
    [MAX_PUNCH_AGE_MS + 1, /more than 72 hours old/],
    [-MAX_PUNCH_AHEAD_MS, null],
    [-MAX_PUNCH_AHEAD_MS - 1, /in the future/],
  ])('%i ms ago', (ms, want) => {
    const got = punchTimeProblem(ago(ms as number), NOW);
    if (want === null) expect(got).toBeNull();
    else expect(got).toMatch(want as RegExp);
  });
  it('an invalid time is refused', () => expect(punchTimeProblem(new Date('nope'), NOW)).toMatch(/not a valid time/));
});

describe('PIN lock maths (kiosk.pin_tries, then 15 minutes)', () => {
  it('counts wrong tries up to the limit, then locks and starts again', () => {
    expect(afterWrongPin(0, 5, NOW)).toEqual({ failed: 1, lockedUntil: null });
    expect(afterWrongPin(3, 5, NOW)).toEqual({ failed: 4, lockedUntil: null });
    expect(afterWrongPin(4, 5, NOW)).toEqual({ failed: 0, lockedUntil: new Date(NOW.getTime() + PIN_LOCK_MS) });
    expect(afterWrongPin(2, 3, NOW).lockedUntil).not.toBeNull();
  });
  it('locked until the end of the 15 minutes, open at the end', () => {
    const until = new Date(NOW.getTime() + PIN_LOCK_MS);
    expect(pinLocked(until, new Date(until.getTime() - 1))).toBe(true);
    expect(pinLocked(until, until)).toBe(false);
    expect(pinLocked(null, NOW)).toBe(false);
  });
  it('PINs are 4 digits, not one digit four times, not a straight run', () => {
    expect(pinProblem('4071')).toBeNull();
    expect(pinProblem('1357')).toBeNull();
    expect(pinProblem('123')).toMatch(/4 digits/);
    expect(pinProblem('12a4')).toMatch(/4 digits/);
    expect(pinProblem('7777')).toMatch(/one digit/);
    expect(pinProblem('1234')).toMatch(/run/);
    expect(pinProblem('9876')).toMatch(/run/);
  });
});

describe('set-up codes and device tokens', () => {
  it('a set-up code is 12 unambiguous characters in three groups, typed back in any form', () => {
    const c = newSetupCode();
    expect(c).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(normalSetupCode(` ${c.toLowerCase().replace(/-/g, ' ')} `)).toBe(c.replace(/-/g, ''));
  });
  it('a device token carries its company id and 32 random bytes; anything else has no company', () => {
    const org = '3f2b8c1e-1d2a-4c4b-9f1e-2a3b4c5d6e7f';
    const t = newDeviceToken(org);
    expect(tokenOrg(t)).toBe(org);
    expect(newDeviceToken(org)).not.toBe(t);
    expect(tokenOrg(`${org}.short`)).toBeNull();
    expect(tokenOrg(`not-a-uuid.${t.split('.')[1]}`)).toBeNull();
    expect(tokenOrg(`${t}.extra`)).toBeNull();
    expect(tokenOrg('')).toBeNull();
  });
});
