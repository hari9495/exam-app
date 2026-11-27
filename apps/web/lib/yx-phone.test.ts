import type { ApprovalTask } from '@yukthix/ui/desk';
import type { MyAttendance, MyLeave } from '@yukthix/ui/time';
import { homeQuickActions, homeTodos, meGroups, mineRows, moreAreas, payRows, phoneTab, pickerRows, teamRows, timeTab } from './yx-phone';
import type { NavArea } from './yx-nav';

// T2-H (answer 2741): the phone tab landings list only pages the person's own menu has.
const nav = (ids: [string, string][], area = 'home'): NavArea[] => [{ id: area as NavArea['id'], title: area, sections: [{ items: ids.map(([id, href]) => ({ id, label: id, href })) }] }];

describe('phoneTab', () => {
  it.each([
    ['/yx/home', 'home'],
    ['/yx/search', 'home'],
    ['/yx/approvals', 'requests'],
    ['/yx/requests', 'requests'],
    ['/yx/me/requests', 'requests'],
    ['/yx/time/attendance', 'time'],
    ['/yx/me/payslips', 'pay'],
    ['/yx/expenses/trips', 'pay'],
    ['/yx/me/documents', 'me'],
    ['/yx/people/profile', 'me'],
    ['/yx/desk/help', undefined],
    ['/yx/mexico', undefined],
  ])('%s lights %s', (path, tab) => expect(phoneTab(path)).toBe(tab));
});

describe('tab rows', () => {
  it('Me: rows only for pages in the menu; Settings and More always; Delegation only outside support', () => {
    const groups = meGroups(nav([['profile', '/yx/people/profile'], ['desk-help', '/yx/desk/help'], ['approvals', '/yx/approvals']]));
    expect(groups.find((g) => g.label === 'About me')!.rows.map((r) => r.id)).toEqual(['profile']);
    expect(groups.find((g) => g.label === 'Growth')!.rows).toEqual([]);
    expect(groups.find((g) => g.label === 'Settings')!.rows.map((r) => r.id)).toEqual(['delegation', 'settings', 'more']);
    expect(meGroups(nav([])).find((g) => g.label === 'Settings')!.rows.map((r) => r.id)).toEqual(['settings', 'more']);
  });

  it('More: areas without a tab, each opening its first page', () => {
    expect(moreAreas([...nav([['home', '/yx/home']]), ...nav([['desk-help', '/yx/desk/help'], ['desk-tickets', '/yx/desk/tickets']], 'helpdesk'), ...nav([], 'engage'), ...nav([['my-payslips', '/yx/me/payslips']], 'pay')])).toEqual([{ id: 'helpdesk', title: 'helpdesk', href: '/yx/desk/help' }]);
  });

  it('Pay: own pay pages only', () => {
    expect(payRows(nav([['my-payslips', '/yx/me/payslips'], ['pay-loans', '/yx/payroll/loans']])).map((r) => r.id)).toEqual(['payslips']);
  });

  it('Time: late marks and unfixed missing punches before today; balances that keep one; no rows without pages', () => {
    const att = {
      today: '2026-11-10',
      days: [
        { on: '2026-11-02', status: 'present', lateMinutes: 12, regularised: false },
        { on: '2026-11-03', status: 'missing_out', lateMinutes: null, regularised: false },
        { on: '2026-11-04', status: 'missing_in', lateMinutes: null, regularised: true },
        { on: '2026-11-10', status: 'missing_in', lateMinutes: 30, regularised: false },
      ],
    } as unknown as MyAttendance;
    const leave = { balances: [{ name: 'Casual', hasBalance: true, available: 4 }, { name: 'Unpaid', hasBalance: false, available: 0 }], holidays: { calendar: null, list: [] } } as unknown as MyLeave;
    const t = timeTab(nav([['my-attendance', '/yx/time/attendance'], ['my-leave', '/yx/time/leave']]), att, leave);
    expect(t.attendance[0]).toMatchObject({ id: 'attendance', sub: '1 late mark · 1 missing punch this month', fix: 1 });
    expect(t.balances).toEqual([{ name: 'Casual', value: 4 }]);
    expect(t.applyLeaveHref).toBe('/yx/time/leave?apply=1');
    expect(timeTab(nav([]), att, leave)).toEqual({ attendance: [], balances: [{ name: 'Casual', value: 4 }], leave: [] });
  });
});

describe('requests and Home', () => {
  const now = new Date('2026-11-10T06:00:00Z');
  it('Mine: newest first, with who it waits on', () => {
    const rows = mineRows([
      { requestId: 'a', type: 'Leave', title: 'Old', status: 'approved', submittedAt: '2026-11-01T05:00:00Z', decidedAt: '2026-11-02T05:00:00Z', step: null, waitingOn: [], raisedBy: null },
      { requestId: 'b', type: 'Leave', title: 'New', status: 'pending', submittedAt: '2026-11-09T05:00:00Z', decidedAt: null, step: null, waitingOn: ['Karthik S'], raisedBy: null },
    ]);
    expect(rows.map((r) => r.title)).toEqual(['New', 'Old']);
    expect(rows[0]).toMatchObject({ status: 'Pending', sub: 'With Karthik S since 9 Nov 2026' });
    expect(rows[1]).toMatchObject({ status: 'Approved', tone: 'success' });
  });

  it('Team: soonest due first; overdue, today and later', () => {
    const t = (id: string, dueAt: string | null) => ({ taskId: id, type: 'Leave', title: 'x', requester: 'R', person: 'P', dueAt }) as unknown as ApprovalTask;
    const rows = teamRows([t('later', '2026-11-13T06:00:00Z'), t('none', null), t('late', '2026-11-09T06:00:00Z'), t('today', '2026-11-10T08:00:00Z')], now);
    expect(rows.map((r) => [r.id, r.due])).toEqual([['late', 'Overdue'], ['today', 'Due today'], ['later', 'Due in 3 days'], ['none', undefined]]);
  });

  it('Home to-dos and quick actions', () => {
    const todos = homeTodos([{ id: 'x', type: 'Leave', title: 'Casual leave', who: 'Arjun', due: new Date('2026-11-10T10:00:00Z') }], [{ text: 'Self-review', href: '/yx/performance/reviews' }], now);
    expect(todos).toEqual([
      { id: 'x', title: 'Leave · Arjun', sub: 'Casual leave', href: '/yx/approvals', due: 'Due today', dueToday: true },
      { id: 'task-0', title: 'Self-review', href: '/yx/performance/reviews' },
    ]);
    expect(homeQuickActions(nav([['my-leave', '/yx/time/leave'], ['my-payslips', '/yx/me/payslips']])).map((a) => a.kind)).toEqual(['leave', 'payslip']);
    expect(homeQuickActions(nav([]))).toEqual([]);
  });
});

describe('pickerRows', () => {
  it('the "+ New" types and loans and resignation from the menu; none without pages', () => {
    const rows = pickerRows(nav([['my-leave', '/yx/time/leave'], ['desk-help', '/yx/desk/help'], ['resign', '/yx/me/resignation']]));
    expect(rows.map((r) => [r.section, r.id, r.href])).toEqual([
      ['Common', 'leave', '/yx/time/leave?apply=1'],
      ['Money and help', 'ticket', '/yx/desk/help?new=1'],
      ['Money and help', 'resign', '/yx/me/resignation'],
    ]);
    expect(pickerRows(nav([]))).toEqual([]);
  });
});
