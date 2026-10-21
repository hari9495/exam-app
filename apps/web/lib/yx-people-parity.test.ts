import type { ExitRow, Joiner, QueueDocument, ReadyOffer } from '@yukthix/ui/lifecycle';
import type { AsOfView, ChangeRecord, HistoryView } from '@yukthix/ui/history';
import type { Muster } from '@yukthix/ui/time';
import { exitRows, exitStage } from './yx-exits';
import { changeWords, scheduledRows } from './yx-changes';
import { boardColumns } from './yx-onboarding';
import { minutesText, todayText } from './yx-team';
import { bankRows, docRows, familyData, identityRows, upcoming } from './yx-record';
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
