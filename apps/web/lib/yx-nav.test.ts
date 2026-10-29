import { accountLinks, activeLink, buildNav, panelOf, type NavInput } from './yx-nav';

// The menu by product area (design audit step 1). These replace the old WorkspaceShell menu tests: each link shows to
// exactly the people who may open its page, by the same keys as before.
const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false };
const nav = (keys: string[] = [], over: Partial<NavInput> = {}) => buildNav({ ...base, has: (k) => keys.includes(k), ...over });
const areas = (n: ReturnType<typeof buildNav>) => n.map((a) => a.id);
// An area's own panel: People's Me section is the separate "Me" panel (meOf).
const labels = (n: ReturnType<typeof buildNav>, id: string) => n.find((a) => a.id === id)?.sections.filter((s) => s.label !== 'Me').flatMap((s) => s.items.map((l) => l.label)) ?? [];
const sections = (n: ReturnType<typeof buildNav>, id: string) => n.find((a) => a.id === id)?.sections.filter((s) => s.label !== 'Me').map((s) => s.label ?? '') ?? [];
const meOf = (n: ReturnType<typeof buildNav>) => n.find((a) => a.id === 'people')?.sections.find((s) => s.label === 'Me')?.items.map((l) => l.label) ?? [];
const ME6 = ['Profile', 'Documents & letters', 'Change requests', 'Declarations', 'Privacy', 'My exit'];

describe('buildNav: areas', () => {
  it('someone with no keys and no record: Home (Home, Approvals, Notifications, Search, My requests) and the Helpdesk; nothing unbuilt', () => {
    const n = nav();
    expect(areas(n)).toEqual(['home', 'helpdesk']);
    expect(labels(n, 'home')).toEqual(['Home', 'Approvals', 'Notifications', 'Search', 'My requests']);
    expect(labels(n, 'helpdesk')).toEqual(['Help centre', 'Service catalogue', 'Chat with us']);
  });

  it('areas come in the designed rail order, Settings last; unbuilt modules never appear', () => {
    const n = nav(['employee.profile.view', 'payroll.run.view', 'statutory.filing.view', 'pipeline:manage', 'perf.goal.view', 'org.settings.manage'], { employee: true });
    expect(areas(n)).toEqual(['home', 'people', 'time', 'pay', 'compliance', 'hire', 'performance', 'helpdesk', 'settings']);
    for (const unbuilt of ['assess', 'learning', 'analytics', 'engage', 'projects', 'contract', 'visitors']) expect(areas(n)).not.toContain(unbuilt);
  });

  it('YukthiX Hiring for hiring; the exam tools not yet in YukthiX are one link to the older screens (19 Oct 2026)', () => {
    const all = nav(['exam:manage', 'pipeline:manage', 'candidate:manage']).flatMap((a) => a.sections.flatMap((s) => s.items));
    expect(all.filter((l) => l.href.startsWith('/v2')).map((l) => l.label)).toEqual(['Assessments & more (older screens)']);
    const hiringOnly = nav(['pipeline:manage', 'candidate:manage']).flatMap((a) => a.sections.flatMap((s) => s.items));
    expect(hiringOnly.filter((l) => l.href.startsWith('/v2'))).toEqual([]);
    expect(labels(nav(['pipeline:manage', 'candidate:view']), 'hire')).toEqual(['Jobs & requisitions', 'Interviews', 'Candidates & talent CRM', 'Talent pools']);
  });
});

describe('buildNav: People', () => {
  it('payroll does no HR work: no Probation, Change action, Bulk changes or Import (founder 21 Oct 2026)', () => {
    const n = nav(['employee.profile.view', 'employee.change.approve', 'employee.salary.manage', 'payroll.fnf.manage']);
    expect(labels(n, 'people')).toEqual(['Directory', 'Org chart', 'Scheduled', 'Job history', 'F&F']);
  });

  it('a menu item never shows where the page says no access: Possible same person only when the server counts it', () => {
    expect(labels(nav(['employee.profile.view', 'employee.change.manage']), 'people')).not.toContain('Possible same person');
    expect(labels(nav(['employee.profile.view', 'employee.change.manage'], { samePerson: true }), 'people')).toContain('Possible same person');
  });

  it('HR sees the designed sections: Onboarding, Changes and the rest by key', () => {
    const n = nav(['employee.profile.view', 'employee.change.manage'], { samePerson: true });
    expect(labels(n, 'people')).toEqual(['Directory', 'Org chart', 'Probation', 'Change action', 'Scheduled', 'Bulk changes', 'Restructure', 'Import', 'Job history', 'Possible same person']);
    expect(sections(n, 'people')).toEqual(['', 'Onboarding', 'Changes', 'More']);
    expect(meOf(n)).toEqual(['Profile']);
  });

  it('a manager without HR keys gets "For my team"; raising on behalf adds Change action', () => {
    const n = nav(['request.raise_on_behalf'], { employee: true, manager: true, history: true });
    expect(labels(n, 'people')).toEqual(['Directory', 'Org chart', 'My team', 'Probation', 'Change action', 'Exit cases', 'Job history']);
    expect(sections(n, 'people')).toEqual(['', 'For my team', 'Changes']);
  });

  it('an employee without reports sees the directory and their history; someone with no record sees no People area', () => {
    expect(labels(nav([], { employee: true, history: true }), 'people')).toEqual(['Directory', 'Org chart', 'Job history']);
    expect(areas(nav())).not.toContain('people');
  });

  it('lifecycle pages follow their keys and the person own tasks', () => {
    expect(labels(nav(['lifecycle.onboarding.view']), 'people')).toEqual(['Onboarding board', 'Buddies', 'Life events']);
    expect(labels(nav(['lifecycle.onboarding.manage']), 'people')).toEqual(['Onboarding board', 'Ready to onboard', 'Batches', 'Buddies', 'Life events', 'My checklist tasks']);
    expect(labels(nav(['lifecycle.exit.manage', 'employee.profile.view']), 'people')).toEqual(expect.arrayContaining(['Exit cases', 'Clearance', 'Retirements and contracts', 'Absconding', 'VRS schemes']));
    expect(labels(nav(['document.manage']), 'people')).toEqual(['Documents & letters', 'Re-verification']); // PPL-42 under More
    expect(nav(['document.manage'])[1].sections[0].items[0].count).toBe('documentsToVerify');
    expect(labels(nav([], { tasks: true }), 'people')).toEqual(['My checklist tasks']);
  });

  it('a new hire gets My first 30 days on Home (not in the six-item Me menu); others do not', () => {
    expect(labels(nav([], { employee: true, firstDays: true }), 'home')[5]).toBe('My first 30 days');
    expect(meOf(nav([], { employee: true, firstDays: true }))).toEqual(ME6);
    expect(labels(nav(['lifecycle.onboarding.view']), 'home')).not.toContain('My first 30 days');
  });

  it('the identity and bank queue for those who raise or decide', () => {
    expect(labels(nav(['employee.identity.approve']), 'people')).toEqual(['Identity and bank changes']);
  });
});

describe('buildNav: Time, Pay, Compliance', () => {
  it('an employee has My time; a manager adds the team pages', () => {
    expect(labels(nav([], { employee: true }), 'time')).toEqual(['My attendance', 'My leave', 'My shifts', 'Team roster', 'Office days', 'My timesheet', 'My overtime', 'My work-from-home days']);
    expect(labels(nav([], { employee: true, manager: true }), 'time').slice(0, 6)).toEqual(['Today', 'Muster', 'Exceptions', 'Roster', 'Open shifts', 'Auto-roster']);
    expect(sections(nav(['leave.settings.manage']), 'time')).toEqual(['Time settings']);
    // Founder answer A: Payroll with leave.liability.view alone gets one link, "Leave liability"; HR keeps "Leave balances".
    expect(labels(nav(['leave.liability.view']), 'time')).toEqual(['Leave liability']);
    expect(labels(nav(['leave.view', 'leave.liability.view']), 'time')).toContain('Leave balances');
    expect(labels(nav(['leave.view', 'leave.liability.view']), 'time')).not.toContain('Leave liability');
  });

  it('payroll set-up pages sit in Settings › Payroll & Statutory, by the batch-5b keys', () => {
    const n = nav(['payroll.setup.manage', 'payroll.template.manage', 'employee.salary.manage']);
    expect(labels(n, 'settings')).toEqual(['Payroll set-up', 'Pay groups', 'Payslip layout', 'Country packs', 'Salary templates']);
    expect(labels(n, 'compliance')).toEqual(['Statutory set-up', 'Statutory coverage']);
    expect(labels(n, 'pay')).toEqual(['Go-live readiness', 'Compensation']);
  });

  it('PAY-01: the runs page is "Payroll home" (founder decision 1, 29 Oct 2026); same route', () => {
    const n = nav(['payroll.run.view']);
    expect(labels(n, 'pay')[0]).toBe('Payroll home');
    expect(labels(n, 'pay')).not.toContain('Runs');
    expect(activeLink(n, '/yx/payroll/runs/r1')?.link.label).toBe('Payroll home');
  });

  it('payroll operations follow their own keys (PAY-10.09 … 10.16)', () => {
    const n = nav(['payroll.loan.manage', 'statutory.advisory.review']);
    expect(labels(n, 'pay')).toEqual(['Loans and advances']);
    expect(labels(n, 'compliance')).toEqual(['Rules & updates']);
  });

  it('PAY-24 Statutory bonus: payroll who works it out and the approver see it; nobody else does', () => {
    for (const key of ['payroll.bonus.manage', 'payroll.bonus.approve']) {
      const n = nav([key]);
      expect(labels(n, 'pay')).toEqual(['Statutory bonus']);
      expect(activeLink(n, '/yx/payroll/bonus')?.link.id).toBe('pay-bonus');
    }
    expect(labels(nav(['payroll.special.manage']), 'pay')).not.toContain('Statutory bonus');
    expect(labels(nav([], { employee: true }), 'pay')).not.toContain('Statutory bonus');
  });

  it('PAY-25 Payroll reports: shown with payroll.reports.view only (not to HR without payroll scope or employees)', () => {
    const n = nav(['payroll.reports.view']);
    expect(labels(n, 'pay')).toEqual(['Payroll reports']);
    expect(activeLink(n, '/yx/payroll/reports')?.link.id).toBe('pay-reports');
    expect(labels(nav(['employee.profile.view', 'employee.salary.view']), 'pay')).not.toContain('Payroll reports');
    expect(labels(nav([], { employee: true }), 'pay')).not.toContain('Payroll reports');
  });

  it('Expenses sit under Pay (founder decision 15 Oct 2026), each by its key', () => {
    expect(labels(nav(['expense.payout.manage', 'expense.report.view', 'expense.policy.manage']), 'pay')).toEqual(['To pay', 'Expense reports', 'Expense policy']);
    expect(labels(nav([], { employee: true }), 'pay')).toContain('Claims');
  });

  it('an employee has My pay; nobody in a support session sees pay, hiring, the desk or self-service', () => {
    expect(sections(nav([], { employee: true }), 'pay')).toEqual(['Expenses & advances', 'My pay']);
    const s = nav(['payroll.run.view', 'pipeline:manage', 'org.support_access.approve', 'org.yukthix_support.raise'], { support: true, role: 'super_admin', employee: true });
    expect(areas(s)).toEqual(['home', 'people', 'performance', 'settings']);
    expect(labels(s, 'home')).toEqual(['Home', 'Search']);
    expect(meOf(s)).toEqual(ME6);
    expect(labels(s, 'settings')).toEqual(['Legal entities', 'Locations', 'Structure', 'Security settings', 'Single sign-on providers', 'Login activity', 'Emails', 'Text messages (SMS)']);
  });
});

describe('buildNav: Settings', () => {
  it('a Payroll Admin profile on a non-admin role sees the organisation pages; pay-range access alone does too', () => {
    expect(labels(nav(['org.structure.view', 'pay.range.view']), 'settings')).toEqual(['Legal entities', 'Locations', 'Structure']);
    expect(labels(nav(['pay.range.view']), 'settings')).toEqual(['Legal entities', 'Locations', 'Structure']);
    // A manager who only reads the structure for pickers gets no Organisation pages (founder review 8 Oct 2026).
    expect(areas(nav(['org.structure.view']))).not.toContain('settings');
  });

  it('the settings admin gets company rules, Countries and Translations; set-up pages follow their keys', () => {
    expect(labels(nav(['org.settings.manage']), 'settings')).toEqual(['Legal entities', 'Locations', 'Structure', 'Company rules', 'Countries', 'Translations', 'Access and privacy', 'Custom fields']);
    expect(labels(nav(['perf.setup.manage']), 'settings')).toEqual(['Performance']);
    expect(labels(nav(['access.role.manage']), 'settings')).toEqual(['Roles & access']);
  });

  it('Restructure: HR plans it; payroll opens the done ones for its checklist (founder 28 Oct 2026); others do not see it', () => {
    expect(labels(nav(['employee.change.approve', 'payroll.run.prepare']), 'people')).toContain('Restructure');
    expect(labels(nav(['employee.change.approve']), 'people')).not.toContain('Restructure');
    expect(labels(nav(['employee.change.manage']), 'people')).toContain('Restructure');
  });
  it('the rest of the designed People menu: Succession, Union register and F&F (Payroll page) by their keys', () => {
    expect(labels(nav(['succession.manage']), 'people')).toEqual(['Succession']);
    // PPL-38: the HR diversity role.
    expect(labels(nav(['employee.disability.view']), 'people')).toEqual(['Declarations']);
    // PPL-43 / PPL-44: the compliance officer.
    expect(labels(nav(['compliance.declaration.manage']), 'people')).toEqual(['Regulated declarations', 'Pre-clearance requests']);
    expect(labels(nav(['lifecycle.exit.manage']), 'people')).toEqual(expect.arrayContaining(['Union register', 'VRS schemes']));
    const hr = nav(['employee.profile.view', 'payroll.fnf.manage']);
    expect(labels(hr, 'people')).toContain('F&F');
    expect(labels(nav(['employee.profile.view']), 'people')).not.toContain('F&F');
    // One F&F page, two addresses: the menu stays in the area it was opened from.
    expect(activeLink(hr, '/yx/people/fnf')?.area.id).toBe('people');
    expect(activeLink(hr, '/yx/payroll/fnf')?.area.id).toBe('pay');
  });
  it('a System Admin finds security, Support access, Emails and Contact YukthiX', () => {
    const n = nav(['org.support_access.approve', 'notification.template.manage', 'org.yukthix_support.raise'], { role: 'org_admin' });
    expect(labels(n, 'settings')).toEqual(['Security settings', 'Single sign-on providers', 'Login activity', 'Support access', 'Emails', 'Text messages (SMS)', 'Contact YukthiX']);
    expect(labels(nav([], { role: 'auditor' }), 'settings')).toEqual(['Login activity']);
    expect(labels(nav(), 'settings')).toEqual([]);
  });
});

describe('activeLink and meLinks', () => {
  const n = nav(['employee.profile.view', 'employee.identity.approve', 'perf.goal.manage', 'perf.cycle.manage'], { employee: true });
  it('picks the longest matching link, so a sub-page lights up its own entry', () => {
    expect(activeLink(n, '/yx/people/profile-requests')?.link.label).toBe('Identity and bank changes');
    expect(activeLink(n, '/yx/performance/cycles/c-1')?.link.label).toBe('Review cycles');
    expect(activeLink(n, '/yx/performance')?.link.label).toBe('Goals');
    expect(activeLink(n, '/yx/nowhere')).toBeNull();
  });
  it('the designed Me menu (PPL-30), and the personal settings in the avatar menu', () => {
    expect(meOf(n)).toEqual(ME6);
    expect(activeLink(n, '/yx/me/letters')).toBeNull();
    expect(accountLinks({ support: false, employee: true }).map((l) => l.label)).toEqual(['Delegation', 'Notification preferences', 'My assets', 'Language', 'My security']);
    expect(accountLinks({ support: true, employee: false }).map((l) => l.label)).toEqual(['My security']);
  });
});

describe('the Me menu under People (founder 28 Oct 2026: follow the design)', () => {
  const people = (n: ReturnType<typeof buildNav>) => n.find((a) => a.id === 'people')!;
  it('has exactly the six designed entries, also for a designated person; nothing of Me is left on Home', () => {
    const n = nav([], { employee: true, designated: true });
    expect(meOf(n)).toEqual(ME6);
    expect(n.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.label)))).not.toEqual(expect.arrayContaining(['Annual declarations']));
    expect(labels(n, 'home')).toEqual(['Home', 'Approvals', 'Notifications', 'Search', 'My requests']);
    // The annual declarations' count shows on Declarations; for anyone else it has none.
    expect(people(n).sections.flatMap((s) => s.items).find((l) => l.label === 'Declarations')?.count).toBe('declarationsDue');
    expect(people(nav([], { employee: true })).sections.flatMap((s) => s.items).find((l) => l.label === 'Declarations')?.count).toBeUndefined();
  });
  it('an employee with no People work opens People on Me; HR and managers open it on the directory', () => {
    expect(people(nav([], { employee: true })).sections[0].items[0].label).toBe('Profile');
    expect(people(nav(['employee.profile.view'], { employee: true })).sections[0].items[0].label).toBe('Directory');
    expect(people(nav([], { employee: true, manager: true })).sections[0].items[0].label).toBe('Directory');
  });
  it('on a Me page the panel is "Me" with the six; elsewhere the People panel without them; the moved declarations light up Declarations', () => {
    const n = nav(['employee.profile.view'], { employee: true, designated: true });
    const hit = activeLink(n, '/yx/me/declarations/annual')!;
    expect(hit.link.label).toBe('Declarations');
    expect(panelOf(hit.area, hit.link.id)).toEqual({ title: 'Me', sections: [{ items: expect.any(Array) }] });
    expect(panelOf(hit.area, hit.link.id).sections[0].items.map((l) => l.label)).toEqual(ME6);
    const dir = activeLink(n, '/yx/people/directory')!;
    expect(panelOf(dir.area, dir.link.id).title).toBe('People');
    expect(panelOf(dir.area, dir.link.id).sections.flatMap((s) => s.items.map((l) => l.label))).not.toContain('Privacy');
    expect(activeLink(n, '/yx/me/declarations/pre-clearance')?.link.label).toBe('Declarations');
  });
});
