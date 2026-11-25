import { addDays, canDecide, conflictWith, fold, majority, type Step } from './case-rules';

// HLP-07/08/09 rules (docs/yukthix/helpdesk-design-map.md 4f).
let n = 0;
const st = (kind: string, actorUserId: string, data: Record<string, unknown> = {}, day = 1): Step => ({ id: `s${++n}`, kind, actorUserId, data, at: new Date(Date.UTC(2026, 10, day, 6)) });

describe('case rules', () => {
  it('a notice sets the reply date; a granted extension moves it; a refused one does not', () => {
    const base = [st('notice_sent', 'o1', { respondentUserId: 'r', replyBy: '2026-11-10', source: 'x' }), st('more_time_asked', 'r', { reason: 'travel' }, 2)];
    expect(fold(base).notice).toMatchObject({ status: 'sent', replyBy: '2026-11-10', moreTime: { status: 'waiting' } });
    expect(fold([...base, st('more_time_decided', 'o1', { grant: true, newDue: '2026-11-15' }, 3)]).notice).toMatchObject({ replyBy: '2026-11-15', firstReplyBy: '2026-11-10' });
    expect(fold([...base, st('more_time_decided', 'o1', { grant: false }, 3)]).notice.replyBy).toBe('2026-11-10');
  });

  it('a delay after the notice is ignored; the delay keeps its reason', () => {
    expect(fold([st('notice_delayed', 'o1', { reason: 'safety', reviewOn: '2026-11-08' })]).notice).toMatchObject({ status: 'delayed', delay: { reason: 'safety' } });
    expect(fold([st('notice_sent', 'o1', { replyBy: '2026-11-10' }), st('notice_delayed', 'o1', { reason: 'late' }, 2)]).notice.status).toBe('sent');
  });

  it('natural justice: no outcome before the reply or its date; POSH needs the notice', () => {
    const sent = fold([st('notice_sent', 'o1', { replyBy: '2026-11-10' })]);
    expect(canDecide('grievance', sent, '2026-11-10').ok).toBe(false); // the last day is still the respondent's
    expect(canDecide('grievance', sent, '2026-11-11').ok).toBe(true);
    expect(canDecide('grievance', fold([st('notice_sent', 'o1', { replyBy: '2026-11-10' }), st('replied', 'r', { text: 'no' }, 2)]), '2026-11-03').ok).toBe(true);
    expect(canDecide('grievance', fold([]), '2026-11-03').ok).toBe(true); // nobody accused
    expect(canDecide('posh', fold([]), '2026-11-03').ok).toBe(false);
    expect(canDecide('whistleblower', fold([st('notice_delayed', 'o1', { reason: 'x', reviewOn: '2026-11-09' })]), '2026-11-03').ok).toBe(false);
  });

  it('outcome: a proposal is approved or sent back only once; a new proposal starts again', () => {
    const p = st('proposed', 'o1', { finding: 'proved', action: 'warning', reasons: 'r', reporterSummary: 's' });
    expect(fold([p, st('approved', 'o2', { proposalId: p.id, proposedBy: 'o1' }, 2)]).outcome).toMatchObject({ status: 'approved', approvedBy: 'o2', proposedBy: 'o1' });
    expect(fold([p, st('approved', 'o2', { proposalId: 'other' }, 2)]).outcome.status).toBe('proposed');
    const back = fold([p, st('sent_back', 'o2', { proposalId: p.id, note: 'fix' }, 2), st('proposed', 'o1', { finding: 'not-proved' }, 3)]);
    expect(back.outcome).toMatchObject({ status: 'proposed', finding: 'not-proved', sendBackNote: null });
  });

  it('IC report: views count on the current draft only; signing needs that draft', () => {
    const d1 = st('ic_draft', 'a', { finding: 'proved', findings: 'f', recommendation: 'r' });
    const v = st('ic_vote', 'b', { draftId: d1.id, vote: 'agree' }, 2);
    expect(fold([d1, v]).ic.votes.size).toBe(1);
    const d2 = st('ic_draft', 'a', { finding: 'proved-in-part' }, 3);
    expect(fold([d1, v, d2]).ic.votes.size).toBe(0);
    expect(fold([d1, v, d2, st('ic_signed', 'a', { draftId: d1.id }, 4)]).ic.status).toBe('draft');
    expect(fold([d1, v, d2, st('ic_signed', 'a', { draftId: d2.id }, 4)]).ic.status).toBe('signed');
  });

  it('majority is more than half', () => {
    expect(majority(1, 3)).toBe(false);
    expect(majority(2, 3)).toBe(true);
    expect(majority(2, 4)).toBe(false);
    expect(majority(3, 4)).toBe(true);
    expect(majority(0, 0)).toBe(false);
  });

  it('relief, recusal and members', () => {
    const r = st('relief', 'o1', { action: 'reporting', note: 'n', assigneeUserId: 'hr', ref: 'GRV-0001-R1' });
    const f = fold([r, st('relief_done', 'o1', { reliefId: r.id }, 2), st('recused', 'o2', { reason: 'friend' }, 2), st('member_added', 'o1', { userId: 'i1', role: 'investigator' }, 3)]);
    expect(f.relief[0]).toMatchObject({ done: true, ref: 'GRV-0001-R1' });
    expect(f.recused.get('o2')?.reason).toBe('friend');
    expect(f.added.get('i1')?.role).toBe('investigator');
  });

  it('conflict: parties and anyone above them in the reporting line (loops stop)', () => {
    const m = new Map<string, string | null>([['resp', 'mgr'], ['mgr', 'head'], ['head', 'resp']]);
    expect(conflictWith('resp', ['rep', 'resp'], m)).toMatch(/party/);
    expect(conflictWith('head', [null, 'resp'], m)).toMatch(/reporting line/);
    expect(conflictWith('other', ['rep', 'resp'], m)).toBeNull();
  });

  it('adds days across a month end', () => {
    expect(addDays('2026-10-25', 10)).toBe('2026-11-04');
  });
});
