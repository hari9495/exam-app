import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { LeaveHomeScreen, type LiveApplyFor } from './leave';
import type { ApplyForForm, HrLeaveHome, LeavePlan } from './live/types';

// Founder answer B (29 Oct 2026): HR applies leave for someone from the HR leave home, in the same TIM-18 drawer the
// employee uses. Pressed too early shows field errors and focuses the first (never a disabled button); the server's
// refusal stays in the drawer in plain English; success is a toast naming the person.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const HR: HrLeaveHome = { today: '2026-10-29', pending: { total: 0, rows: [] }, away: [], negative: 0, certificates: [], yearEnd: { on: '2025-12-31', posted: true, nextOn: '2026-12-31' } };
const hrefs = { approvals: '/a', calendar: '/c', negative: '/n', yearEnd: '/y', request: () => '/a' };
const FORM: ApplyForForm = {
  employee: { id: 'e1', name: 'Arjun Kumar', code: 'DEMO-0012' },
  today: '2026-10-29',
  approval: 'chain',
  balances: [{ leaveTypeId: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', colour: 'blue', paid: true, hasBalance: true, balance: 12, pending: 0, available: 12, takenThisYear: 0, entitlement: 18, negativeLimit: 0 }],
};
const PLAN: LeavePlan = { type: { id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', rules: { certificateAfterDays: null, medical: false, halfDays: true } }, days: [], total: 1, holidaysExcluded: 0, sandwichDays: 0, balance: null, balanceAfter: 11, othersOff: 0, certificateNeeded: false, blocks: [], warnings: [], noticeSkipped: true, noticeDays: 5, approval: 'chain' };

const live = (over: Partial<LiveApplyFor> = {}): LiveApplyFor => ({
  onFindPeople: vi.fn(async () => [{ id: 'e1', label: 'Arjun Kumar', detail: 'DEMO-0012' }]),
  onLoad: vi.fn(async () => FORM),
  onPreview: vi.fn(async () => PLAN),
  onApply: vi.fn(async () => ({})),
  ...over,
});
const open = async (applyFor: LiveApplyFor) => {
  render(<ToastProvider><LeaveHomeScreen hrLive={{ state: 'ready', data: HR, onRemind: vi.fn(), onNavigate: vi.fn(), hrefs, applyFor }} /></ToastProvider>);
  await ue.click(screen.getByRole('button', { name: 'Apply for someone' }));
  return screen.getByRole('dialog', { name: 'Apply leave for someone' });
};
const pick = async (dlg: HTMLElement) => {
  await ue.type(within(dlg).getByLabelText('Search employee'), 'Arj');
  await ue.click(await within(dlg).findByRole('combobox', { name: 'Employee' }));
  await ue.click(await screen.findByRole('option', { name: /Arjun Kumar/ }));
  await within(dlg).findByText('Leave type');
};
const day = async (dlg: HTMLElement, text: string) => {
  const f = within(dlg).getByLabelText(/^From/);
  await ue.clear(f);
  await ue.type(f, text);
  await ue.tab();
};

describe('Apply for someone (TIM-17 HR → TIM-18, live)', () => {
  it('only shows to people who may use it', () => {
    render(<ToastProvider><LeaveHomeScreen hrLive={{ state: 'ready', data: HR, onRemind: vi.fn(), onNavigate: vi.fn(), hrefs }} /></ToastProvider>);
    expect(screen.queryByRole('button', { name: 'Apply for someone' })).toBeNull();
  });

  it('Send too early shows "Choose the person." and focuses the person field, and the error summary leads there too; never disabled', async () => {
    const a = live();
    const dlg = await open(a);
    expect(within(dlg).getByText('Pick the employee to see their leave types and balances.')).toBeInTheDocument();
    const send = within(dlg).getByRole('button', { name: 'Send request' });
    expect(send).toBeEnabled();
    await ue.click(send);
    // Focus goes to the first bad field (the form moves it there; the summary no longer takes it from a field). The
    // summary's first line is the person and also leads to that field.
    expect(within(dlg).getByLabelText('Search employee')).toHaveFocus();
    const summary = within(dlg).getByRole('alert');
    await ue.click(within(summary).getByRole('link', { name: 'Choose the person.' }));
    expect(within(dlg).getByLabelText('Search employee')).toHaveFocus();
    expect(a.onApply).not.toHaveBeenCalled();
    // A person but no dates: the first day is asked for next.
    await pick(dlg);
    await ue.click(send);
    expect(within(dlg).getAllByText('Choose the first day.').length).toBeGreaterThan(0);
    expect(a.onApply).not.toHaveBeenCalled();
  });

  it("loads only the person's leave types, shows their balance after and the effect, then sends and says so in a toast", async () => {
    const a = live();
    const dlg = await open(a);
    await pick(dlg);
    expect(a.onLoad).toHaveBeenCalledWith('e1');
    await day(dlg, '3 Nov 2026');
    await waitFor(() => expect(a.onPreview).toHaveBeenCalledWith('e1', { leaveTypeId: 'el', from: '2026-11-03', to: '2026-11-03', fromHalf: 'full', toHalf: 'full' }));
    const summary = within(dlg).getByRole('region', { name: 'Leave summary' });
    expect(await within(summary).findByText("Applied by HR: 5 days' notice not needed")).toBeInTheDocument();
    expect(within(summary).getByText('Balance after').nextSibling?.textContent).toBe('11');
    expect(within(summary).getByText('Goes to their manager for approval, marked "Applied by HR".')).toBeInTheDocument();
    expect(within(dlg).queryByText('Delegate to')).toBeNull();
    await ue.click(within(dlg).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(a.onApply).toHaveBeenCalledWith('e1', expect.objectContaining({ leaveTypeId: 'el', from: '2026-11-03', to: '2026-11-03' })));
    expect((await screen.findAllByText('Leave applied for Arjun Kumar · sent for approval')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Apply leave for someone' })).toBeNull());
  });

  it('approved at once (company setting) says so before and after', async () => {
    const a = live({ onPreview: vi.fn(async () => ({ ...PLAN, approval: 'approved' as const })) });
    const dlg = await open(a);
    await pick(dlg);
    await day(dlg, '3 Nov 2026');
    expect(await within(dlg).findByText('Approved at once (company setting), marked "Applied by HR".')).toBeInTheDocument();
    await ue.click(within(dlg).getByRole('button', { name: 'Send request' }));
    expect((await screen.findAllByText('Leave approved for Arjun Kumar')).length).toBeGreaterThan(0);
  });

  it("the rules' refusal shows on Send (block date), and the server's refusal stays in the drawer", async () => {
    const block = 'Mon 3 Nov is a company block date (Year-end audit). Earned leave can\'t be taken on it. Choose other dates or ask HR.';
    const a = live({ onPreview: vi.fn(async () => ({ ...PLAN, blocks: [block] })) });
    const dlg = await open(a);
    await pick(dlg);
    await day(dlg, '3 Nov 2026');
    await waitFor(() => expect(a.onPreview).toHaveBeenCalled());
    await within(dlg).findByText("Applied by HR: 5 days' notice not needed");
    await ue.click(within(dlg).getByRole('button', { name: 'Send request' }));
    expect(within(dlg).getAllByText(block).length).toBeGreaterThan(0);
    expect(a.onApply).not.toHaveBeenCalled();

    const b = live({ onApply: vi.fn(async () => Promise.reject(new Error('November 2026 is locked for attendance and leave. Ask HR to record it.'))) });
    cleanup();
    const dlg2 = await open(b);
    await pick(dlg2);
    await day(dlg2, '3 Nov 2026');
    await within(dlg2).findByText("Applied by HR: 5 days' notice not needed");
    await ue.click(within(dlg2).getByRole('button', { name: 'Send request' }));
    expect(await within(dlg2).findByText('November 2026 is locked for attendance and leave. Ask HR to record it.')).toBeInTheDocument();
    expect(within(dlg2).getByText('Not sent')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Apply leave for someone' })).toBeInTheDocument();
  });

  it("a person whose leave can't be read (another company, out of scope) says so and asks to pick again", async () => {
    const a = live({ onLoad: vi.fn(async () => Promise.reject(new Error('Not found'))) });
    const dlg = await open(a);
    await ue.type(within(dlg).getByLabelText('Search employee'), 'Arj');
    await ue.click(await within(dlg).findByRole('combobox', { name: 'Employee' }));
    await ue.click(await screen.findByRole('option', { name: /Arjun Kumar/ }));
    expect(await within(dlg).findByText('Their leave did not load')).toBeInTheDocument();
    expect(within(dlg).getByText('Not found Pick the person again.')).toBeInTheDocument();
  });
});
