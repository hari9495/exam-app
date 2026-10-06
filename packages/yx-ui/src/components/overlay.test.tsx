import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';
import { ConfirmDialog, Dialog, ShortcutHelp, TypeToConfirmDialog, useShortcutHelp } from './overlay';
import {
  ApprovalInbox,
  AssistantPanel,
  NotificationCentre,
  TOAST_DURATION,
  TimesheetApprovalCard,
  ToastProvider,
  dayLabel,
  useToast,
  type ApprovalItem,
  type ToastOptions,
} from './notify';

/* ---------- Toasts ---------- */

let api: ReturnType<typeof useToast>;
function Grab() {
  api = useToast();
  return null;
}
const renderToasts = () => render(<ToastProvider><Grab /></ToastProvider>);
const push = (t: ToastOptions) => act(() => void api.toast(t));
const stack = () => within(screen.getByRole('region', { name: 'Notifications' }));

describe('Toasts', () => {
  afterEach(() => vi.useRealTimers());

  it('auto-dismisses after 5 s, pauses on hover, never auto-dismisses errors', () => {
    vi.useFakeTimers();
    renderToasts();
    push({ title: 'Leave approved' });
    push({ title: "We couldn't approve the expense. Try again.", tone: 'error' });
    act(() => void vi.advanceTimersByTime(3000));
    fireEvent.mouseEnter(screen.getByRole('region', { name: 'Notifications' }));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(stack().getByText('Leave approved')).toBeInTheDocument(); // paused
    fireEvent.mouseLeave(screen.getByRole('region', { name: 'Notifications' }));
    act(() => void vi.advanceTimersByTime(1999));
    expect(stack().getByText('Leave approved')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1));
    expect(stack().queryByText('Leave approved')).toBeNull();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(stack().getByText("We couldn't approve the expense. Try again.")).toBeInTheDocument();
    // errors are announced assertively
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't approve the expense");
  });

  it('shows at most 3; the 4th waits in the queue until a slot frees', () => {
    vi.useFakeTimers();
    renderToasts();
    ['One', 'Two', 'Three', 'Four'].forEach((t) => push({ title: t }));
    const list = () => stack().queryAllByRole('listitem');
    expect(list()).toHaveLength(3);
    expect(stack().queryByText('Four')).toBeNull();
    act(() => void vi.advanceTimersByTime(TOAST_DURATION));
    expect(stack().getByText('Four')).toBeInTheDocument();
    expect(list()).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(TOAST_DURATION));
    expect(list()).toHaveLength(0);
  });

  it('Undo runs the callback and closes the toast', () => {
    renderToasts();
    const undo = vi.fn();
    push({ title: 'Shift deleted', onUndo: undo });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledOnce();
    expect(stack().queryByText('Shift deleted')).toBeNull();
  });

  it('useToast outside the provider explains the fix', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Grab />)).toThrow(/ToastProvider/);
  });
});

/* ---------- Dialogs ---------- */

describe('Dialogs', () => {
  it('non-destructive dialog closes on Esc and returns focus to the trigger', async () => {
    const u = userEvent.setup();
    render(<Dialog title="Change reporting manager?" trigger={<Button>Change manager</Button>} footer={<Button>Cancel</Button>} />);
    const trigger = screen.getByRole('button', { name: 'Change manager' });
    await u.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Change reporting manager?' })).toBeInTheDocument();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('destructive dialog ignores Esc', async () => {
    const u = userEvent.setup();
    render(<ConfirmDialog defaultOpen destructive title="Delete leave type Casual?" confirmLabel="Delete leave type" onConfirm={() => {}} />);
    await u.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('async confirm shows loading, then the error inline, and stays open', async () => {
    const u = userEvent.setup();
    let fail!: (e: Error) => void;
    const onConfirm = () => new Promise<void>((_, rej) => (fail = rej));
    render(<ConfirmDialog defaultOpen destructive title="Delete leave type Casual?" confirmLabel="Delete leave type" onConfirm={onConfirm} />);
    const btn = screen.getByRole('button', { name: 'Delete leave type' });
    await u.click(btn);
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => fail(new Error('12 employees still have Casual leave balances. Move them first.')));
    expect(screen.getByRole('alert')).toHaveTextContent('Move them first');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('async confirm closes on success', async () => {
    const u = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    render(<ConfirmDialog defaultOpen title="Publish holiday list 2027?" confirmLabel="Publish" onConfirm={onConfirm} />);
    await u.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('type-to-confirm enables the danger button only on an exact match', async () => {
    const u = userEvent.setup();
    const onConfirm = vi.fn();
    render(<TypeToConfirmDialog defaultOpen objectName="Payroll Sep 2026" title="Unlock payroll Sep 2026?" confirmLabel="Unlock payroll" onConfirm={onConfirm} />);
    const btn = screen.getByRole('button', { name: 'Unlock payroll' });
    expect(btn).toBeDisabled();
    const input = screen.getByLabelText('Type "Payroll Sep 2026" to confirm');
    await u.type(input, 'payroll sep 2026');
    expect(btn).toBeDisabled();
    await u.clear(input);
    await u.type(input, 'Payroll Sep 2026');
    expect(btn).toBeEnabled();
    await u.click(btn);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('"?" opens shortcut help, but not while typing', () => {
    function T() {
      const help = useShortcutHelp();
      return (
        <>
          <input aria-label="Search" />
          <ShortcutHelp {...help} />
        </>
      );
    }
    render(<T />);
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: '?' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveTextContent('Approve the selected request');
  });
});

/* ---------- Notification centre ---------- */

describe('NotificationCentre', () => {
  const now = new Date(2026, 8, 29, 11, 0);
  it('groups by day, labels unread for screen readers and shows the unread tab', async () => {
    const u = userEvent.setup();
    const approve = vi.fn();
    render(
      <NotificationCentre
        defaultOpen
        now={now}
        settingsHref="#settings"
        onMarkAllRead={() => {}}
        items={[
          { id: '1', actor: { name: 'Divya Raghunathan' }, text: 'Divya applied for casual leave', at: new Date(2026, 8, 29, 9, 5), read: false, approval: { onApprove: approve } },
          { id: '2', actor: { name: 'Arjun Kulkarni' }, text: 'Payslip for August is ready', at: new Date(2026, 8, 28, 18, 0), read: true },
          { id: '3', actor: { name: 'Sana Nizami' }, text: 'Sana submitted a timesheet', at: new Date(2026, 8, 20, 9, 0), read: true },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Today' })).toHaveTextContent('Unread');
    expect(screen.getByRole('region', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '20 Sep 2026' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Approve' }));
    expect(approve).toHaveBeenCalled();
    await u.click(screen.getByRole('tab', { name: /Unread/ }));
    expect(screen.queryByText('Payslip for August is ready')).toBeNull();
    expect(dayLabel(new Date(2026, 8, 28, 23, 59), now)).toBe('Yesterday');
  });
});

/* ---------- Approvals inbox ---------- */

const INBOX: ApprovalItem[] = [
  { id: 'a', requester: { name: 'Divya Raghunathan' }, type: 'leave', summary: 'Casual leave · 3 days', policy: { ok: true }, lowRisk: true },
  { id: 'b', requester: { name: 'Karthik Iyer' }, type: 'expense', summary: 'Client dinner', detail: '₹12,450', policy: { ok: false, reason: 'Over the ₹8,000 meal limit' } },
];

describe('ApprovalInbox', () => {
  it('reject requires a reason', async () => {
    const u = userEvent.setup();
    const onReject = vi.fn();
    render(<ApprovalInbox items={INBOX} onApprove={() => {}} onReject={onReject} />);
    await u.click(screen.getByRole('button', { name: "Reject Karthik Iyer's request" }));
    const pop = screen.getByRole('dialog', { name: 'Reason for rejecting' });
    await u.click(within(pop).getByRole('button', { name: 'Reject' }));
    expect(onReject).not.toHaveBeenCalled();
    expect(within(pop).getByText('Enter a reason. The employee sees it.')).toBeInTheDocument();
    await u.type(within(pop).getByRole('textbox'), 'Meal limit is ₹8,000. Resubmit with the split bill.');
    await u.click(within(pop).getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledWith('b', 'Meal limit is ₹8,000. Resubmit with the split bill.');
  });

  it('filters by type with counts; bulk approve only offers low-risk rows', async () => {
    const u = userEvent.setup();
    const onApprove = vi.fn();
    render(<ApprovalInbox items={INBOX} onApprove={onApprove} onReject={() => {}} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2); // select-all + Divya only
    await u.click(screen.getByRole('checkbox', { name: 'Select all low-risk' }));
    await u.click(screen.getByRole('button', { name: 'Approve selected' }));
    expect(onApprove).toHaveBeenCalledWith(['a']);
    await u.click(screen.getByRole('tab', { name: /Expense 1/ }));
    expect(screen.queryByText('Divya Raghunathan')).toBeNull();
    await u.click(screen.getByRole('tab', { name: /Offer 0/ }));
    expect(screen.getByText('No offer requests waiting for you')).toBeInTheDocument();
  });

  it('empty inbox says nothing is waiting', () => {
    render(<ApprovalInbox items={[]} onApprove={() => {}} onReject={() => {}} />);
    expect(screen.getByText('Nothing waiting for you')).toBeInTheDocument();
  });
});

/* ---------- Timesheet approval ---------- */

describe('TimesheetApprovalCard', () => {
  it('reduce requires fewer hours and a reason, then updates totals', async () => {
    const u = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <TimesheetApprovalCard
        employee={{ name: 'Meera Pillai' }}
        weekLabel="Week of 21 Sep 2026"
        lines={[
          { id: 'l1', project: 'ACME-Website', task: 'Stand-ups', hours: 10 },
          { id: 'l2', project: 'ACME-Website', task: 'Development', hours: 32 },
        ]}
        onApprove={onApprove}
        onSendBack={() => {}}
      />,
    );
    const approving = () => screen.getByTestId('tsa-approving');
    expect(approving()).toHaveTextContent('42 h');
    await u.click(screen.getByRole('button', { name: 'Reduce hours for ACME-Website · Stand-ups' }));
    const pop = screen.getByRole('dialog', { name: 'Reason for reducing' });
    await u.type(within(pop).getByLabelText(/Approved hours/), '12');
    await u.click(within(pop).getByRole('button', { name: 'Reduce hours' }));
    expect(within(pop).getByText('Enter fewer hours than the 10 h submitted.')).toBeInTheDocument();
    expect(within(pop).getByText('Enter a reason. The employee sees it.')).toBeInTheDocument();
    await u.clear(within(pop).getByLabelText(/Approved hours/));
    await u.type(within(pop).getByLabelText(/Approved hours/), '8');
    await u.type(within(pop).getByLabelText(/Reason for reducing/), 'Duplicate stand-up entry');
    await u.click(within(pop).getByRole('button', { name: 'Reduce hours' }));
    expect(approving()).toHaveTextContent('40 h');
    expect(screen.getByText('Reason: Duplicate stand-up entry')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Approve all' }));
    expect(onApprove).toHaveBeenCalledWith({
      l1: { status: 'reduced', hours: 8, reason: 'Duplicate stand-up entry' },
      l2: { status: 'approved' },
    });
  });
});

/* ---------- Assistant ---------- */

describe('AssistantPanel', () => {
  it('Enter sends, Shift+Enter adds a new line', async () => {
    const u = userEvent.setup();
    const onSend = vi.fn();
    render(<AssistantPanel messages={[]} onSend={onSend} />);
    const box = screen.getByRole('textbox', { name: 'Ask a question' });
    await u.type(box, 'How many casual leaves{Shift>}{Enter}{/Shift}do I have?');
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('How many casual leaves\ndo I have?');
    await u.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('How many casual leaves\ndo I have?');
    expect(box).toHaveValue('');
    await u.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1); // empty draft is not sent
  });

  it('never changes data without Confirm', async () => {
    const u = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <AssistantPanel
        messages={[]}
        onSend={() => {}}
        preview={{ title: 'Update leave balance', changes: [{ field: 'Casual leave', from: '4 days', to: '6 days' }], onConfirm, onCancel: () => {} }}
      />,
    );
    const card = screen.getByRole('region', { name: 'Review this change' });
    expect(card).toHaveTextContent('from 4 days');
    expect(onConfirm).not.toHaveBeenCalled();
    await u.click(within(card).getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
