import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { BulkInterviewDayScreen } from './hiring-pipeline';
import { InterviewDaySheet, type InterviewDayView, type LiveInterviewDay } from './interview-day';

// HIR-27 bulk interview day, the designed board with `live`: positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const DAY: InterviewDayView = {
  id: 'd1',
  name: 'GET 2027 · Hosur campus',
  jobTitle: 'Graduate Engineer Trainee',
  stageName: 'Shortlisted',
  day: '2026-11-14',
  slotMinutes: 45,
  status: 'draft',
  sending: false,
  slots: [600, 645],
  panels: [
    { id: 'pa', name: 'Panel A', room: 'Training room 1', members: 'Prakash Menon, Deepa Das' },
    { id: 'pb', name: 'Panel B', room: 'Board room', members: 'Joseph Mathew' },
  ],
  rows: [
    { entryId: 'e1', candidate: 'Asha Rao', panelId: 'pa', start: 600, status: 'sent', error: null },
    { entryId: 'e2', candidate: 'Bala Krishnan', panelId: 'pb', start: 600, status: 'failed', error: 'The invite email did not go. Send again.' },
    { entryId: 'e3', candidate: 'Chitra Nair', panelId: 'pa', start: 645, status: 'assigned', error: null },
    { entryId: 'e4', candidate: 'Dev Patel', panelId: null, start: null, status: 'unassigned', error: null },
  ],
};
const live = (over: Partial<LiveInterviewDay> = {}): LiveInterviewDay => ({
  state: 'ready',
  onRetry: vi.fn(),
  days: [{ value: 'd1', label: 'GET 2027 · 14 Nov 2026' }],
  day: DAY,
  canManage: true,
  onPickDay: vi.fn(),
  onPlan: vi.fn(),
  onAssign: vi.fn().mockResolvedValue(undefined),
  onSend: vi.fn().mockResolvedValue({ sent: 1, failed: 1 }),
  ...over,
});
const show = (l: LiveInterviewDay) => render(<ToastProvider><BulkInterviewDayScreen live={l} /></ToastProvider>);

describe('HIR-27 interview day (live)', () => {
  it('shows each row’s own result, who does not fit, and sends only the rows not sent yet', async () => {
    const l = live();
    show(l);
    const grid = screen.getByRole('table', { name: 'Assignments by panel and slot' });
    expect(within(grid).getByText('Invite sent')).toBeInTheDocument();
    expect(within(grid).getByText('Not sent')).toBeInTheDocument();
    expect(screen.getByText(/Bala Krishnan: The invite email did not go/)).toBeInTheDocument();
    expect(screen.getByText(/1 candidates don't fit this day/)).toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send 2 invites' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send 2 invites' }));
    await waitFor(() => expect(l.onSend).toHaveBeenCalled());
    expect((await screen.findAllByText('1 invite sent')).length).toBeGreaterThan(0);
  });

  it('Send with nobody waiting is never greyed out: it says why', async () => {
    const l = live({ day: { ...DAY, rows: [DAY.rows[0]!] } });
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Send invites' }));
    expect(screen.getByText('Every invite on this day has been sent.')).toBeInTheDocument();
    expect(l.onSend).not.toHaveBeenCalled();
  });

  it('a refusal from the API stays on the page', async () => {
    show(live({ onAssign: vi.fn().mockRejectedValue(new Error('Invites are being sent for this day. Wait a moment and reload.')) }));
    await ue.click(screen.getByRole('button', { name: 'Auto-assign' }));
    expect(await screen.findByText(/Invites are being sent for this day/)).toBeInTheDocument();
  });

  it('nothing assigned yet: Auto-assign; no days: Plan an interview day; view-only without the key', async () => {
    const l = live({ day: { ...DAY, rows: [] } });
    const { unmount } = show(l);
    await ue.click(screen.getAllByRole('button', { name: 'Auto-assign' })[1]!);
    expect(l.onAssign).toHaveBeenCalled();
    unmount();
    const none = live({ day: null, days: [] });
    const r2 = show(none);
    expect(screen.getByText('No interview days yet.')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Plan an interview day' })[0]!);
    expect(none.onPlan).toHaveBeenCalled();
    r2.unmount();
    show(live({ canManage: false }));
    expect(screen.queryByRole('button', { name: /Auto-assign|Send|Plan an interview day/ })).not.toBeInTheDocument();
  });

  it('loading, error and no access states', () => {
    const { unmount } = show(live({ state: 'error' }));
    expect(screen.getByText('The interview day could not be loaded.')).toBeInTheDocument();
    unmount();
    show(live({ state: 'denied' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Plan an interview day (sheet)', () => {
  const JOBS = [{ value: 'j1', label: 'Graduate Engineer Trainee', stages: [{ value: 's1', label: 'Shortlisted' }] }];
  const PEOPLE = [{ value: 'u1', label: 'Prakash Menon' }, { value: 'u2', label: 'Deepa Das' }];
  const sheet = (onCreate = vi.fn().mockResolvedValue({ id: 'd1' })) => {
    render(<ToastProvider><InterviewDaySheet open onOpenChange={vi.fn()} jobs={JOBS} people={PEOPLE} slotMinutes={45} today={new Date(2026, 10, 10)} onCreate={onCreate} /></ToastProvider>);
    return onCreate;
  };

  it('pressed too early: field errors and focus; nothing is sent', async () => {
    const onCreate = sheet();
    await ue.click(screen.getByRole('button', { name: 'Plan the day' }));
    expect(screen.getByText('Enter a name for the day.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toHaveFocus());
    expect(screen.getByText('Choose the job.')).toBeInTheDocument();
    expect(screen.getByText('Choose who sits on the panel.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('shows the last slot from the company interview length, and refuses slots past midnight', async () => {
    const { unmount } = render(<ToastProvider><InterviewDaySheet open onOpenChange={vi.fn()} jobs={JOBS} people={PEOPLE} slotMinutes={45} today={new Date(2026, 10, 10)} onCreate={vi.fn()} /></ToastProvider>);
    expect(screen.getByText('Last ends 2:30 pm')).toBeInTheDocument(); // 10:00 + 6 × 45 min
    unmount();
    // A 4-hour interview: six slots from 10:00 run past midnight.
    const onCreate = vi.fn();
    render(<ToastProvider><InterviewDaySheet open onOpenChange={vi.fn()} jobs={JOBS} people={PEOPLE} slotMinutes={240} today={new Date(2026, 10, 10)} onCreate={onCreate} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Plan the day' }));
    expect(screen.getByText('Enter 1 to 20 slots that end by midnight.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
