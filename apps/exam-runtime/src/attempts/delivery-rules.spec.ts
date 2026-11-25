import { candidateTestStatus, reusable, reuseValidUntil } from './delivery-rules';

describe('AS-3 delivery rules', () => {
  const now = new Date('2026-11-16T10:00:00Z');
  const later = new Date('2026-11-20T00:00:00Z');
  const earlier = new Date('2026-11-10T00:00:00Z');

  it('names each invitation as the candidate sees it', () => {
    expect(candidateTestStatus({ status: 'invited', expiresAt: later, attempt: null }, now)).toBe('invited');
    expect(candidateTestStatus({ status: 'invited', expiresAt: later, attempt: { status: 'in_progress', held: false } }, now)).toBe('started');
    expect(candidateTestStatus({ status: 'invited', expiresAt: earlier, attempt: { status: 'submitted', held: false } }, now)).toBe('completed');
    expect(candidateTestStatus({ status: 'invited', expiresAt: later, attempt: { status: 'submitted', held: true } }, now)).toBe('under_review');
    expect(candidateTestStatus({ status: 'reused', expiresAt: later, attempt: null }, now)).toBe('reused');
  });

  it('negative: an expired invitation with no attempt is missed; a revoked one is withdrawn (even with an attempt)', () => {
    expect(candidateTestStatus({ status: 'invited', expiresAt: earlier, attempt: null }, now)).toBe('missed');
    expect(candidateTestStatus({ status: 'revoked', expiresAt: later, attempt: { status: 'submitted', held: false } }, now)).toBe('withdrawn');
  });

  it('an earlier result is usable within the company months', () => {
    const taken = new Date('2026-06-12T00:00:00Z');
    expect(reuseValidUntil(taken, 6)?.toISOString()).toBe('2026-12-12T00:00:00.000Z');
    expect(reusable({ status: 'submitted', submittedAt: taken, hasResult: true, held: false }, 6, now)).toBe(true);
  });

  it('negative: past the months, off (0), still running, not marked yet or held is never reusable', () => {
    const taken = new Date('2026-04-01T00:00:00Z');
    expect(reusable({ status: 'submitted', submittedAt: taken, hasResult: true, held: false }, 6, now)).toBe(false);
    expect(reusable({ status: 'submitted', submittedAt: now, hasResult: true, held: false }, 0, now)).toBe(false);
    expect(reuseValidUntil(now, 0)).toBeNull();
    expect(reusable({ status: 'in_progress', submittedAt: null, hasResult: false, held: false }, 6, now)).toBe(false);
    expect(reusable({ status: 'submitted', submittedAt: earlier, hasResult: false, held: false }, 6, now)).toBe(false);
    expect(reusable({ status: 'submitted', submittedAt: earlier, hasResult: true, held: true }, 6, now)).toBe(false);
  });
});
