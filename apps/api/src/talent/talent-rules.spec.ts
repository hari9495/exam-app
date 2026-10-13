import { addMonths, mergeBlock, retentionStep } from './talent-rules';

describe('retentionStep (YX-ATS-53)', () => {
  const last = new Date('2025-01-01T00:00:00Z');
  const base = { lastActivityAt: last, noticeAt: null, onHold: false, hired: false, openProcess: false };
  const day = (d: string) => new Date(`${d}T00:00:00Z`);

  it('does nothing before 30 days ahead of the end, renews once in the window, anonymises at the end', () => {
    expect(retentionStep(base, day('2025-11-30'), 12)).toBeNull();
    expect(retentionStep(base, day('2025-12-05'), 12)).toBe('renewal_sent');
    expect(retentionStep({ ...base, noticeAt: day('2025-12-05') }, day('2025-12-20'), 12)).toBeNull();
    expect(retentionStep({ ...base, noticeAt: day('2025-12-05') }, day('2026-01-01'), 12)).toBe('anonymised');
  });

  it('a hold, a hire or an open process is reported, never acted on (hold first)', () => {
    const due = day('2026-02-01');
    expect(retentionStep({ ...base, onHold: true, hired: true }, due, 12)).toBe('skipped_hold');
    expect(retentionStep({ ...base, hired: true, openProcess: true }, due, 12)).toBe('skipped_hired');
    expect(retentionStep({ ...base, openProcess: true }, due, 12)).toBe('skipped_open');
    expect(retentionStep({ ...base, onHold: true }, day('2025-06-01'), 12)).toBeNull();
  });

  it('a notice from an earlier activity window does not count after new activity', () => {
    const later = day('2025-06-01');
    expect(retentionStep({ ...base, lastActivityAt: later, noticeAt: day('2025-05-20') }, day('2026-05-10'), 12)).toBe('renewal_sent');
    expect(addMonths(day('2025-01-31'), 1).toISOString().slice(0, 10)).toBe('2025-03-03');
  });
});

describe('mergeBlock', () => {
  const ok = { erasedAt: null, mergedIntoId: null, legalHoldAt: null, acceptedOffer: false };
  it('blocks erased, merged, held and hired-by-offer candidates', () => {
    expect(mergeBlock(ok)).toBeNull();
    expect(mergeBlock({ ...ok, legalHoldAt: new Date() })).toMatch(/legal hold/);
    expect(mergeBlock({ ...ok, acceptedOffer: true })).toMatch(/accepted an offer/);
    expect(mergeBlock({ ...ok, mergedIntoId: 'x' })).toMatch(/already merged/);
    expect(mergeBlock({ ...ok, erasedAt: new Date() })).toMatch(/erased/);
  });
});
