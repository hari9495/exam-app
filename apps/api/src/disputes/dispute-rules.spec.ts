import { addDays, clocks, conciliationStart, disputeNumber, fold, late, nextMeeting, stage, type Step } from './dispute-rules';

// HLP-13 rules with boundary values. The day counts stand in for the IN.IR.DISPUTE rule set row.
let n = 0;
const st = (kind: string, actor: string, data: Record<string, unknown>, at = new Date(Date.UTC(2026, 9, 1, 0, n))): Step => ({ id: `s${++n}`, kind, actorUserId: actor, data, at: new Date(at.getTime() + n * 1000) });
const RULES = { report: 60, copy: 10 };
const TERMS = { kind: 'conciliation', signedOn: '2026-10-15', effectiveFrom: '2026-04-01', covered: 'All plant workers', terms: 'Basic +11 %', rates: [{ category: 'skilled', monthlyIncrease: '1500' }], paperId: 'f1' };

describe('HLP-13 dispute rules', () => {
  it('numbers and dates (month end, leap year)', () => {
    expect(disputeNumber(2)).toBe('IRD-0002');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('demands keep their latest status; agreed text only while agreed; an update of an unknown demand is ignored', () => {
    const d = st('demand', 'u1', { code: 'D1', text: 'Basic +18 %', union: '18 %', mgmt: '9 %' });
    const f = fold([d, st('demand_update', 'u1', { demandId: d.id, status: 'agreed', agreed: '11 %', mgmt: '11 %' }), st('demand_update', 'u1', { demandId: 'nope', status: 'withdrawn' })]);
    expect(f.demands).toEqual([expect.objectContaining({ code: 'D1', status: 'agreed', agreed: '11 %', mgmt: '11 %' })]);
    const g = fold([d, st('demand_update', 'u1', { demandId: d.id, status: 'agreed', agreed: '11 %' }), st('demand_update', 'u1', { demandId: d.id, status: 'open' })]);
    expect(g.demands[0]).toMatchObject({ status: 'open', agreed: null });
  });

  it('stages: charter, bipartite, conciliation, settlement to approve, sent back, settled, filed, closed', () => {
    expect(stage(fold([]))).toBe('Charter received');
    const bi = st('meeting', 'u1', { kind: 'bipartite', on: '2026-06-30', attended: 'x', minutes: 'y' });
    expect(stage(fold([bi]))).toBe('Bipartite talks');
    const co = st('meeting', 'u1', { kind: 'conciliation', on: '2026-08-04', officer: 'ALC', attended: 'x', minutes: 'y', nextOn: '2026-08-18' });
    expect(stage(fold([bi, co]))).toBe('Conciliation');
    const p = st('settlement_proposed', 'u1', TERMS);
    expect(stage(fold([bi, co, p]))).toBe('Settlement to approve');
    const back = fold([bi, co, p, st('settlement_sent_back', 'u2', { proposalId: p.id, reason: 'Wrong date' })]);
    expect(stage(back)).toBe('Conciliation');
    expect(back.settlement).toMatchObject({ status: 'none', sentBack: { reason: 'Wrong date', by: 'u2' } });
    const ok = [bi, co, p, st('settlement_approved', 'u2', { proposalId: p.id, proposedBy: 'u1', wageSettlementId: 'w1' })];
    expect(fold(ok).settlement).toMatchObject({ status: 'approved', proposedBy: 'u1', approvedBy: 'u2', wageSettlementId: 'w1' });
    expect(stage(fold(ok))).toBe('Settled, file the copy');
    expect(stage(fold([...ok, st('filed', 'u1', { on: '2026-10-20' })]))).toBe('Settled, copy filed');
    expect(stage(fold([bi, st('closed', 'u1', { how: 'withdrawn', note: 'Union withdrew' })]))).toBe('Closed (withdrawn)');
  });

  it('next meeting: the date fixed at the last meeting until a meeting is held on or after it', () => {
    const a = st('meeting', 'u1', { kind: 'conciliation', on: '2026-08-04', officer: 'ALC', attended: 'x', minutes: 'y', nextOn: '2026-08-18' });
    expect(nextMeeting(fold([a]))).toEqual({ on: '2026-08-18', kind: 'conciliation' });
    expect(nextMeeting(fold([a, st('meeting', 'u1', { kind: 'conciliation', on: '2026-08-18', officer: 'ALC', attended: 'x', minutes: 'y' })]))).toBeNull();
    expect(conciliationStart(fold([a]))).toBe('2026-08-04');
  });

  it('clocks: report from the first conciliation meeting, copy from signing; the day itself is not late, the day after is', () => {
    const co = st('meeting', 'u1', { kind: 'conciliation', on: '2026-08-04', officer: 'ALC', attended: 'x', minutes: 'y', nextOn: '2026-08-18' });
    const k = clocks(fold([co]), RULES);
    expect(k).toEqual([
      { key: 'next', label: 'Next conciliation meeting', due: '2026-08-18', doneOn: null },
      { key: 'report', label: 'Conciliation officer’s report', due: '2026-10-03', doneOn: null },
    ]);
    expect(late(k[1], '2026-10-03')).toBe(false);
    expect(late(k[1], '2026-10-04')).toBe(true);
    const p = st('settlement_proposed', 'u1', TERMS);
    const done = clocks(fold([co, p, st('settlement_approved', 'u2', { proposalId: p.id, proposedBy: 'u1', wageSettlementId: 'w1' })]), RULES);
    expect(done).toEqual([
      { key: 'report', label: 'Conciliation officer’s report', due: '2026-10-03', doneOn: '2026-10-15' },
      { key: 'copy', label: 'Settlement copy to the authorities', due: '2026-10-25', doneOn: null },
    ]);
    // No rule set in force: that clock is left out, never made up.
    expect(clocks(fold([co]), { report: null, copy: null }).map((c) => c.key)).toEqual(['next']);
  });
});
