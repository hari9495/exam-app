import { comingUp, employeeStats, hiringHome, homePay, homeWidgets, managerHome, myTasks } from './yx-home';

describe('hiringHome (recruiter Home)', () => {
  const now = new Date('2026-10-19T06:00:00Z');

  it('turns each hiring row into an action that opens its hiring page', () => {
    const { actions } = hiringHome(
      {
        scorecardsDue: [{ interviewId: 'iv1', candidate: 'Ananya', job: 'Quality Analyst', endedAt: '2026-10-17T08:00:00Z' }],
        offers: [
          { offerId: 'o1', entryId: 'e1', jobId: 'j1', candidate: 'Farhan', job: 'Plant Engineer', status: 'pending_approval', action: 'approve' },
          { offerId: 'o2', entryId: 'e2', jobId: 'j1', candidate: 'Priya', job: 'Plant Engineer', status: 'approved', action: 'send' },
        ],
        waiting: [{ entryId: 'e3', jobId: 'j2', candidate: 'Rohit', job: 'Sales', stage: 'Screened', since: '2026-10-07T06:00:00Z' }],
      },
      now,
    );
    expect(actions.map((a) => [a.title, a.href])).toEqual([
      ['Write your scorecard · Quality Analyst', '/yx/hiring/interviews/iv1'],
      ['Approve the offer · Plant Engineer', '/yx/hiring/jobs/j1?entry=e1'],
      ['Send the offer · Plant Engineer', '/yx/hiring/jobs/j1?entry=e2'],
      ['12 days in Screened · Sales', '/yx/hiring/jobs/j2?entry=e3'],
    ]);
    expect(actions[2].note).toBe('Approved, not sent yet');
  });

  it('keeps jobs and counts out when the API left them out (a panellist)', () => {
    const { view } = hiringHome({ interviewsToday: [], scorecardsDue: [], offers: [] }, now);
    expect(view).toEqual({ interviewsToday: [], interviewsHref: '/yx/hiring/interviews', jobsHref: '/yx/hiring/jobs' });
    expect(hiringHome(undefined, now)).toEqual({ actions: [] });
  });
});


describe('HR home (parity with PLT-02 HR)', () => {
  it('makes the four designed cards, with last month only when on record, and words a month with no run', () => {
    const { stats, due, moves } = homeWidgets(
      {
        month: '2026-10',
        attendanceExceptions: 27,
        notReadyForPayroll: { notReady: 0, people: 0, runId: null, noRun: true },
        openCases: 9,
        joining: 7,
        previous: { month: '2026-09', attendanceExceptions: 41, joining: 4 },
        contractsEnding: { count: 2, lastOn: '2026-10-31' },
        joiners: [{ id: 'j', name: 'Rohan Shetty', on: '2026-10-22', department: 'Sales', location: 'Chennai', openTasks: 3, pendingTasks: ['Issue laptop', 'Create email'] }],
        leavers: [{ id: 'l', name: 'Rahul Verma', on: '2026-10-21', clearanceOpen: 1, pendingClearance: ['it'] }],
      },
      '2026-10-19',
    );
    expect(stats!.map((s) => [s.label, s.value, s.previous, s.previousLabel, s.empty])).toEqual([
      ['Attendance exceptions', 27, 41, 'September', undefined],
      ['Not ready for payroll', 0, undefined, undefined, 'No payroll run for October yet'],
      ['Open cases', 9, undefined, undefined, undefined],
      ['Joining in October', 7, 4, 'September', undefined],
    ]);
    expect(due!.map((d) => d.text)).toEqual(['Fixed-term contracts ending by 31 Oct · 2 people']);
    expect(moves!.map((m) => m.badges.map((b) => b.label))).toEqual([['Issue laptop: pending', 'Create email: pending', '1 more pending'], ['IT clearance pending']]);
  });
});

describe('Employee home (parity with PLT-02 employee)', () => {
  const day = (on: string, status: string, late = 0) => ({ on, status, leavePart: null, workedMinutes: null, lateMinutes: late, regularised: false }) as never;
  const att = (today: string, days: never[]) => ({ today, days }) as never;
  it('counts days present and late marks to today, against last month only when the person was on record', () => {
    const now = att('2026-10-19', [day('2026-10-15', 'present', 12), day('2026-10-16', 'present'), day('2026-10-17', 'weekly_off'), day('2026-10-20', 'present')]);
    const s = employeeStats({ now, before: att('2026-09-30', [day('2026-09-01', 'present'), day('2026-09-30', 'present')]), waiting: 1 });
    expect(s.map((x) => [x.label, x.value, x.previous ?? null])).toEqual([
      ['Days present in October', 2, 2],
      ['Late marks this month', 1, 0],
      ['Requests pending', 1, null],
    ]);
    // A lone leave day at the end of last month is not a month on record.
    expect(employeeStats({ now, before: att('2026-09-30', [day('2026-09-30', 'leave')]) }).every((x) => x.previous === undefined)).toBe(true);
  });

  it('shows net pay only when the company turned it on, with last month when there is one', () => {
    expect(homePay(undefined)).toBeUndefined();
    expect(homePay({ shown: false })).toBeUndefined();
    expect(homePay({ shown: true, latest: null, previous: null })).toEqual({ label: 'Net pay', value: null, href: '/yx/me/payslips' });
    expect(homePay({ shown: true, latest: { id: 's', month: '2026-09', net: '86420.00' }, previous: { month: '2026-08', net: '84900.00' } })).toEqual({ label: 'Net pay, September', value: 86420, previous: 84900, previousLabel: 'August', href: '/yx/me/payslips' });
  });

  it('lists the self-review, feedback and checklist tasks, and what is coming up', () => {
    expect(myTasks({ checklist: [{ id: 't', title: 'Upload PAN', dueOn: '2026-10-22' }], feedback: [{ id: 'f', employee: 'Meera', dueOn: null, open: true, done: false }], reviews: [{ id: 'r', cycle: 'H1 2026', next: { stage: 'self', dueOn: '2026-10-25' } }] })!.map((t) => t.text)).toEqual(['Write your self-review for H1 2026 by 25 Oct', 'Give feedback on Meera', 'Upload PAN by 22 Oct']);
    expect(comingUp([{ id: 'b', name: 'Arjun Mehta', kind: 'birthday', on: '2026-10-19' }], [{ id: 'h', on: '2026-10-20', name: 'Vijayadashami', kind: 'festival' }, { id: 'o', on: '2026-10-21', name: 'Optional', kind: 'optional' }], '2026-10-19')!.map((x) => `${x.name}: ${x.text}`)).toEqual(['Arjun Mehta: Birthday today', 'Vijayadashami: Holiday · 20 Oct 2026']);
  });
});

describe('Manager home (parity with PLT-02 manager)', () => {
  it("builds team today, who's off and late check-ins against last week", () => {
    const person = (id: string, days: { on: string; status: string; lateMinutes?: number }[]) => ({ id, name: id, code: null, location: '', me: false, mode: 'punch', missingPunchEffect: 'none', days: days.map((d) => ({ leavePart: null, workedMinutes: null, regularised: false, lateMinutes: null, ...d })) });
    const m = managerHome({
      today: '2026-10-21',
      muster: { month: '2026-10', from: '2026-10-01', to: '2026-10-31', scope: 'team', people: [person('Sanjay', [{ on: '2026-10-21', status: 'missing_in' }]), person('Meera', [{ on: '2026-10-21', status: 'leave' }]), person('Kavya', [{ on: '2026-10-20', status: 'present', lateMinutes: 15 }, { on: '2026-10-13', status: 'present', lateMinutes: 5 }, { on: '2026-10-14', status: 'present', lateMinutes: 5 }, { on: '2026-10-21', status: 'present' }])] } as never,
      calendar: { from: '2026-10-19', to: '2026-10-25', scope: 'team', people: [{ id: 'm', name: 'Meera', code: null, me: false, holidays: [], days: [{ on: '2026-10-21', part: 'full', status: 'approved', code: 'CL', colour: 'green', name: 'Casual leave' }] }] } as never,
    });
    expect(m.team?.summary).toBe('1 in · 1 on leave · 1 not checked in · 0 late');
    // Only someone not checked in can be nudged.
    expect(m.team?.rows.map((r) => [r.name, Boolean(r.nudge)])).toEqual([['Sanjay', true], ['Meera', false]]);
    expect(m.off).toEqual([{ day: 'Wed 21 · today', who: 'Meera' }]);
    expect(m.stats?.[0]).toMatchObject({ label: 'Late check-ins this week', value: 1, previous: 2, previousLabel: 'last week' });
  });
});
