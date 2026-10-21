import type { ExitRow, Joiner, QueueDocument, ReadyOffer } from '@yukthix/ui/lifecycle';
import type { AsOfView, ChangeRecord, HistoryView } from '@yukthix/ui/history';
import type { Muster } from '@yukthix/ui/time';
import { exitRows, exitStage } from './yx-exits';
import { changeWords, scheduledRows } from './yx-changes';
import { boardColumns } from './yx-onboarding';
import { minutesText, todayText } from './yx-team';
import { bankRows, docRows, familyData, identityRows, jobRows, payShown, scheduledBody, upcoming } from './yx-record';
import type { ProfileView } from '@yukthix/ui/access';

// The People screens' live mapping (design parity): the stage, status and wording rules each designed screen shows.
const as = <T>(x: unknown) => x as T;

describe('exit cases (PPL-19)', () => {
  const row = (over: Partial<ExitRow>) => as<ExitRow>({ id: 'x', name: 'Anbu Mani', employeeCode: 'KF-1', typeLabel: 'Resignation', lastDay: '2026-11-30', status: 'accepted', clearance: { open: 0 }, interview: null, manager: 'Divya', lettersHeld: false, pendingChange: false, ...over });
  it('the stage follows where the case stands', () => {
    expect(exitStage(row({ status: 'submitted' }))).toBe('Approval and notice');
    expect(exitStage(row({ clearance: as({ open: 2 }) }))).toBe('Clearance');
    expect(exitStage(row({ interview: as('sent') }))).toBe('Exit interview');
    expect(exitStage(row({ status: 'cleared' }))).toBe('F&F');
  });
  it('lists only open cases; held letters are flagged', () => {
    const rows = exitRows([row({ lettersHeld: true }), row({ id: 'y', status: as('exited') })]);
    expect(rows.map((r) => r.id)).toEqual(['x']);
    expect(rows[0]).toMatchObject({ flags: 'Letters held', flagTone: 'warning', manager: 'Divya' });
  });
});

describe('scheduled changes (PPL-05)', () => {
  const c = (over: Partial<ChangeRecord>) => as<ChangeRecord>({ id: 'c', employeeId: 'e', employeeName: 'Arjun', changeType: 'transfer', effectiveDate: '2026-11-01', status: 'scheduled', reason: 'Plant move', impact: { facts: [{ from: 'Bengaluru', to: 'Chennai' }], pay: 'hidden' }, ...over });
  it('one fact reads from → to; pay stays out when hidden', () => {
    expect(changeWords(c({}))).toEqual({ summary: 'Bengaluru → Chennai' });
  });
  it('only waiting or scheduled changes from today on', () => {
    const rows = scheduledRows([c({}), c({ id: 'p', status: 'pending' }), c({ id: 'old', effectiveDate: '2026-10-01' }), c({ id: 'd', status: as('applied') })], [{ id: 'e', name: 'Arjun', employeeCode: 'KF-0142' } as never], '2026-10-20');
    expect(rows.map((r) => [r.id, r.status, r.code])).toEqual([
      ['c', 'Scheduled', 'KF-0142'],
      ['p', 'Pending approval', 'KF-0142'],
    ]);
  });
});

describe('onboarding board (PPL-11)', () => {
  const j = (over: Partial<Joiner>) => as<Joiner>({ id: 'j', journeyId: 'jr', name: 'Meena', designation: 'Operator', joiningOn: '2026-10-25', status: 'invited', progress: 20, location: 'Hosur', personType: 'new', nextTask: null, addedOn: '2026-10-10', ...over });
  it('the stage follows the dates; offers come first only when given', () => {
    const cols = boardColumns([j({}), j({ id: 'a', journeyId: 'a', joiningOn: '2026-10-20' }), j({ id: 'b', journeyId: 'b', status: 'joined', progress: 50 }), j({ id: 'c', journeyId: 'c', status: 'joined', progress: 100 }), j({ id: 'x', status: as('cancelled') })], [as<ReadyOffer>({ offerId: 'o', name: 'Ravi', jobTitle: 'Fitter', startDate: '2026-11-01', personType: 'new', acceptedOn: '2026-10-18' })], '2026-10-20');
    expect(cols.map((c) => [c.id, c.cards.length])).toEqual([
      ['offer', 1],
      ['pre', 1],
      ['day1', 1],
      ['first30', 1],
      ['done', 1],
    ]);
    expect(boardColumns([], null, '2026-10-20').map((c) => c.id)).toEqual(['pre', 'day1', 'first30', 'done']);
  });
});

describe('my team (PPL-08)', () => {
  it('durations read in hours and minutes', () => {
    expect([minutesText(40), minutesText(60), minutesText(770)]).toEqual(['40 min', '1 h', '12 h 50 min']);
  });
  it('today: leave, weekly off, not checked in', () => {
    const m = as<Muster>({ people: [{ id: 'e', days: [{ on: '2026-10-20', status: 'weekly_off' }] }, { id: 'f', days: [{ on: '2026-10-20', status: 'absent' }] }] });
    expect(todayText('e', '2026-10-20', m)).toBe('Weekly off');
    expect(todayText('f', '2026-10-20', m)).toBe('Not checked in');
    expect(todayText('g', '2026-10-20', m)).toBe('');
  });
});

describe('person record (PPL-03)', () => {
  it('documents: verified ones expiring within 30 days say so; requested ones are missing', () => {
    const d = (over: Partial<QueueDocument>) => as<QueueDocument>({ id: 'd', typeName: 'Passport', sensitivity: 'personal', status: 'verified', expiresOn: null, file: null, versions: 1, ...over });
    expect(docRows([d({ expiresOn: '2026-11-10' }), d({ status: 'requested' }), d({ expiresOn: '2027-06-01' })], '2026-10-20').map((r) => r.status)).toEqual(['Expiring', 'Missing', 'Verified']);
  });
  it('coming up: probation end and the next work anniversary', () => {
    const v = as<AsOfView>({ status: { status: 'probation', validTo: '2026-12-01' }, employee: { joinedOn: '2024-11-05', exitedOn: null } });
    const h = as<HistoryView>({ changes: [] });
    expect(upcoming(v, h, '2026-10-20', ['Salary bank account']).map((e) => [e.label, e.note])).toEqual([['Probation ends', undefined], ['Work anniversary (2 years)', undefined], ['1 pending request', 'Profile change: salary bank account']]);
  });
});

describe('person record identity and family (PPL-03, founder 22 Oct 2026)', () => {
  const prof = {
    can: { reveal: true, editPersonal: false, requestChange: false },
    classes: { aadhaar: false },
    identity: { legalName: 'Arjun Kulkarni', pan: '•••• 821M', aadhaar: '•••• 1942', uan: '•••• 1775', esic: null, passport: '•••• 7728', passportExpiresOn: null, bankAccounts: [{ purpose: 'salary', holderName: 'Arjun', ifsc: 'CNRB0001234', account: '•••• 6789', usableFrom: '2020-01-01' }], pending: [] },
  } as unknown as ProfileView;
  it('masks in the design shape, from the last four the API sent', () => {
    const rows = identityRows(prof, async () => '');
    const v = (label: string) => rows.find((r) => r.label === label)?.masked;
    expect([v('PAN'), v('Aadhaar'), v('UAN'), v('Passport'), v('Salary account')]).toEqual(['XXXXXX821M', 'XXXX XXXX 1942', 'XXXXXXXX1775', 'XXXX7728', 'CNRB0001234 · XXXX XXXX 6789']);
    expect(rows.find((r) => r.label === 'Aadhaar')?.canReveal).toBe(false);
    expect(bankRows(prof, async () => '')).toHaveLength(1);
  });
  it('family: nominees by member, the marital-status note only when the record shows the change', () => {
    const f = { members: [{ id: 'm1', name: 'Shalini', relation: 'Spouse', dateOfBirth: '1994-11-02', dependant: true }], nominations: [{ scheme: 'pf', familyMemberId: 'm1', name: 'Shalini', relation: 'Spouse', sharePercent: 100 }, { scheme: 'all', familyMemberId: null, name: 'Old', relation: 'Father', sharePercent: 100 }], expectedSchemes: ['gratuity'], contacts: [], maritalChangedAt: null, nominationsReviewedAt: '2026-10-01T10:00:00.000Z' };
    const out = familyData(f);
    expect(out.nominations.map((n) => n.member)).toEqual([0, null]);
    expect(out.note).toBeNull();
    expect(familyData({ ...f, maritalChangedAt: '2026-09-01T10:00:00.000Z' }).note).toBe('Marital status changed on 1 Sept 2026. Nominations were reviewed after that change.');
    expect(familyData({ ...f, maritalChangedAt: '2026-10-05T10:00:00.000Z' }).note).toMatch(/not been reviewed since/);
  });
});

describe('person record Pay tab (PPL-03, founder 22 Oct 2026)', () => {
  const comp = {
    validFrom: '2026-04-01',
    currency: 'INR',
    annualCtc: '583200.00',
    lines: [
      { name: 'Basic', kind: 'earning' as const, monthly: '19440.00', inCtc: true },
      { name: 'Special allowance', kind: 'earning' as const, monthly: '27360.00', inCtc: true },
      { name: 'Employer PF', kind: 'employer' as const, monthly: '1800.00', inCtc: true, basis: '12% of ₹15,000' },
      { name: 'Employer ESI', kind: 'employer' as const, monthly: '0.00', inCtc: true },
      { name: 'Gratuity provision', kind: 'employer' as const, monthly: '934.62', inCtc: false, basis: '4.81% of basic' },
      { name: 'PF', kind: 'deduction' as const, monthly: '1800.00', inCtc: false },
    ],
    lastNetPay: { month: '2026-08', net: '49812.40', paid: true, paidOn: '2026-08-31' },
    taxRegime: { regime: 'new', taxYear: '2026-27', proofsPending: 2 },
    next: { annualCtc: '780000.00', from: '2026-10-01' },
  };
  it('the table counts what the CTC counts (its total is the CTC); ₹0 lines hidden; basis in the label', () => {
    const p = payShown(comp, [{ label: 'Salary account', value: 'x', cls: 'Confidential' }]);
    expect(p.lines.map((l) => l.label)).toEqual(['Basic', 'Special allowance', 'Employer PF (12% of ₹15,000)']);
    expect(p.lines.reduce((s, l) => s + l.monthly, 0) * 12).toBe(p.ctc);
    expect(p.outside).toEqual([{ label: 'Gratuity provision (4.81% of basic)', monthly: 934.62 }]);
    expect(p.next).toBe('₹7,80,000 from 1 Oct 2026 (scheduled)');
    expect(p.lastNet?.note).toBe('August 2026 · paid 31 Aug 2026');
    expect(p.taxRegime).toEqual({ label: 'New', note: 'FY 2026–27 · 2 proofs pending' });
    expect(p.banks.map((b) => [b.label, b.value])).toEqual([['Salary account', 'x'], ['Reimbursement account', 'Same as salary account']]);
  });
  it('no payslip and no regime yet are empty, not hidden', () => {
    const p = payShown({ ...comp, lastNetPay: null, taxRegime: null, next: null }, []);
    expect([p.lastNet, p.taxRegime, p.next]).toEqual([null, null, undefined]);
  });
});

describe('person record Job tab (PPL-03, founder 22 Oct 2026)', () => {
  const assignment = { designation: { name: 'Quality Analyst' }, grade: { name: 'G5' }, department: { name: 'Quality' }, location: { name: 'Hosur plant' }, manager: { name: 'Divya R' }, dottedLineManagers: [], employmentType: { name: 'Permanent' }, costCentres: [{ code: 'QA-HSR-01', name: 'QA', percent: '100' }], hoursPerWeek: null, normalWeekHours: '48' };
  const view = (o: object) => ({ employee: { legalEntity: { name: 'Kaveri Foods' } }, assignment, status: { status: 'confirmed', validFrom: '2021-09-12', validTo: null }, job: { holidayCalendar: 'Tamil Nadu 2026', shiftPattern: 'Rotational (A / B / C)', noticePeriod: '60 days', probationEndsOn: '2021-09-11' }, ...o }) as unknown as AsOfView;
  it("the design's fields in its order, then the live extras; Not set where nothing applies", () => {
    expect(jobRows(view({}))).toEqual([
      ['Designation', 'Quality Analyst'], ['Grade', 'G5'], ['Department', 'Quality'], ['Location', 'Hosur plant'], ['Manager', 'Divya R'], ['Employment type', 'Permanent'],
      ['Probation', 'Confirmed on 12 Sept 2021'], ['Holiday calendar', 'Tamil Nadu 2026'], ['Shift pattern', 'Rotational (A / B / C)'], ['Cost centre', 'QA-HSR-01'], ['Notice period', '60 days'],
      ['Working hours', 'Full-time (48 hours)'], ['Legal entity', 'Kaveri Foods'],
    ]);
    const bare = jobRows(view({ status: { status: 'probation', validFrom: '2026-07-01', validTo: null }, job: { holidayCalendar: null, shiftPattern: null, noticePeriod: null, probationEndsOn: '2026-12-31' }, assignment: { ...assignment, costCentres: [] } }));
    expect(bare.filter(([l]) => ['Probation', 'Holiday calendar', 'Cost centre', 'Notice period'].includes(l))).toEqual([['Probation', 'On probation until 31 Dec 2026'], ['Holiday calendar', 'Not set'], ['Cost centre', 'Not set'], ['Notice period', 'Not set']]);
  });
  it('the scheduled banner: new grade, the CTC only with pay, who approved and when, the letter', () => {
    const h = {
      payAccess: true,
      assignment: [{ changeId: 'c0', validFrom: '2021-03-12', supersededAt: null, grade: { name: 'G5' }, designation: { name: 'Quality Analyst' }, location: { name: 'Hosur' } }, { changeId: 'c1', validFrom: '2026-10-01', supersededAt: null, grade: { name: 'G6' }, designation: { name: 'Quality Lead' }, location: { name: 'Hosur' } }],
      compensation: [{ changeId: 'c1', supersededAt: null, annualCtc: '780000.00', currency: 'INR' }],
      status: [],
      changes: [],
    } as unknown as HistoryView;
    const ch = { id: 'c1', status: 'scheduled', touchesPay: true, decidedAt: '2026-09-24T10:00:00Z', decidedByName: 'Karthik Subramanian', letter: { referenceNo: 'KF/HR/2026/0418', accepted: true }, impact: null } as unknown as ChangeRecord;
    expect(scheduledBody(ch, h)).toBe('Designation Quality Lead, Grade G6, CTC ₹7,80,000 a year. Approved by Karthik Subramanian on 24 Sept 2026. Letter KF/HR/2026/0418 accepted.');
    expect(scheduledBody({ ...ch, letter: null }, { ...h, payAccess: false, compensation: [] })).toBe('Designation Quality Lead, Grade G6, Pay changes. Approved by Karthik Subramanian on 24 Sept 2026.');
  });
});
