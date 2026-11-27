import { buildPalette, newRequestTypes, type PaletteInput } from './yx-palette';
import { MAX_RECENT, addRecent, clearAllRecent, readRecent, recentKey } from './yx-recent';
import { approvableTask, toBellItem } from './yx-bell';
import { buildNav, withAccount, type NavInput } from './yx-nav';
import type { NotificationView } from './types';

// Ctrl K and the bell as designed (PLT-20, PLT-01; founder review 19 Oct 2026).
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const employeeNav = withAccount(buildNav({ ...base, employee: true }), { support: false, employee: true });
const input = (over: Partial<PaletteInput> = {}): PaletteInput => ({ nav: employeeNav, typed: '', recent: [], self: true, help: true, ...over });
const headings = (p: ReturnType<typeof buildPalette>) => p.groups.map((g) => g.heading);
const labels = (p: ReturnType<typeof buildPalette>, heading: string) => p.groups.find((g) => g.heading === heading)?.items.map((i) => i.label) ?? [];

describe('buildPalette', () => {
  it('opened empty: Recent and Actions only, never a list of every menu page', () => {
    const p = buildPalette(input({ recent: [{ label: 'My leave', type: 'page', href: '/yx/time/leave' }, { label: 'Arjun Mehta', type: 'person', href: '/yx/people/directory?q=Arjun' }], waiting: 2 }));
    expect(headings(p)).toEqual(['Recent', 'Actions']);
    expect(labels(p, 'Actions')).toEqual(['Apply leave', 'Regularise a day', 'Request work from home', 'Approve requests', 'New expense claim', 'Add an expense', 'Raise a ticket']);
    const recent = p.groups[0].items;
    expect(recent.map((i) => [i.label, i.secondary])).toEqual([['My leave', 'Time › My time'], ['Arjun Mehta', 'Person']]);
    expect(recent.every((i) => i.icon)).toBe(true);
    expect(p.groups[1].items.find((i) => i.label === 'Approve requests')?.secondary).toBe('Approvals · 2 waiting');
  });

  it('actions follow what the person may do; shortcuts only for the actions they have', () => {
    const noRecord = buildPalette(input({ nav: buildNav(base), self: false }));
    expect(labels(noRecord, 'Actions')).toEqual(['Approve requests', 'Raise a ticket']);
    // Keka ideas: no own record, no leave, attendance or expense actions; no help desk (support session), no ticket.
    expect(labels(buildPalette(input({ nav: buildNav(base), self: false, help: false })), 'Actions')).toEqual(['Approve requests']);
    expect(noRecord.shortcuts).toEqual({});
    const emp = buildPalette(input());
    expect(emp.shortcuts).toEqual({ 'N L': '/yx/time/leave?apply=1', 'N E': '/yx/expenses?new=1' });
    expect(emp.targets.get('act:leave')?.href).toBe('/yx/time/leave?apply=1');
    expect(emp.targets.get('act:regularise')?.href).toBe('/yx/time/attendance?request=regularise');
    expect(emp.targets.get('act:ticket')?.href).toBe('/yx/desk/help?new=1');
  });

  it('pages appear only when typed, with the right area; settings under ? help and settings', () => {
    const p = buildPalette(input({ typed: '>leave' }));
    const pages = p.groups.find((g) => g.heading === 'Pages')!;
    expect(pages.prefix).toBe('>');
    expect(pages.items.find((i) => i.label === 'My leave')?.secondary).toBe('Time › My time');
    expect(pages.items.find((i) => i.label === 'My security')?.secondary).toBe('Account');
    const admin = buildPalette(input({ nav: buildNav({ ...base, role: 'org_admin', has: (k) => k === 'org.settings.manage' }), typed: '?company' }));
    const help = admin.groups.find((g) => g.heading === 'Help and settings')!;
    expect(help.prefix).toBe('?');
    expect(help.items.map((i) => i.label)).toContain('Onboarding & probation');
    expect(help.items.map((i) => i.label)).not.toContain('Company rules'); // retired in S-7
  });

  it('server results: people (and candidates) under @, requests and tickets under #, opened ones remembered without details', () => {
    const search = {
      people: [{ id: 'p1', label: 'Arjun Mehta', secondary: 'QA Engineer · Quality', href: '/yx/people/directory?q=Arjun' }],
      candidates: [{ id: 'c1', label: 'Arjun Rao', secondary: 'Candidate · a@x.in', href: '/yx/hiring/candidates/c1' }],
      requests: [{ id: 'r1', label: '0A1B2C3D', secondary: 'Leave · Casual leave · Arjun Mehta · Waiting', href: '/yx/approvals' }],
      tickets: [{ id: 't1', label: 'IT-12', secondary: 'VPN · Ticket · New', href: '/yx/desk/help/t1' }],
    };
    const p = buildPalette(input({ typed: 'arjun', search }));
    expect(headings(p)).toEqual(['Actions', 'People', 'Requests and tickets', 'Pages', 'Help and settings'].filter((h) => p.groups.some((g) => g.heading === h)));
    expect(p.groups.find((g) => g.heading === 'People')?.prefix).toBe('@');
    expect(labels(p, 'Requests and tickets')).toEqual(['0A1B2C3D', 'IT-12']);
    expect(p.targets.get('request:r1')?.recent).toEqual({ label: '0A1B2C3D · Leave', type: 'request', href: '/yx/approvals' });
    expect(p.targets.get('person:p1')?.recent).toEqual({ label: 'Arjun Mehta', type: 'person', href: '/yx/people/directory?q=Arjun' });
  });

  it('a recent page the person can no longer open is dropped', () => {
    const p = buildPalette(input({ recent: [{ label: 'Runs', type: 'page', href: '/yx/payroll/runs' }] }));
    expect(headings(p)).not.toContain('Recent');
  });
});

describe('recent storage', () => {
  beforeEach(() => window.localStorage.clear());
  it('keeps at most 8, newest first, one per link; reads only in-app links of the right shape', () => {
    let list: ReturnType<typeof readRecent> = [];
    for (let i = 0; i < 10; i++) list = addRecent(list, { label: `P${i}`, type: 'page', href: `/yx/p${i}` });
    list = addRecent(list, { label: 'P5 again', type: 'page', href: '/yx/p5' });
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].label).toBe('P5 again');
    const key = recentKey('u1', 'o1');
    window.localStorage.setItem(key, JSON.stringify([{ label: 'Evil', type: 'page', href: '//evil.test' }, { label: 'Js', type: 'page', href: 'javascript:alert(1)' }, { label: 'Ok', type: 'person', href: '/yx/people', secret: 'x' }, { label: 'Bad type', type: 'salary', href: '/yx' }]));
    expect(readRecent(key)).toEqual([{ label: 'Ok', type: 'person', href: '/yx/people' }]);
    window.localStorage.setItem(key, 'not json');
    expect(readRecent(key)).toEqual([]);
  });
  it('sign-out clears every person and company list, and nothing else', () => {
    window.localStorage.setItem(recentKey('u1', 'o1'), '[]');
    window.localStorage.setItem(recentKey('u2', 'o2'), '[]');
    window.localStorage.setItem('yx-panel-collapsed', '1');
    clearAllRecent();
    expect(Object.keys(window.localStorage)).toEqual(['yx-panel-collapsed']);
  });
});

describe('bell', () => {
  const n = (over: Partial<NotificationView> = {}): NotificationView => ({ id: 'n1', type: 'workflow.approval.needed', actorUserId: 'u9', actorName: 'Arjun Mehta', entityType: 'wf_request', entityId: 'r1', contextText: 'Casual leave · Leave: Manager', linkPath: '/yx/approvals', readAt: null, createdAt: '2026-10-19T09:00:00Z', ...over });
  it('the person it is about, or a neutral bell for YukthiX notices', () => {
    expect(toBellItem(n())).toMatchObject({ actor: { name: 'Arjun Mehta' }, system: false });
    expect(toBellItem(n({ actorUserId: null, actorName: null, type: 'journey.task.overdue' })).system).toBe(true);
  });
  it('Approve only for an open task of this person, never for one decided on its own page', () => {
    const tasks = [{ taskId: 't1', requestId: 'r1', decideAt: null }, { taskId: 't2', requestId: 'r2', decideAt: '/yx/payroll/runs' }];
    expect(approvableTask(n(), tasks)?.taskId).toBe('t1');
    expect(approvableTask(n({ entityId: 'r2' }), tasks)).toBeNull();
    expect(approvableTask(n({ entityId: 'r3' }), tasks)).toBeNull();
    expect(approvableTask(n({ type: 'workflow.approval.decided' }), tasks)).toBeNull();
    expect(approvableTask(n(), undefined)).toBeNull();
  });
});

describe('buildPalette: desk actions (answer 1649)', () => {
  const ticket = { number: 'IT-1038', canWork: true, canned: [{ id: 'c1', title: 'Password reset steps' }], scenarios: [{ id: 's1', name: 'Escalate to network team' }] };
  const desk = (o: Partial<NonNullable<PaletteInput['desk']>> = {}) => ({ view: true, work: true, ticket, ...o });

  it('an agent on a ticket: saved replies, scenarios and their own status; a typed number opens that ticket', () => {
    const p = buildPalette(input({ desk: desk() }));
    expect(labels(p, 'Desk')).toEqual(['Insert saved reply: Password reset steps', 'Run scenario: Escalate to network team', 'Set my status: Available', 'Set my status: Busy', 'Set my status: Away', 'Set my status: Offline']);
    expect(p.targets.get('desk:reply:c1')).toEqual({ deskReply: 'c1' });
    expect(p.targets.get('desk:scenario:s1')).toEqual({ deskScenario: 's1' });
    expect(p.targets.get('desk:status:away')).toEqual({ deskStatus: 'away' });
    const typed = buildPalette(input({ typed: 'it-1042', desk: desk({ ticket: null }) }));
    expect(labels(typed, 'Desk')[0]).toBe('Open ticket IT-1042');
    expect(typed.targets.get('desk:number:IT-1042')).toEqual({ deskNumber: 'IT-1042' });
  });

  it('hidden without the keys: no work key, no replies, scenarios or status; no view key, no ticket jump', () => {
    const viewer = buildPalette(input({ typed: 'IT-1042', desk: desk({ work: false }) }));
    expect(labels(viewer, 'Desk')).toEqual(['Open ticket IT-1042']);
    expect(headings(buildPalette(input({ typed: 'IT-1042', desk: desk({ view: false, work: false }) })))).not.toContain('Desk');
    expect(headings(buildPalette(input({ typed: 'IT-1042' })))).not.toContain('Desk');
    // On a ticket the agent cannot work (a collaborator or observer): only their own status.
    expect(labels(buildPalette(input({ desk: desk({ ticket: { ...ticket, canWork: false } }) })), 'Desk').every((l) => l.startsWith('Set my status'))).toBe(true);
    // Words that are not a ticket number never offer a jump.
    expect(labels(buildPalette(input({ typed: 'leave', desk: desk({ ticket: null, work: false }) })), 'Desk')).toEqual([]);
  });
});

describe('+ New request types (T2-F 81, answer 2886)', () => {
  it('an employee: leave, attendance correction, expense claim, ticket and letter, each opening its live form', () => {
    expect(newRequestTypes(employeeNav, { self: true, help: true, job: false })).toEqual([
      { id: 'leave', href: '/yx/time/leave?apply=1' },
      { id: 'regularise', href: '/yx/time/attendance?request=regularise' },
      { id: 'expense', href: '/yx/expenses?new=1' },
      { id: 'ticket', href: '/yx/desk/help?new=1' },
      { id: 'letter', href: '/yx/me/documents/certificate' },
    ]);
  });
  it('no employee record: nothing of their own to raise; a job request only with the key and its menu entry', () => {
    expect(newRequestTypes(buildNav(base), { self: false, help: false, job: false })).toEqual([]);
    const hm = withAccount(buildNav({ ...base, employee: true, has: (k: string) => k === 'ats.requisition.raise' } as NavInput), { support: false, employee: true });
    expect(newRequestTypes(hm, { self: true, help: true, job: true }).map((t) => t.id)).toContain('job');
    expect(newRequestTypes(hm, { self: true, help: true, job: false }).map((t) => t.id)).not.toContain('job');
  });
});
