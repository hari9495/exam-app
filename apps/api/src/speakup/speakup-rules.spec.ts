import { addMonths, anonymousAllowed, caseNumber, newReplyCode, poshLate, readCode, route, showCode } from './speakup-rules';

const teams = (over: Partial<Record<'grievance' | 'ethics' | 'ic' | 'escalation', string[]>> = {}) => ({ grievance: ['g1'], ethics: ['e1', 'e2'], ic: ['i1', 'i2'], escalation: ['chair'], ...over });

describe('HLP-06 speak-up rules', () => {
  it('reply codes: 16 characters, printed in fours, read back in any case with dashes or spaces', () => {
    const c = newReplyCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
    expect(newReplyCode()).not.toBe(c);
    expect(showCode('ABCDEFGHJKLMNPQR')).toBe('ABCD-EFGH-JKLM-NPQR');
    expect(readCode(' abcd-efgh jklm-npqr ')).toBe('ABCDEFGHJKLMNPQR');
    expect(readCode('ABCD-EFGH-JKLM-NPQ')).toBeNull();
    expect(readCode('ABCD-EFGH-JKLM-NPQ0')).toBeNull(); // 0 is not in the alphabet
  });

  it('numbers per kind', () => {
    expect(caseNumber('grievance', 7)).toBe('GRV-0007');
    expect(caseNumber('whistleblower', 12)).toBe('WB-0012');
    expect(caseNumber('posh', 1)).toBe('POSH-0001');
  });

  it('anonymous: the company setting; POSH never', () => {
    expect(anonymousAllowed('all', 'grievance')).toBe(true);
    expect(anonymousAllowed('ethics_only', 'grievance')).toBe(false);
    expect(anonymousAllowed('ethics_only', 'whistleblower')).toBe(true);
    expect(anonymousAllowed('off', 'whistleblower')).toBe(false);
    expect(anonymousAllowed('all', 'posh')).toBe(false);
  });

  it('routing: each kind to its list; about an officer to the escalation list; nobody → null', () => {
    expect(route('grievance', teams(), null)).toEqual({ team: 'grievance', members: ['g1'] });
    expect(route('grievance', teams({ grievance: [] }), null)).toEqual({ team: 'ethics', members: ['e1', 'e2'] });
    expect(route('whistleblower', teams(), 'e1')).toEqual({ team: 'escalation', members: ['chair'] });
    expect(route('whistleblower', teams(), 'someone-else')).toEqual({ team: 'ethics', members: ['e1', 'e2'] });
    expect(route('posh', teams(), null)).toEqual({ team: 'ic', members: ['i1', 'i2'] });
    expect(route('posh', teams({ ic: [] }), null)).toBeNull();
    expect(route('whistleblower', teams({ escalation: [] }), 'e2')).toBeNull();
  });

  it('POSH lateness against the rule set months; month ends clamp', () => {
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(poshLate('2026-08-03', '2026-11-03', 3)).toBe(false);
    expect(poshLate('2026-08-02', '2026-11-03', 3)).toBe(true);
    expect(poshLate(null, '2026-11-03', 3)).toBe(false);
  });
});
