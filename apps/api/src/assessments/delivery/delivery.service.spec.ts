import { driveState, invitationState } from './delivery.service';

describe('AS-3 delivery (staff words)', () => {
  const now = new Date('2026-11-16T10:00:00Z');
  const later = new Date('2026-11-20T00:00:00Z');
  const earlier = new Date('2026-11-10T00:00:00Z');

  it('names each invitation', () => {
    expect(invitationState({ status: 'invited', expiresAt: later, attempt: null }, now)).toBe('Invited');
    expect(invitationState({ status: 'invited', expiresAt: later, attempt: { status: 'paused', held: false } }, now)).toBe('Started');
    expect(invitationState({ status: 'invited', expiresAt: earlier, attempt: { status: 'submitted', held: false } }, now)).toBe('Completed');
    expect(invitationState({ status: 'invited', expiresAt: later, attempt: { status: 'submitted', held: true } }, now)).toBe('Under review');
    expect(invitationState({ status: 'reused', expiresAt: later, attempt: null }, now)).toBe('Reused');
  });

  it('negative: expired with no attempt is Missed; a revoked one stays Revoked even after an attempt', () => {
    expect(invitationState({ status: 'invited', expiresAt: earlier, attempt: null }, now)).toBe('Missed');
    expect(invitationState({ status: 'revoked', expiresAt: later, attempt: { status: 'submitted', held: false } }, now)).toBe('Revoked');
  });

  it('a drive is planning without sessions, live during one, closed after all, else open', () => {
    const s = (a: string, b: string) => ({ startsAt: new Date(a), endsAt: new Date(b) });
    expect(driveState([], now)).toBe('Planning');
    expect(driveState([s('2026-11-16T09:00:00Z', '2026-11-16T12:00:00Z')], now)).toBe('Live');
    expect(driveState([s('2026-11-01T09:00:00Z', '2026-11-01T12:00:00Z')], now)).toBe('Closed');
    expect(driveState([s('2026-11-01T09:00:00Z', '2026-11-01T12:00:00Z'), s('2026-11-20T09:00:00Z', '2026-11-20T12:00:00Z')], now)).toBe('Registration open');
  });
});
