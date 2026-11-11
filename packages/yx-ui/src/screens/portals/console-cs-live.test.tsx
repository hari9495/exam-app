import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CustomerSuccessScreen } from './console-ops';
import type { CsHealthRow, CsMessageRow, CsSettingRow, LiveCustomerSuccess } from './console-cs-live';
import { SupportAccessScreen } from '../access/support-access';
import * as YX04 from './yx-04.stories';

// YukthiX console C-2, Customer success (answers 1045, 1047, 1048): the designed YX-04 screen live, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn().mockResolvedValue(undefined);
const ROWS: CsHealthRow[] = [
  { id: 'c1', name: 'Kaveri Foods', slug: 'kaveri', lifecycle: 'active', products: ['hrms'], health: 80, factors: [], adminLastSignIn: '2026-11-11T09:00:00Z', openTickets: 1, alerts: [] },
  { id: 'c2', name: 'Godavari Agro', slug: 'godavari', lifecycle: 'trial', products: ['hrms'], health: 30, factors: ['Billing or account is not in good standing'], adminLastSignIn: null, openTickets: 0, alerts: ['Health score below 50', 'No System Admin has ever signed in'] },
];
const MESSAGES: CsMessageRow[] = [
  { id: 'm1', subject: 'Payroll readiness', body: 'Check bank details.', companyIds: ['c1', 'c2'], status: 'pending_approval', writtenBy: 'Joseph Thomas', mine: false, decidedBy: null, decidedAt: null, decisionNote: null, sentAt: null, createdAt: '2026-11-12T08:00:00Z', version: 3 },
  { id: 'm2', subject: 'My own draft', body: 'x', companyIds: ['c1', 'c2'], status: 'pending_approval', writtenBy: 'Kavitha Rao', mine: true, decidedBy: null, decidedAt: null, decisionNote: null, sentAt: null, createdAt: '2026-11-12T07:00:00Z', version: 1 },
];
const SETTINGS: CsSettingRow[] = [
  { key: 'cs.alert.health_below', label: 'Alert when the health score is below', value: 50, default: 50, min: 1, max: 99 },
  { key: 'cs.alert.admin_idle_days', label: 'Alert when no System Admin has signed in for (days)', value: 30, default: 30, min: 7, max: 365 },
];
const live = (o: Partial<LiveCustomerSuccess> = {}): LiveCustomerSuccess => ({ state: 'ready', onRetry: vi.fn(), rows: ROWS, messages: MESSAGES, settings: SETTINGS, canManage: true, onWrite: ok(), onApprove: ok(), onReject: ok(), onSaveSettings: ok(), ...o });
const wrap = (l: LiveCustomerSuccess) => render(<ToastProvider><CustomerSuccessScreen tenants={[]} alerts={[]} me="" live={l} /></ToastProvider>);

describe('Customer success (live)', () => {
  it('lists each company with its score and band; the alerts tab lists those with alerts', async () => {
    wrap(live());
    expect(screen.getByText('Kaveri Foods')).toBeInTheDocument();
    expect(screen.getAllByText('At risk').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('tab', { name: /Churn-risk alerts/ }));
    const alerts = screen.getByRole('list', { name: 'Churn-risk alerts' });
    expect(within(alerts).getByText('Godavari Agro')).toBeInTheDocument();
    expect(within(alerts).queryByText('Kaveri Foods')).toBeNull();
    expect(within(alerts).getByText(/Health score below 50 · No System Admin has ever signed in/)).toBeInTheDocument();
  });

  it('composer: nothing filled is stopped with field errors; one company sends at once', async () => {
    const l = live({ composerFor: [] });
    wrap(l);
    const d = await screen.findByRole('dialog', { name: 'Message company admins' });
    await ue.click(within(d).getByRole('button', { name: 'Send' }));
    expect(within(d).getByText('Choose at least one company.')).toBeInTheDocument();
    expect(within(d).getByText('Write a subject of at least 3 characters.')).toBeInTheDocument();
    expect(l.onWrite).not.toHaveBeenCalled();
  });

  it('one company: Send; two: Send for approval (another staff member approves it)', async () => {
    const one = live({ composerFor: ['c1'] });
    const r = wrap(one);
    let d = await screen.findByRole('dialog', { name: 'Message company admins' });
    await ue.type(within(d).getByRole('textbox', { name: /Subject/ }), 'Trial ends soon');
    await ue.type(within(d).getByRole('textbox', { name: /Message/ }), 'Switch on any time.');
    await ue.click(within(d).getByRole('button', { name: 'Send' }));
    expect(one.onWrite).toHaveBeenCalledWith({ companyIds: ['c1'], subject: 'Trial ends soon', body: 'Switch on any time.' });
    expect((await screen.findAllByText('Message sent')).length).toBeGreaterThan(0);
    r.unmount();
    const two = live({ composerFor: ['c1', 'c2'] });
    wrap(two);
    d = await screen.findByRole('dialog', { name: 'Message company admins' });
    expect(within(d).getByText(/another staff member approves the message/)).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /Subject/ }), 'Payroll readiness');
    await ue.type(within(d).getByRole('textbox', { name: /Message/ }), 'Check bank details.');
    await ue.click(within(d).getByRole('button', { name: 'Send for approval' }));
    expect(two.onWrite).toHaveBeenCalledWith({ companyIds: ['c1', 'c2'], subject: 'Payroll readiness', body: 'Check bank details.' });
    expect((await screen.findAllByText('Sent for approval')).length).toBeGreaterThan(0);
  });

  it("the writer cannot approve their own message; another staff member approves or sends back with a reason", async () => {
    const l = live({ tab: 'messages' });
    wrap(l);
    const list = screen.getByRole('list', { name: 'Messages' });
    const mine = within(list).getByText('My own draft').closest('li')!;
    expect(within(mine).queryByRole('button', { name: 'Approve and send' })).toBeNull();
    expect(within(mine).getByText('Another staff member approves it')).toBeInTheDocument();
    const theirs = within(list).getByText('Payroll readiness').closest('li')!;
    await ue.click(within(theirs).getByRole('button', { name: 'Send back' }));
    let d = await screen.findByRole('dialog', { name: 'Send the message back?' });
    await ue.click(within(d).getByRole('button', { name: 'Send back' }));
    expect(within(d).getByText('Say why you are sending it back.')).toBeInTheDocument();
    expect(l.onReject).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Too soon');
    await ue.click(within(d).getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(l.onReject).toHaveBeenCalledWith('m1', 3, 'Too soon'));
    await ue.click(within(theirs).getByRole('button', { name: 'Approve and send' }));
    d = await screen.findByRole('dialog', { name: /Send “Payroll readiness” to 2 companies\?/ });
    await ue.click(within(d).getByRole('button', { name: 'Approve and send' }));
    await waitFor(() => expect(l.onApprove).toHaveBeenCalledWith('m1', 3));
  });

  it('alert rules: a value out of range is stopped; a good one is saved; without the key they are read-only', async () => {
    const l = live({ tab: 'alerts' });
    const r = wrap(l);
    const field = screen.getByRole('textbox', { name: /health score is below/ });
    await ue.clear(field);
    await ue.type(field, '0');
    await ue.click(screen.getByRole('button', { name: 'Save rules' }));
    // The number field's own range message wins over the form's (FormField rule); either way it is invalid and nothing is saved.
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(l.onSaveSettings).not.toHaveBeenCalled();
    await ue.clear(field);
    await ue.type(field, '60');
    await ue.click(screen.getByRole('button', { name: 'Save rules' }));
    await waitFor(() => expect(l.onSaveSettings).toHaveBeenCalledWith({ 'cs.alert.health_below': 60, 'cs.alert.admin_idle_days': 30 }));
    expect((await screen.findAllByText('Alert rules saved')).length).toBeGreaterThan(0);
    r.unmount();
    wrap(live({ tab: 'alerts', canManage: false }));
    expect(screen.queryByRole('button', { name: 'Save rules' })).toBeNull();
  });

  it('a load failure offers Retry', async () => {
    const l = live({ state: 'error' });
    wrap(l);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(l.onRetry).toHaveBeenCalled();
  });
});

// Answer 1087: the writer withdraws their own waiting message; others only approve or send it back.
describe('withdrawing a waiting message', () => {
  it('the writer gets Withdraw (confirmed); another staff member does not', async () => {
    const onWithdraw = vi.fn().mockResolvedValue(undefined);
    const mine = { ...MESSAGES.find((m) => m.status === 'pending_approval')!, mine: true };
    const { unmount } = wrap(live({ tab: 'messages', messages: [mine], onWithdraw }));
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(onWithdraw).toHaveBeenCalledWith(mine.id, mine.version));
    unmount();
    wrap(live({ tab: 'messages', messages: [{ ...mine, mine: false }], onWithdraw }));
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });
});

describe('the company side: messages from YukthiX (answer 1048)', () => {
  const base = { state: 'ready' as const, sessions: [], onApprove: ok(), onDecline: ok(), onEnd: ok(), loadActivity: vi.fn().mockResolvedValue([]) };
  it('lists what YukthiX sent its System Admins; none says so; no list without the data', () => {
    const r = render(<ToastProvider><SupportAccessScreen {...base} messages={[{ id: 'x', subject: 'Payroll readiness', body: 'First.\n\nSecond.', sentAt: '2026-11-12T09:00:00Z' }]} /></ToastProvider>);
    const list = screen.getByRole('list', { name: 'Messages from YukthiX' });
    expect(within(list).getByText('Payroll readiness')).toBeInTheDocument();
    expect(within(list).getByText('Second.')).toBeInTheDocument();
    r.unmount();
    const e = render(<ToastProvider><SupportAccessScreen {...base} messages={[]} /></ToastProvider>);
    expect(screen.getByText('No messages from YukthiX.')).toBeInTheDocument();
    e.unmount();
    render(<ToastProvider><SupportAccessScreen {...base} /></ToastProvider>);
    expect(screen.queryByText('Messages from YukthiX')).toBeNull();
  });
});

describe('answer 1045: the YX-04 Tenants stories draw the live Companies pages', () => {
  const story = (s: unknown) => (s as { render: () => ReactElement }).render();
  it('the Tenants list is CompaniesScreen; Tenant detail and support access are CompanyScreen', () => {
    const list = render(<ToastProvider>{story(YX04.YX04Tenants)}</ToastProvider>);
    expect(screen.getByRole('heading', { name: 'Companies' })).toBeInTheDocument();
    list.unmount();
    for (const s of [YX04.YX04Tenant, YX04.YX04SupportRequest, YX04.YX04SupportWaiting, YX04.YX04SupportActive, YX04.YX04SupportDeclined]) {
      const r = render(<ToastProvider>{story(s)}</ToastProvider>);
      expect(screen.getAllByText('Godavari Agro').length).toBeGreaterThan(0);
      r.unmount();
    }
  });
});
