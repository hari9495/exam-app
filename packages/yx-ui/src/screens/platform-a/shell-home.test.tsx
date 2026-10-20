import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AccessStateBody, RoleHomeScreen, SearchResultsScreen, explainedHits, paletteFor, searchableFor, type SearchHit } from './shell-home';
import { ToastProvider } from '../../components/notify';

describe('Role home loading (founder review 30 Sep 2026)', () => {
  it('keeps the clock usable while every other widget loads, and announces once', () => {
    render(<RoleHomeScreen persona="manager" data={{ actions: [] }} loading />);
    expect(screen.getByRole('button', { name: /clock out/i })).toBeEnabled();
    const home = screen.getByRole('region', { name: 'Your home' });
    expect(home).toHaveAttribute('aria-busy', 'true');
    expect(within(home).getAllByRole('status').filter((s) => s.textContent === 'Loading your home')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Team today' })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows slow and failed widgets with Retry while the rest of the page works', () => {
    render(<RoleHomeScreen persona="manager" data={{ actions: [] }} widgetStates={{ today: 'slow', goals: 'error' }} />);
    expect(screen.getByText('Taking longer than usual.')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load goals and 1:1s.")).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2);
    expect(screen.getByText("Who's off this week")).toBeInTheDocument();
  });

  it('keeps the clock pinned: no remove option in edit mode', () => {
    render(<RoleHomeScreen persona="hr" data={{ actions: [] }} editing customisable />);
    expect(screen.queryByRole('button', { name: 'Options for Attendance today' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Options for Due dates' })).toBeInTheDocument();
    expect(screen.getByText('Always shown')).toBeInTheDocument();
    expect(screen.getByText(/Needs your action and Attendance today always stay first/)).toBeInTheDocument();
  });
});

describe('Recruiter home (founder decision 19 Oct 2026)', () => {
  const today = new Date(2026, 8, 29, 9, 42);
  const hiring = {
    interviewsToday: [{ id: 'i1', at: new Date(2026, 8, 29, 11, 0), candidate: 'Ananya Kulkarni', job: 'Quality Analyst', href: '/yx/hiring/interviews/i1' }],
    interviewsHref: '/yx/hiring/interviews',
    week: { applied: 18, interview: 6, offers: 2, hired: 1 },
    jobs: [{ id: 'j1', title: 'Quality Analyst', href: '/yx/hiring/jobs/j1', stages: [{ name: 'Applied', count: 12 }, { name: 'Screened', count: 5 }] }],
    jobsHref: '/yx/hiring/jobs',
  };
  const live = { firstName: 'Neha', company: 'Kaveri Foods', today, approvalsHref: '/yx/hiring/jobs', hiring };
  const scorecard = { id: 'r1', type: 'Scorecard', title: 'Write your scorecard · Quality Analyst', who: 'Ananya Kulkarni', kind: 'review' as const, actionLabel: 'Write scorecard', href: '/yx/hiring/interviews/i9' };

  it('opens each action row on its hiring page', () => {
    render(<RoleHomeScreen persona="recruiter" data={{ actions: [scorecard] }} live={live} />);
    expect(screen.getByRole('link', { name: 'Write scorecard: Write your scorecard · Quality Analyst' })).toHaveAttribute('href', '/yx/hiring/interviews/i9');
  });

  it("shows today's interviews, this week's counts and the open jobs with candidates per stage", () => {
    render(<RoleHomeScreen persona="recruiter" data={{ actions: [] }} live={live} />);
    expect(screen.getByRole('link', { name: 'Ananya Kulkarni' })).toHaveAttribute('href', '/yx/hiring/interviews/i1');
    expect(screen.getByRole('region', { name: 'New applicants this week' })).toHaveTextContent('18');
    expect(screen.getByRole('region', { name: 'Hired this week' })).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: 'Quality Analyst' })).toHaveAttribute('href', '/yx/hiring/jobs/j1');
    expect(screen.getByText('Applied 12 · Screened 5')).toBeInTheDocument();
    expect(screen.getByText('17 candidates')).toBeInTheDocument();
    expect(screen.getByText('Your interviews, offers and the candidates waiting for you.', { exact: false })).toBeInTheDocument();
  });

  it('says so when there is nothing yet, and leaves out jobs and counts for a panellist', () => {
    render(<RoleHomeScreen persona="recruiter" data={{ actions: [] }} live={{ ...live, hiring: { ...hiring, interviewsToday: [], week: undefined, jobs: undefined } }} />);
    expect(screen.getByText('No interviews for you today.')).toBeInTheDocument();
    expect(screen.getByText('Nothing needs your action.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'My open jobs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'New applicants this week' })).not.toBeInTheDocument();
  });

  it('adds the recruiter widgets to an HR home without replacing it', () => {
    render(<RoleHomeScreen persona="hr" data={{ actions: [] }} live={{ ...live, stats: [{ id: 'cases', title: 'Open cases', label: 'Open cases', value: 9, drill: { label: 'View helpdesk', href: '#' } }] }} />);
    expect(screen.getAllByRole('region', { name: 'Open cases' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'My open jobs' })).toBeInTheDocument();
  });
});

describe('Live home parity (19 Oct 2026)', () => {
  const today = new Date(2026, 8, 29, 9, 42);
  const base = { firstName: 'Lakshmi', company: 'Kaveri Foods', today, approvalsHref: '/yx/approvals' };
  const card = (id: string, label: string, extra = {}) => ({ id, title: label, label, value: 3, drill: { label: 'Open', href: '#' }, ...extra });

  it('names the person on each action row, and never draws an empty avatar', () => {
    render(<RoleHomeScreen persona="hr" data={{ actions: [{ id: 'a', type: 'Leave', title: 'Casual leave, 27 Oct', who: 'Meera Iyer', kind: 'review' }, { id: 'b', type: 'Leave', title: 'Sick leave', who: '', kind: 'review' }] }} live={base} />);
    expect(screen.getByText('Meera Iyer')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((li) => li.querySelector('.yx-avatar') && !li.textContent?.includes('Meera'))).toHaveLength(0);
  });

  it('says how a count changed since last month only when last month is on record, and words an empty count', () => {
    render(<RoleHomeScreen persona="hr" data={{ actions: [] }} live={{ ...base, stats: [card('exceptions', 'Attendance exceptions', { value: 27, previous: 41, previousLabel: 'August' }), card('cases', 'Open cases'), card('notReady', 'Not ready for payroll', { empty: 'No payroll run for September yet' })] }} />);
    expect(screen.getByText('14 fewer than August')).toBeInTheDocument();
    expect(screen.getByText('No payroll run for September yet')).toBeInTheDocument();
    expect(screen.queryByText(/than/, { selector: '[aria-label="Open cases"] *' })).not.toBeInTheDocument();
  });

  it('fills each row: three cards share it, a lone card takes it all', () => {
    const { container } = render(<RoleHomeScreen persona="hr" data={{ actions: [] }} live={{ ...base, stats: [card('a', 'Alpha count'), card('b', 'Beta count'), card('c', 'Gamma count')], due: [{ id: 'd', text: 'Probation confirmations', href: '#' }] }} />);
    const size = (title: string) => [...container.querySelectorAll('.yx-widget')].find((w) => w.textContent?.includes(title))?.getAttribute('data-size');
    expect(['Alpha count', 'Beta count', 'Gamma count'].map((t) => size(t))).toEqual(['4', '4', '4']);
    expect(size('Probation confirmations')).toBe('12');
  });

  it('shows the employee their tasks and what is coming up, with empty states', () => {
    render(<RoleHomeScreen persona="employee" data={{ actions: [] }} live={{ ...base, tasks: [{ text: 'Write your self-review for H1 by 15 Oct', href: '/yx/performance/reviews/r1' }], coming: [] }} />);
    expect(screen.getByRole('link', { name: 'Write your self-review for H1 by 15 Oct' })).toHaveAttribute('href', '/yx/performance/reviews/r1');
    expect(screen.getByText('Nothing coming up this week.')).toBeInTheDocument();
  });

  it('shows the employee their own net pay in place of late marks, hidden until they ask', async () => {
    const stats = [card('leave', 'Earned leave left'), card('late', 'Late marks this month'), card('requests', 'Requests pending')];
    const pay = { label: 'Net pay, September', value: 86420, previous: 84900, previousLabel: 'August', href: '/yx/me/payslips' };
    const { rerender } = render(<RoleHomeScreen persona="employee" data={{ actions: [] }} live={{ ...base, stats }} />);
    expect(screen.getByText('Late marks this month')).toBeInTheDocument();
    expect(screen.queryByText('Net pay, September')).toBeNull();
    rerender(<RoleHomeScreen persona="employee" data={{ actions: [] }} live={{ ...base, stats, pay }} />);
    expect(screen.queryByText('Late marks this month')).toBeNull();
    expect(screen.getByText('Amount hidden')).toBeInTheDocument();
    expect(screen.queryByText('₹86,420')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show amount' }));
    expect(screen.getByText('₹86,420')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View payslip/ })).toHaveAttribute('href', '/yx/me/payslips');
    fireEvent.click(screen.getByRole('button', { name: 'Hide amount' }));
    expect(screen.queryByText('₹86,420')).toBeNull();
    rerender(<RoleHomeScreen persona="employee" data={{ actions: [] }} live={{ ...base, stats, pay: { ...pay, value: null } }} />);
    expect(screen.getByText('No payslip yet.')).toBeInTheDocument();
  });

  it('Nudge on Team today: only for someone not checked in; sends once, says so in a toast; a refusal says why', async () => {
    const onNudge = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Kavya Reddy was already reminded today. You can remind them again tomorrow.'));
    const team = { summary: '11 in · 1 on leave · 2 not checked in · 0 late', total: 14, href: '/yx/time/muster', rows: [{ id: 't1', name: 'Sanjay Gupta', secondary: 'Not checked in', nudge: true }, { id: 't2', name: 'Kavya Reddy', secondary: 'Not checked in', nudge: true }, { id: 't3', name: 'Meera Krishnan', secondary: 'On leave today' }] };
    render(
      <ToastProvider>
        <RoleHomeScreen persona="manager" data={{ actions: [] }} live={{ ...base, team, onNudge }} />
      </ToastProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Nudge Meera Krishnan' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nudge Sanjay Gupta' }));
    expect(await screen.findByText('Reminder sent to Sanjay Gupta')).toBeInTheDocument();
    expect(onNudge).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', name: 'Sanjay Gupta' }));
    expect(screen.getByRole('button', { name: 'Reminded Sanjay Gupta' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Nudge Kavya Reddy' }));
    expect(await screen.findByText('Kavya Reddy was already reminded today. You can remind them again tomorrow.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nudge Kavya Reddy' })).toBeEnabled();
  });

  it("gives the manager team today and who's off this week", () => {
    render(<RoleHomeScreen persona="manager" data={{ actions: [] }} live={{ ...base, team: { summary: '11 in · 2 on leave · 1 not checked in · 0 late', total: 14, href: '/yx/time/muster', rows: [{ id: 't', name: 'Sanjay Gupta', secondary: 'Not checked in' }] }, off: [], offHref: '/yx/time/team' }} />);
    expect(screen.getByText('11 in · 2 on leave · 1 not checked in · 0 late')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all 14' })).toHaveAttribute('href', '/yx/time/muster');
    expect(screen.getByText('No one in your team is off this week.')).toBeInTheDocument();
  });
});

describe('Finance home, live (20 Oct 2026)', () => {
  const today = new Date(2026, 8, 29, 9, 42);
  const base = {
    firstName: 'Suresh',
    company: 'Kaveri Foods',
    today,
    approvalsHref: '/yx/approvals',
    stats: [
      { id: 'net', title: 'Payroll net', label: 'September net payroll', value: 18240500, money: true, previous: 17985200, previousLabel: 'August', drill: { label: 'Open run', href: '/yx/payroll/runs/r1' } },
      { id: 'tds', title: 'TDS', label: 'TDS to deposit', value: 0, money: true, empty: 'Nothing due for September yet', drill: { label: 'View TDS', href: '/yx/payroll/statutory' } },
    ],
    moneyOut: [{ id: 'o1', date: '30 Sep', what: 'September salaries', amount: 18240500, status: 'Waiting for your approval', tone: 'warning' as const, action: 'Open run', href: '/yx/payroll/runs/r1' }],
  };
  const run = { id: 'f1', type: 'Payroll run', title: 'Approve September payroll · 248 employees · ₹1,82,40,500 net', who: 'Anita Desai', kind: 'review' as const, href: '/yx/payroll/runs/r1', actionLabel: 'Open' };

  it('shows the money cards in Indian format, the money going out and the greeting', () => {
    render(<RoleHomeScreen persona="finance" data={{ actions: [run] }} live={{ ...base, amounts: { hidden: false, onToggle: () => {} } }} />);
    expect(screen.getByText('Money to pay, payroll to approve and statutory dues.', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'September net payroll' })).toHaveTextContent('₹1,82,40,500');
    expect(screen.getByRole('region', { name: 'TDS to deposit' })).toHaveTextContent('Nothing due for September yet');
    const out = screen.getByRole('region', { name: 'Money going out' });
    expect(out).toHaveTextContent('₹1,82,40,500 due in the next 30 days');
    expect(within(out).getByRole('link', { name: 'Open run' })).toHaveAttribute('href', '/yx/payroll/runs/r1');
    expect(screen.getByText(/Approve September payroll · 248 employees · ₹1,82,40,500 net/)).toBeInTheDocument();
  });

  it('hides every amount when asked, keeping labels and links', () => {
    let toggled = 0;
    render(<RoleHomeScreen persona="finance" data={{ actions: [run] }} live={{ ...base, amounts: { hidden: true, onToggle: () => toggled++ } }} />);
    expect(document.body).not.toHaveTextContent('1,82,40,500');
    expect(screen.getByRole('region', { name: 'September net payroll' })).toHaveTextContent('Open run');
    expect(screen.getByText(/Approve September payroll · 248 employees · ₹ •••••• net/)).toBeInTheDocument();
    screen.getByRole('button', { name: 'Show amounts' }).click();
    expect(toggled).toBe(1);
  });

  it('shows the run waiting for approval with its change, and hides the change with the amounts', () => {
    const approval = { month: 'September', preparedBy: 'Anita Desai', role: 'Payroll executive', on: '28 Sep', previousMonth: 'August', changePct: 1.4, flagged: 3, threshold: '20', href: '/yx/payroll/runs/r1' };
    const { unmount } = render(<RoleHomeScreen persona="finance" data={{ actions: [] }} live={{ ...base, approval, amounts: { hidden: false, onToggle: () => {} } }} />);
    const card = screen.getByRole('region', { name: 'Payroll approval' });
    expect(card).toHaveTextContent('September run prepared by Anita Desai, payroll executive, on 28 Sep. You approve it; the person who prepares a run can never approve it.');
    expect(within(card).getByRole('link', { name: 'Variance vs August +1.4% · 3 employees above 20% change' })).toHaveAttribute('href', '/yx/payroll/runs/r1');
    expect(within(card).getByRole('link', { name: 'Open run for approval' })).toHaveAttribute('href', '/yx/payroll/runs/r1');
    unmount();
    render(<RoleHomeScreen persona="finance" data={{ actions: [] }} live={{ ...base, approval, amounts: { hidden: true, onToggle: () => {} } }} />);
    expect(screen.getByRole('link', { name: 'Variance vs August · 3 employees above 20% change' })).toBeInTheDocument();
  });

  it('says so when nothing goes out, and has no Hide amounts button without pay rights', () => {
    render(<RoleHomeScreen persona="finance" data={{ actions: [] }} live={{ ...base, stats: [], moneyOut: [] }} />);
    expect(screen.getByText('Nothing to pay in the next 30 days.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /amounts/ })).not.toBeInTheDocument();
  });
});

describe('Command palette by role (founder review 30 Sep 2026)', () => {
  const labels = (p: Parameters<typeof paletteFor>[0]) => paletteFor(p).flatMap((g) => g.items.map((i) => i.label));
  it('never suggests payroll or candidates to a manager', () => {
    expect(labels('manager')).not.toContain('September payroll run');
    expect(labels('manager')).not.toContain('Ananya Kulkarni');
    expect(labels('hr')).toContain('September payroll run');
  });
});

describe('Search results by role (founder review 30 Sep 2026)', () => {
  const hit = (id: string, source: SearchHit['source'], title: string): SearchHit => ({ id, source, title, subtitle: 'x', entity: 'Kaveri Foods Pvt Ltd', updated: new Date(2026, 8, 1) });
  const hits = [hit('a', 'People', 'Arjun Mehta'), hit('b', 'Documents', 'Appointment letter · Arjun Mehta'), hit('c', 'Tickets', 'TKT-5519 · Arjun'), hit('d', 'Candidates', 'Arjun Menon')];
  it('never shows a manager personal documents, tickets or candidates', () => {
    expect(searchableFor('manager', hits).map((h) => h.id)).toEqual(['a']);
    expect(searchableFor('hr', hits)).toHaveLength(4);
  });
  it('bolds the match and explains an unknown employee code', () => {
    render(<SearchResultsScreen query="arjun" hits={hits} persona="manager" />);
    expect(screen.getByText('Arjun', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Company/ })).not.toBeInTheDocument();
  });
  it('says when an employee code has no match', () => {
    render(<SearchResultsScreen query="kf-9999" hits={[]} />);
    expect(screen.getByText('No employee with code KF-9999.')).toBeInTheDocument();
  });
});

describe('Search only shows results it can explain', () => {
  it('drops a result whose visible text does not contain the search', () => {
    const base = { entity: 'Kaveri Foods Pvt Ltd', updated: new Date(2026, 3, 1) };
    const hits: SearchHit[] = [
      { id: 'p1', source: 'Policies', title: 'Leave policy 2026', subtitle: 'Policies · v3', snippet: 'casual leave can be combined with', ...base },
      { id: 'p2', source: 'Policies', title: 'Travel policy 2026', subtitle: 'Policies · v2', snippet: 'approved by the plant head (for example Arjun Mehta)', ...base },
    ];
    expect(explainedHits(hits, 'arjun').map((h) => h.id)).toEqual(['p2']);
  });
});

describe('Access states (founder review 30 Sep 2026)', () => {
  it("shows Not found for someone else's payslip, never Request access", () => {
    render(<AccessStateBody kind="denied" recordType="payslip" />);
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument();
  });
  it('names the person who decides and shows a request already waiting', () => {
    render(<AccessStateBody kind="requested" />);
    expect(screen.getByText('Lakshmi Venkatesan')).toBeInTheDocument();
    expect(screen.getByText(/You asked on 28 Sep · waiting for Lakshmi/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument();
  });
  it('gives a non-admin no enable button on a disabled add-on', () => {
    render(<AccessStateBody kind="not-enabled" />);
    expect(screen.queryByRole('button', { name: /Enable/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeInTheDocument();
  });
});
