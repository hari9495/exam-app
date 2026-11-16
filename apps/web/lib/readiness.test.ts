import { readinessChecks, type Needs, type Probe } from './readiness';

// AS-4b (PRC-22): the readiness checks decided from what the browser tells and what the test needs.
const ok: Probe = { camera: 'ok', extendedDisplay: false, screenShareSupported: true, inSeb: false, secureContext: true, delayMs: 80, cores: 8 };
const all: Needs = { camera: true, screenShare: true, seb: false, watchesDisplays: true };
const status = (checks: ReturnType<typeof readinessChecks>) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

describe('readinessChecks', () => {
  it('a ready computer passes every check the test needs', () => {
    expect(status(readinessChecks(ok, all))).toEqual({ camera: 'pass', displays: 'pass', screen: 'pass', browser: 'pass', network: 'pass', device: 'pass' });
  });

  it('checks only what this test needs (no camera, no screen share, no displays rule)', () => {
    expect(Object.keys(status(readinessChecks({ ...ok, camera: null }, { camera: false, screenShare: false, seb: false, watchesDisplays: false })))).toEqual(['browser', 'network', 'device']);
  });

  it('negative: a denied camera, a second display, no screen share, no Safe Exam Browser and no server block the start, with fix steps', () => {
    const checks = readinessChecks({ ...ok, camera: 'denied', extendedDisplay: true, screenShareSupported: false, delayMs: null }, { ...all, seb: true });
    const blocking = checks.filter((c) => c.blocking && c.status === 'fail');
    expect(blocking.map((c) => c.id)).toEqual(['camera', 'displays', 'screen', 'browser', 'network']);
    expect(blocking.every((c) => (c.fix ?? []).length > 0)).toBe(true);
  });

  it('negative: a slow network or a slow computer warns but never blocks', () => {
    const checks = readinessChecks({ ...ok, delayMs: 900, cores: 1 }, all);
    expect(status(checks)).toMatchObject({ network: 'warn', device: 'warn' });
    expect(checks.filter((c) => c.status === 'warn').every((c) => !c.blocking)).toBe(true);
  });

  it('a missing camera says so (not "denied")', () => {
    expect(readinessChecks({ ...ok, camera: 'missing' }, all).find((c) => c.id === 'camera')?.detail).toBe('No camera was found.');
  });
});
