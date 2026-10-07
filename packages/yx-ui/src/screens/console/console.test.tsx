import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CompaniesScreen, companyInput, slugFrom } from './companies';
import { CompanyScreen, supportInput, type CompanyScreenProps } from './company';
import { PlansScreen, priceInput } from './plans';
import { SupportSessionsScreen } from './support';
import { PlatformAuditScreen } from './audit';
import { ConsoleShell } from './console-shell';
import { actionWords } from './console-kit';
import { SupportAccessScreen, type SupportAccessScreenProps } from '../access/support-access';
import { ACTIVITY, AUDIT, COMPANIES, COMPANY, NOW, PRODUCTS, REQUEST, SESSIONS, TODAY } from './data';

// Radix dialogs and popovers toggle pointer-events while they open; the check is for real users, not here.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn().mockResolvedValue(undefined);

describe('platform console: inputs mirror the API rules', () => {
  it('a company needs a name, a valid code, an admin and a product', () => {
    expect(slugFrom('Godavari Agro Pvt. Ltd.')).toBe('godavari-agro-pvt-ltd');
    const good = { name: 'Godavari Agro', slug: 'godavari-agro', adminName: 'Sunita Rao', adminEmail: 'sunita@godavari.test', products: ['hrms'] };
    expect(companyInput(good).input).toEqual(good);
    expect(companyInput({ ...good, slug: 'Bad Code', products: [], adminEmail: 'nope' }).errors.map((e) => e.fieldId)).toEqual(['co-slug', 'co-admin-email', 'co-products']);
  });

  it('a support request needs a real reason; the ticket is optional', () => {
    expect(supportInput({ reason: 'too short', ticket: '', hours: 24 }).errors.map((e) => e.fieldId)).toEqual(['sr-reason']);
    expect(supportInput({ reason: 'Payroll stuck at readiness', ticket: ' TKT-1 ', hours: 4 }).input).toEqual({ reason: 'Payroll stuck at readiness', ticket: 'TKT-1', hours: 4 });
    expect(supportInput({ reason: 'Payroll stuck at readiness', ticket: 'bad ticket!', hours: 4 }).errors.map((e) => e.fieldId)).toEqual(['sr-ticket']);
  });

  it("a new price gives 90 days' notice once a price is in force (YX-BILL-13)", () => {
    const d = { currency: 'INR' as const, unitPrice: 109, minimumMonthly: 549, validFrom: '2026-12-01', reason: 'New financial year' };
    expect(priceInput(d, PRODUCTS[0], TODAY).errors[0]).toMatchObject({ fieldId: 'pr-from', message: expect.stringContaining('2027-01-06') });
    expect(priceInput({ ...d, validFrom: '2027-01-06' }, PRODUCTS[0], TODAY).input).toMatchObject({ validFrom: '2027-01-06', unitPrice: 109 });
    expect(priceInput({ ...d, unitPrice: 99.999, validFrom: '2027-02-01' }, PRODUCTS[0], TODAY).errors.map((e) => e.fieldId)).toEqual(['pr-unit']);
    const fresh = { ...PRODUCTS[0], prices: [] };
    expect(priceInput({ ...d, validFrom: TODAY }, fresh, TODAY).input).not.toBeNull();
  });

  it('audit actions read as plain words', () => {
    expect(actionWords('platform.company.lifecycle', { from: 'active', to: 'suspended' })).toBe('Changed the company from Active to Suspended');
    expect(actionWords('support_session.request', { method: 'GET', path: '/people/employees' })).toBe('Opened /people/employees');
    expect(actionWords('support_session.approved', { hours: 4 })).toBe('Approved the support session for 4 hours');
  });
});

describe('Companies', () => {
  it('lists companies, filters by name, opens one and creates a company in trial', async () => {
    const onOpen = vi.fn();
    const onCreate = ok();
    render(<CompaniesScreen state="ready" companies={COMPANIES} products={PRODUCTS} canManage onOpen={onOpen} onCreate={onCreate} />);
    expect(screen.getByText('Kaveri Foods')).toBeInTheDocument();
    await ue.type(screen.getByPlaceholderText('Search by name or code'), 'godavari');
    expect(screen.queryByText('Kaveri Foods')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith('c2');

    await ue.click(screen.getByRole('button', { name: 'New company' }));
    const drawer = await screen.findByRole('dialog');
    await ue.click(within(drawer).getByRole('button', { name: 'Create company' }));
    expect(await within(drawer).findByText('Fix these before saving')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByRole('textbox', { name: /Company name/ }), 'Tunga Textiles');
    expect(within(drawer).getByRole('textbox', { name: /Company code/ })).toHaveValue('tunga-textiles');
    await ue.click(within(drawer).getByRole('checkbox', { name: /YukthiX HR/ }));
    await ue.type(within(drawer).getByRole('textbox', { name: /^Name/ }), 'Meena Pillai');
    await ue.type(within(drawer).getByRole('textbox', { name: /Work email/ }), 'meena@tunga.test');
    await ue.click(within(drawer).getByRole('button', { name: 'Create company' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: 'Tunga Textiles', slug: 'tunga-textiles', adminName: 'Meena Pillai', adminEmail: 'meena@tunga.test', products: ['hrms'] }));
  });

  it('staff without the manage key see no New company button', () => {
    render(<CompaniesScreen state="ready" companies={COMPANIES} products={PRODUCTS} canManage={false} onOpen={vi.fn()} onCreate={ok()} />);
    expect(screen.queryByRole('button', { name: 'New company' })).not.toBeInTheDocument();
  });
});

describe('One company', () => {
  function company(over: Partial<CompanyScreenProps> = {}) {
    const props: CompanyScreenProps = {
      state: 'ready',
      company: COMPANY,
      sessions: [],
      canManage: true,
      canSupport: true,
      now: NOW,
      onBack: vi.fn(),
      onLifecycle: ok(),
      onExtendTrial: ok(),
      onRequestSupport: ok(),
      onOpenSession: ok(),
      onEndSession: ok(),
      onWithdrawRequest: ok(),
      ...over,
    };
    render(<CompanyScreen {...props} />);
    return props;
  }

  it('every lifecycle move asks for a written reason (YX-CONSOLE-02)', async () => {
    const p = company();
    await ue.click(screen.getByRole('button', { name: 'Switch on' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Switch on' }));
    expect(await within(dialog).findByText('Write at least 5 characters')).toBeInTheDocument();
    expect(p.onLifecycle).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox'), 'Signed the order form');
    await ue.click(within(dialog).getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(p.onLifecycle).toHaveBeenCalledWith('activate', 'Signed the order form'));
  });

  it('asks for support access with a reason and a window picked on the Segment', async () => {
    const p = company();
    await ue.click(screen.getByRole('button', { name: 'Ask for support access' }));
    const drawer = await screen.findByRole('dialog');
    await ue.type(within(drawer).getByRole('textbox', { name: /Why you need to look/ }), 'Payroll stuck at readiness');
    await ue.click(within(drawer).getByRole('radio', { name: '4 hours' }));
    await ue.click(within(drawer).getByRole('button', { name: 'Send request to the company' }));
    await waitFor(() => expect(p.onRequestSupport).toHaveBeenCalledWith({ reason: 'Payroll stuck at readiness', hours: 4 }));
  });

  it('with an approved session of my own: open the company or end it; no second request', async () => {
    const p = company({ sessions: SESSIONS.filter((s) => s.organizationId === 'c2') });
    expect(screen.queryByRole('button', { name: 'Ask for support access' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open company' }));
    expect(p.onOpenSession).toHaveBeenCalledWith(SESSIONS[0]);
    await ue.click(screen.getByRole('button', { name: 'End session' }));
    expect(p.onEndSession).toHaveBeenCalledWith('s1');
  });

  it('a suspended or closed company offers no support request (nobody there can approve)', () => {
    company({ company: { ...COMPANY, lifecycle: 'suspended', signInAllowed: false } });
    expect(screen.queryByRole('button', { name: 'Ask for support access' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reinstate' })).toBeInTheDocument();
    expect(screen.getByText('Sign-in blocked')).toBeInTheDocument();
  });
});

describe('Plans, support sessions and the audit log', () => {
  it('plans a price and withdraws a planned one, confirmed', async () => {
    const onSchedule = ok();
    const onWithdraw = ok();
    render(<PlansScreen state="ready" products={PRODUCTS} canManage today={TODAY} onSchedule={onSchedule} onWithdraw={onWithdraw} />);
    expect(screen.getAllByText('In force').length).toBe(4);
    expect(screen.getByText('Planned')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'More actions for INR' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Withdraw planned price' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Withdraw price' }));
    await waitFor(() => expect(onWithdraw).toHaveBeenCalledWith('p5'));
  });

  it('support sessions: mine by default, everyone on the Segment; open and withdraw my own', async () => {
    const onOpenSession = ok();
    const onWithdrawRequest = ok();
    render(<SupportSessionsScreen state="ready" sessions={SESSIONS} now={NOW} onOpenCompany={vi.fn()} onOpenSession={onOpenSession} onEndSession={ok()} onWithdrawRequest={onWithdrawRequest} />);
    expect(screen.queryByText('Kavitha Menon')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open company' }));
    expect(onOpenSession).toHaveBeenCalledWith(SESSIONS[0]);
    await ue.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(onWithdrawRequest).toHaveBeenCalledWith('s3');
    await ue.click(screen.getByRole('radio', { name: 'Everyone' }));
    expect(screen.getByText('Kavitha Menon')).toBeInTheDocument();
  });

  it('audit log shows actions in plain words with the reason; looks are behind the Segment', async () => {
    const onIncludeReadsChange = vi.fn();
    const onLoadMore = vi.fn();
    render(<PlatformAuditScreen state="ready" entries={AUDIT} includeReads={false} onIncludeReadsChange={onIncludeReadsChange} hasMore loadingMore={false} onLoadMore={onLoadMore} />);
    expect(screen.getByText('Changed the company from Active to Suspended')).toBeInTheDocument();
    expect(screen.getByText('“Invoice 45 days overdue”')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Actions and looks' }));
    expect(onIncludeReadsChange).toHaveBeenCalledWith(true);
    await ue.click(screen.getByRole('button', { name: 'Show older entries' }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('the shell lists only the console pages and navigates in the app', async () => {
    const onNavigate = vi.fn();
    render(
      <ConsoleShell active="companies" name="Anand Iyer" securityHref="/yx/me/security" onSignOut={vi.fn()} onNavigate={onNavigate}>
        <p>page</p>
      </ConsoleShell>,
    );
    await ue.click(screen.getAllByRole('link', { name: 'Support sessions' })[0]);
    expect(onNavigate).toHaveBeenCalledWith('/staff/support');
  });
});

describe('Company side: Support access (PLT-17, P02 Q8)', () => {
  function access(over: Partial<SupportAccessScreenProps> = {}) {
    const props: SupportAccessScreenProps = {
      state: 'ready',
      sessions: [REQUEST, ...SESSIONS.filter((s) => s.organizationId === 'c2')],
      now: NOW,
      onApprove: ok(),
      onDecline: ok(),
      onEnd: ok(),
      loadActivity: vi.fn().mockResolvedValue(ACTIVITY),
      ...over,
    };
    render(<SupportAccessScreen {...props} />);
    return props;
  }

  it('reviews a request: never longer than asked; approve or decline with a note', async () => {
    const p = access();
    await ue.click(screen.getByRole('button', { name: 'Review' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('radio').map((r) => r.textContent)).toEqual(['4 hours']);
    await ue.type(within(dialog).getByRole('textbox'), 'Go ahead');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve for 4 hours' }));
    await waitFor(() => expect(p.onApprove).toHaveBeenCalledWith('s4', 4, 'Go ahead'));
  });

  it('an open session shows a banner to end it now, and its activity lists every page opened', async () => {
    const p = access();
    expect(screen.getByText(/can look at your company until/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'End session now' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'End session' }));
    await waitFor(() => expect(p.onEnd).toHaveBeenCalledWith('s1'));
    await ue.click(screen.getAllByRole('button', { name: 'Activity' })[0]);
    expect(await screen.findByText('Opened /org/legal-entities')).toBeInTheDocument();
    expect(screen.getByText('Approved the support session for 24 hours')).toBeInTheDocument();
    expect(p.loadActivity).toHaveBeenCalledWith('s1');
  });

  it('shows no-access to people without the approval key', () => {
    access({ state: 'no-access', sessions: [] });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
