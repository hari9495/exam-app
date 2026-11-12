import { accountLinks, activeLink, buildNav, pageLink, panelOf, samePersonInMenu, type NavInput } from './yx-nav';

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
    expect(labels(n, 'helpdesk')).toEqual(['Help centre', 'Policies', 'Speak up', 'Report an accident', 'My cases', 'Service catalogue', 'Chat with us']);
  });

  it('areas come in the designed rail order, Settings last; unbuilt modules never appear', () => {
    const n = nav(['employee.profile.view', 'payroll.run.view', 'statutory.filing.view', 'pipeline:manage', 'perf.goal.view', 'org.settings.manage'], { employee: true });
    expect(areas(n)).toEqual(['home', 'people', 'time', 'pay', 'compliance', 'hire', 'performance', 'helpdesk', 'visitors', 'settings']);
    for (const unbuilt of ['assess', 'learning', 'analytics', 'engage', 'projects', 'contract']) expect(areas(n)).not.toContain(unbuilt);
  });

  it('YukthiX Hiring for hiring; the exam tools not yet in YukthiX are one link to the older screens (19 Oct 2026)', () => {
    const all = nav(['exam:manage', 'pipeline:manage', 'candidate:manage']).flatMap((a) => a.sections.flatMap((s) => s.items));
    expect(all.filter((l) => l.href.startsWith('/v2')).map((l) => l.label)).toEqual(['Assessments & more (older screens)']);
    const hiringOnly = nav(['pipeline:manage', 'candidate:manage']).flatMap((a) => a.sections.flatMap((s) => s.items));
    expect(hiringOnly.filter((l) => l.href.startsWith('/v2'))).toEqual([]);
    expect(labels(nav(['pipeline:manage', 'candidate:view']), 'hire')).toEqual(['Jobs & requisitions', 'Requisitions', 'Interviews', 'Candidates & talent CRM', 'Talent CRM', 'Referrals', 'Vendors', 'All referrals', 'Bias audits']);
  });

  it('HIR-10: Background checks only for HR with the background-check key', () => {
    expect(labels(nav(['pipeline:manage', 'candidate:manage']), 'hire')).not.toContain('Background checks');
    expect(labels(nav(['pipeline:manage', 'lifecycle.bgv.manage']), 'hire')).toContain('Background checks');
  });
});

describe('buildNav: scorecard templates (answer 345)', () => {
  it('live on Settings › Hiring; no Scorecards menu item and nothing points at the old page', () => {
    const all = nav(['pipelines:configure']).flatMap((a) => a.sections.flatMap((s) => s.items));
    expect(all.map((l) => l.href)).toContain('/yx/settings/hiring');
    for (const keys of [['pipelines:configure'], ['pipeline:manage', 'pipelines:configure', 'ats.settings.manage']])
      expect(nav(keys).flatMap((a) => a.sections.flatMap((s) => s.items)).filter((l) => /scorecards$/.test(l.href) || l.label === 'Scorecards')).toEqual([]);
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

  it('Possible same person stays after a merge with nothing waiting (the server sends a count of 0 for 90 days); a support session never sees it', () => {
    const hr = ['employee.profile.view', 'employee.change.manage'];
    expect(labels(nav(hr, { samePerson: samePersonInMenu({ possibleSamePerson: 0 }) }), 'people')).toContain('Possible same person');
    expect(labels(nav(hr, { samePerson: samePersonInMenu({}) }), 'people')).not.toContain('Possible same person');
    expect(samePersonInMenu(undefined)).toBe(false);
    expect(labels(nav(hr, { samePerson: true, support: true }), 'people')).not.toContain('Possible same person');
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
    expect(labels(n, 'settings')).toEqual(['All settings', 'Payroll set-up', 'Payroll policies', 'Payslip settings', 'Tax', 'Bonus & loan rules', 'Pay groups', 'Payslip layout', 'Country packs', 'Salary templates']);
    // Founder answer 19 (30 Oct 2026): the item opens the rules page, so it is "Statutory rules"; registrations stay in Payroll set-up.
    expect(labels(n, 'compliance')).toEqual(['Statutory rules', 'Statutory coverage']);
    expect(activeLink(n, '/yx/payroll/statutory-rules')?.link.label).toBe('Statutory rules');
    expect(labels(n, 'settings')).toContain('Payroll set-up');
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
    expect(labels(nav(['expense.payout.manage', 'expense.report.view', 'expense.policy.manage']), 'pay')).toEqual(['Advances', 'To pay', 'Card statements', 'Expense reports', 'Expense policy']);
    expect(labels(nav([], { employee: true }), 'pay')).toEqual(expect.arrayContaining(['Expenses', 'Trips', 'Advances']));
    expect(labels(nav([], { employee: true }), 'pay')).not.toContain('Team claims');
    expect(labels(nav([], { employee: true, manager: true }), 'pay')).toContain('Team claims');
    expect(labels(nav(['travel.booking.manage']), 'pay')).toContain('Trips');
  });

  // Walk-through 3 Nov 2026: the breadcrumb named /yx/expenses "Pay › Claims" while its title is "Expenses".
  const pays = nav([], { employee: true, manager: true });
  it.each([
    ['/yx/expenses', 'Expenses'],
    ['/yx/expenses/claims/c1', 'Expenses'],
    ['/yx/expenses/team', 'Team claims'],
    ['/yx/expenses/trips', 'Trips'],
    ['/yx/expenses/trips/t1', 'Trips'],
    ['/yx/expenses/advances', 'Advances'],
    ['/yx/expenses/advances/a1', 'Advances'],
    ['/yx/expenses/card-lines', 'Expenses'],
  ])('the breadcrumb of %s names "%s" under Pay', (path, label) => {
    expect(pageLink(pays, path)).toMatchObject({ area: { id: 'pay' }, link: { label }, inMenu: true });
  });

  it('an employee has My pay; nobody in a support session sees pay, hiring, the desk or self-service', () => {
    expect(sections(nav([], { employee: true }), 'pay')).toEqual(['Expenses & advances', 'My pay']);
    const s = nav(['payroll.run.view', 'pipeline:manage', 'org.support_access.approve', 'org.yukthix_support.raise'], { support: true, role: 'super_admin', employee: true });
    expect(areas(s)).toEqual(['home', 'people', 'performance', 'settings']);
    expect(labels(s, 'home')).toEqual(['Home', 'Search']);
    expect(meOf(s)).toEqual(ME6);
    expect(labels(s, 'settings')).toEqual(['All settings', 'Legal entities', 'Locations', 'Structure', 'Security settings', 'Single sign-on providers', 'Login activity', 'Emails', 'Text messages (SMS)']);
  });
});

describe('buildNav: Settings', () => {
  it('a Payroll Admin profile on a non-admin role sees the organisation pages; pay-range access alone does too', () => {
    expect(labels(nav(['org.structure.view', 'pay.range.view']), 'settings')).toEqual(['All settings', 'Legal entities', 'Locations', 'Structure']);
    expect(labels(nav(['pay.range.view']), 'settings')).toEqual(['All settings', 'Legal entities', 'Locations', 'Structure']);
    // A manager who only reads the structure for pickers gets no Organisation pages (founder review 8 Oct 2026).
    expect(areas(nav(['org.structure.view']))).not.toContain('settings');
  });

  it('the settings admin gets the S-7 pages (no retired Company rules), Countries and Translations; set-up pages follow their keys', () => {
    expect(labels(nav(['org.settings.manage']), 'settings')).toEqual(['All settings', 'Set-up hub', 'Legal entities', 'Locations', 'Structure', 'Countries', 'Translations', 'Company & branding', 'Employee records', 'Set-up hub settings', 'Policies', 'Help and tips', 'Expense settings', 'Performance settings', 'Custom fields', 'Approvals', 'Access requests', 'Directory & privacy', 'Security rules', 'Onboarding & probation', 'Job changes & transfers', 'Exit & lifecycle policies', 'Employee relations & cases', 'Audit & data retention', 'Approval policies', 'Attendance modes', 'Check-in & devices', 'Shifts & patterns', 'Weekly offs', 'Late & regularisation', 'Leave types', 'Holiday calendars', 'Leave year', 'Projects & timesheets', 'Visitors', 'Payroll policies', 'Payslip settings', 'Tax', 'Bonus & loan rules', 'Contract labour', 'Hiring', 'Staffing desk']);
    // Settings 6.1 Hiring: recruiting, hiring admins and HR read it (the API decides who changes it).
    expect(labels(nav(['ats.settings.manage']), 'settings')).toEqual(['All settings', 'Hiring']);
    expect(labels(nav(['pipeline:manage']), 'settings')).toEqual(['All settings', 'Hiring']);
    expect(labels(nav(['ats.requisition.raise']), 'settings')).not.toContain('Hiring');
    // Visitors slice 1: an employee invites their visitors; reception gets the desk and log; Settings 3.12 for its holders.
    expect(labels(nav([], { employee: true }), 'visitors')).toEqual(['My visitors']);
    expect(labels(nav(['visitors.desk.manage'], { employee: true }), 'visitors')).toEqual(["Today's visitors", 'My visitors', 'Visitor log', 'Roll-call']);
    // Slice 4: security and HR get only the roll-call.
    expect(labels(nav(['visitors.rollcall.view']), 'visitors')).toEqual(['Roll-call']);
    expect(labels(nav(['visitors.log.view']), 'visitors')).toEqual(['Visitor log']);
    expect(labels(nav(['visitors.settings.manage']), 'settings')).toEqual(['All settings', 'Visitors']);
    // Slice 3: the watch-list only with its key; reception does not see it.
    expect(labels(nav(['visitors.watchlist.manage', 'visitors.log.view']), 'visitors')).toEqual(['Visitor log', 'Watch-list']);
    expect(labels(nav(['visitors.desk.manage']), 'visitors')).not.toContain('Watch-list');
    // Founder 30 Oct 2026 (last 10, item 5): Payroll rules for HR (org.settings.manage) or payroll set-up, never for others.
    expect(labels(nav(['payroll.run.view']), 'settings')).not.toContain('Payroll rules');
    expect(labels(nav(['perf.setup.manage']), 'settings')).toEqual(['All settings', 'Performance', 'Performance settings']);
    expect(labels(nav(['access.role.manage']), 'settings')).toEqual(['All settings', 'Roles & access']);
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
    expect(labels(n, 'settings')).toEqual(['All settings', 'Security settings', 'Single sign-on providers', 'Login activity', 'Support access', 'Emails', 'Text messages (SMS)', 'Contact YukthiX']);
    expect(labels(nav([], { role: 'auditor' }), 'settings')).toEqual(['Login activity']);
    expect(labels(nav(), 'settings')).toEqual([]);
  });
});

describe('activeLink and meLinks', () => {
  const n = nav(['employee.profile.view', 'employee.identity.approve', 'perf.goal.manage', 'perf.cycle.manage'], { employee: true });
  it('picks the longest matching link, so a sub-page lights up its own entry', () => {
    expect(activeLink(n, '/yx/people/profile-requests')?.link.label).toBe('Identity and bank changes');
    expect(activeLink(n, '/yx/performance/cycles/c-1')?.link.label).toBe('Review cycles');
    expect(activeLink(n, '/yx/performance')?.link.label).toBe('Performance home');
    expect(activeLink(n, '/yx/performance/goals')?.link.label).toBe('Goals');
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

describe('pageLink: each Performance page names itself (walk-through 3 Nov 2026)', () => {
  const employee = nav([], { employee: true });
  const hr = nav(['perf.cycle.manage', 'perf.calibration.facilitate', 'perf.setup.manage', 'perf.dispute.manage', 'perf.goal.view', 'perf.comp.manage'], { employee: true, manager: true });
  const pages: [string, string][] = [
    ['/yx/performance/calibrations', 'Calibration & comp review'],
    ['/yx/performance/calibrations/c1', 'Calibration & comp review'],
    ['/yx/performance/disputes', 'Rating disputes'],
    ['/yx/performance/disputes/d1', 'Rating disputes'],
    ['/yx/performance/competencies', 'Skills & competencies'],
    ['/yx/performance/coach', 'Manager coach'],
    ['/yx/performance/goal-map', 'Goal map'],
    ['/yx/performance/handovers', 'Hand-over list'],
    ['/yx/performance/comp/market', 'Market data'],
    ['/yx/performance/comp/c1', 'Comp review'],
  ];
  it.each(pages)('%s is "%s" and highlighted for someone whose menu has it', (path, label) => {
    expect(pageLink(hr, path)).toMatchObject({ link: { label }, inMenu: true });
  });
  it.each(pages)('%s is still "%s" (never Performance home) by direct address, with nothing highlighted', (path, label) => {
    expect(pageLink(employee, path)).toMatchObject({ area: { id: 'performance' }, link: { label }, inMenu: false });
  });
  it('a sub-page without its own entry lights up its parent; the area root is itself', () => {
    expect(pageLink(employee, '/yx/performance/reviews/r1/dispute')).toMatchObject({ link: { label: 'Performance home' }, inMenu: true });
    expect(pageLink(employee, '/yx/performance')).toMatchObject({ link: { label: 'Performance home' }, inMenu: true });
  });
});

describe('pageLink: the Help centre names itself (HLP-01, Helpdesk design wiring round 1)', () => {
  it.each(['/yx/desk/help', '/yx/desk/help/t1'])('%s reads Helpdesk › Help centre', (path) => {
    expect(pageLink(nav([], { employee: true }), path)).toMatchObject({ area: { id: 'helpdesk' }, link: { label: 'Help centre' }, inMenu: true });
  });
});

describe('pageLink: Policies and Policy admin name themselves (HLP-10 / HLP-11)', () => {
  it('every employee has Helpdesk › Policies', () => {
    expect(pageLink(nav([], { employee: true }), '/yx/desk/policies')).toMatchObject({ area: { id: 'helpdesk' }, link: { label: 'Policies' }, inMenu: true });
  });
  it('Policy admin only with policy.manage or policy.publish', () => {
    expect(pageLink(nav(['policy.manage'], { employee: true }), '/yx/desk/policy-admin')).toMatchObject({ link: { label: 'Policy admin' }, inMenu: true });
    expect(pageLink(nav(['policy.publish'], { employee: true }), '/yx/desk/policy-admin')).toMatchObject({ link: { label: 'Policy admin' }, inMenu: true });
    expect(pageLink(nav([], { employee: true }), '/yx/desk/policy-admin')?.inMenu).not.toBe(true);
    expect(pageLink(nav(['policy.manage'], { employee: true }), '/yx/desk/policy-writer')).toMatchObject({ link: { label: 'Write policies with AI' }, inMenu: true });
    expect(pageLink(nav(['policy.publish'], { employee: true }), '/yx/desk/policy-writer')?.inMenu).not.toBe(true);
  });
});

describe('Cases and Ethics desk only for the people they concern (HLP-07/08/09, founder answer 36)', () => {
  const desk = (over: Partial<NavInput>) => labels(nav([], { employee: true, ...over }), 'helpdesk');
  it('My cases for everyone; Cases with the case-team flag; Ethics desk with the ethics flag; never in a support session', () => {
    expect(desk({})).toEqual(expect.arrayContaining(['My cases']));
    expect(desk({})).not.toEqual(expect.arrayContaining(['Cases']));
    expect(desk({})).not.toEqual(expect.arrayContaining(['Ethics desk']));
    expect(desk({ caseTeam: true })).toEqual(expect.arrayContaining(['My cases', 'Cases']));
    expect(desk({ caseTeam: true })).not.toEqual(expect.arrayContaining(['Ethics desk']));
    expect(desk({ caseTeam: true, ethicsDesk: true })).toEqual(expect.arrayContaining(['Cases', 'Ethics desk']));
    expect(desk({ caseTeam: true, ethicsDesk: true, support: true })).not.toEqual(expect.arrayContaining(['Cases']));
  });
  it('Report misconduct only for a manager (answer 55), never in a support session', () => {
    expect(desk({ manager: true })).toEqual(expect.arrayContaining(['Report misconduct']));
    expect(desk({ manager: false })).not.toEqual(expect.arrayContaining(['Report misconduct']));
    expect(desk({ manager: true, support: true })).not.toEqual(expect.arrayContaining(['Report misconduct']));
  });
  it('the menu items carry the counts', () => {
    const items = nav([], { employee: true, caseTeam: true, ethicsDesk: true }).find((a) => a.id === 'helpdesk')!.sections.flatMap((x) => x.items);
    expect(items.find((l) => l.label === 'Cases')?.count).toBe('casesOpen');
    expect(items.find((l) => l.label === 'Ethics desk')?.count).toBe('ethicsReports');
  });
});

describe('pageLink: Speak up and its set-up name themselves (HLP-06)', () => {
  it('every employee has Helpdesk › Speak up; the set-up only with speakup.setup.manage', () => {
    expect(pageLink(nav([], { employee: true }), '/yx/desk/speakup')).toMatchObject({ area: { id: 'helpdesk' }, link: { label: 'Speak up' }, inMenu: true });
    expect(pageLink(nav(['speakup.setup.manage'], { employee: true }), '/yx/desk/speakup-setup')).toMatchObject({ link: { label: 'Speak-up set-up' }, inMenu: true });
    expect(pageLink(nav(['policy.manage'], { employee: true }), '/yx/desk/speakup-setup')?.inMenu).not.toBe(true);
  });

  it('contract labour CL-1: Contractors for the contractor keys, Settings 4.9 without payroll; never in support', () => {
    expect(labels(nav(['clra.contractor.view']), 'contract')).toEqual(['Contractors', 'Contract workers', 'Attendance', 'Vendor compliance', 'CLRA registers & returns', 'Client establishments', 'Own licences', 'Client compliance packs']);
    expect(labels(nav(['clra.contractor.manage']), 'settings')).toContain('Contract labour');
    expect(labels(nav(['clra.settings.manage']), 'settings')).toContain('Contract labour');
    expect(areas(nav(['clra.settings.manage']))).not.toContain('contract');
    expect(areas(nav([]))).not.toContain('contract');
    expect(areas(nav(['clra.contractor.manage'], { support: true }))).not.toContain('contract');
  });
});

describe('buildNav: Projects (P-1, answer 1401)', () => {
  it('Projects shows only when the server says it is on and this person may open it; never on a support session', () => {
    expect(areas(nav(['projects.manage']))).not.toContain('projects');
    expect(labels(nav([], { projects: true }), 'projects')).toEqual(['Projects', 'Capacity & utilisation', 'Resource requests', 'Timesheet approvals']);
    expect(areas(nav([], { projects: true, support: true }))).not.toContain('projects');
    const n = nav(['pipeline:manage'], { projects: true });
    expect(areas(n).indexOf('projects')).toBe(areas(n).indexOf('hire') + 1);
  });

  it('Settings › Projects & timesheets for System Admins and Projects managers, even while Projects is off', () => {
    expect(labels(nav(['org.settings.manage']), 'settings')).toContain('Projects & timesheets');
    expect(labels(nav(['projects.manage']), 'settings')).toEqual(['All settings', 'Projects & timesheets']);
    expect(labels(nav(['projects.view']), 'settings')).not.toContain('Projects & timesheets');
  });
});

describe('buildNav: timesheet mapping rules (P-3, PRJ-08)', () => {
  it('Projects managers and System Admins once Projects is on; never otherwise', () => {
    expect(labels(nav(['projects.manage'], { projects: true }), 'settings')).toEqual(['All settings', 'Projects & timesheets', 'Timesheet mapping rules']);
    expect(labels(nav(['projects.manage']), 'settings')).not.toContain('Timesheet mapping rules');
    expect(labels(nav(['projects.view'], { projects: true }), 'settings')).not.toContain('Timesheet mapping rules');
    expect(labels(nav(['projects.manage'], { projects: true, support: true }), 'settings')).not.toContain('Timesheet mapping rules');
  });
});

describe('buildNav: timesheet approvals (P-2, PRJ-02)', () => {
  it('for Projects people, and for anyone with lines waiting for them (a reporting manager needs no key)', () => {
    expect(labels(nav([], { projects: true }), 'projects')).toEqual(['Projects', 'Capacity & utilisation', 'Resource requests', 'Timesheet approvals']);
    expect(labels(nav([], { lineApprovals: 2 }), 'projects')).toEqual(['Timesheet approvals']);
    expect(areas(nav([], { lineApprovals: 0 }))).not.toContain('projects');
    expect(areas(nav([], { lineApprovals: 2, support: true }))).not.toContain('projects');
  });
});

describe('buildNav: Costing & margin (P-5, PRJ-04)', () => {
  it('only for Projects finance, once Projects is on', () => {
    expect(labels(nav(['projects.finance'], { projects: true }), 'projects')).toContain('Costing & margin');
    expect(labels(nav(['projects.manage'], { projects: true }), 'projects')).not.toContain('Costing & margin');
    expect(labels(nav(['projects.finance']), 'projects')).not.toContain('Costing & margin');
  });
});

describe('buildNav: Billing workbench (P-6, PRJ-05)', () => {
  it('for Projects finance and account managers once Projects is on; never otherwise', () => {
    expect(labels(nav(['projects.finance'], { projects: true }), 'projects')).toContain('Billing workbench');
    expect(labels(nav(['ats.staffing.manage'], { projects: true }), 'projects')).toContain('Billing workbench');
    expect(labels(nav(['projects.manage'], { projects: true }), 'projects')).not.toContain('Billing workbench');
    expect(labels(nav(['projects.finance']), 'projects')).not.toContain('Billing workbench');
    expect(areas(nav(['projects.finance'], { projects: true, support: true }))).not.toContain('projects');
  });
});

// Settings S-5 (answers 1333, 1563).
describe('buildNav: Settings S-5', () => {
  it('a Time admin opens every Time & Leave settings page (the attendance ones read-only); the structure key alone opens none', () => {
    const t = labels(nav(['leave.settings.manage']), 'settings');
    for (const l of ['Check-in & devices', 'Weekly offs', 'Leave types', 'Leave year']) expect(t).toContain(l);
    expect(areas(nav(['org.structure.view']))).not.toContain('settings');
  });

  it('HR who read the structure open the People settings pages read-only; the audit log needs audit.view', () => {
    expect(labels(nav(['employee.profile.view', 'org.structure.view']), 'settings')).toEqual(expect.arrayContaining(['Exit & lifecycle policies', 'Audit & data retention']));
    expect(labels(nav(['audit.view']), 'settings')).toContain('Audit log');
    expect(labels(nav(['org.settings.manage']), 'settings')).not.toContain('Audit log');
  });
});

// Settings S-6 (answer 1330).
describe('buildNav: Settings S-6', () => {
  it('HR with the settings key, and those who read the company settings, see Approvals and Approval policies', () => {
    expect(labels(nav(['org.settings.manage']), 'settings')).toEqual(expect.arrayContaining(['Approvals', 'Approval policies']));
    expect(labels(nav(['employee.profile.view', 'org.structure.view']), 'settings')).toEqual(expect.arrayContaining(['Approvals', 'Approval policies']));
    expect(labels(nav(['leave.settings.manage']), 'settings')).not.toContain('Approval policies');
  });
});
