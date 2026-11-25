import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TrainingFeedbackScreen } from './learn-me';
import { liveFeedback } from './learn-feedback-samples';
import { LiveSessionPageScreen, type LiveSessionPage, type LiveSessionPageData } from './learn-sessions-live';

// LRN-12 with real records: positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('LRN-12 feedback (live)', () => {
  it('a reaction needs both ratings; then it is sent and the page moves on', async () => {
    const onReact = vi.fn().mockResolvedValue({ rated: true });
    const onDone = vi.fn();
    show(<TrainingFeedbackScreen live={liveFeedback({ onReact, onDone })} />);
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(screen.getAllByText('Choose a rating.')).toHaveLength(2);
    expect(onReact).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Overall' })).getByRole('radio', { name: /Very good/ }));
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Trainer' })).getByRole('radio', { name: /Excellent/ }));
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(onReact).toHaveBeenCalledWith('ss1', { overall: 4, trainer: 5 });
    expect(onDone).toHaveBeenCalled();
  });

  it('a refusal stays on the page; nothing to rate shows an empty state', async () => {
    const onReact = vi.fn().mockRejectedValue(new Error('You rated this session already.'));
    const { unmount } = show(<TrainingFeedbackScreen live={liveFeedback({ onReact })} />);
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Overall' })).getByRole('radio', { name: /Good/ }));
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Trainer' })).getByRole('radio', { name: /Good/ }));
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByText('You rated this session already.')).toBeInTheDocument();
    unmount();
    show(<TrainingFeedbackScreen live={liveFeedback({ session: null })} />);
    expect(screen.getByText('Nothing to rate')).toBeInTheDocument();
  });

  it('the manager check needs an answer; none due shows an empty state', async () => {
    const onCheck = vi.fn().mockResolvedValue({ checked: true });
    const { unmount } = show(<TrainingFeedbackScreen live={liveFeedback({ mode: 'manager-check', onCheck })} />);
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(screen.getByText('Choose one.')).toBeInTheDocument();
    expect(onCheck).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('radio', { name: 'Partly' }));
    await ue.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(onCheck).toHaveBeenCalledWith('e1', { applying: 'partly' });
    unmount();
    show(<TrainingFeedbackScreen live={liveFeedback({ mode: 'manager-check', checks: [] })} />);
    expect(screen.getByText('No checks due')).toBeInTheDocument();
  });
});

const PAGE: LiveSessionPageData = {
  session: { id: 'ss1', course: 'Forklift refresher', start: '2026-10-01T04:00:00.000Z', mode: 'Classroom', venue: 'Room 2', trainer: 'Divya Rao', external: false, seats: 2, enrolled: 1, waitlist: 0, status: 'Completed', cost: 0, slots: [{ id: 'sl1', label: '1 Oct', startsAt: '2026-10-01T04:00:00.000Z', endsAt: '2026-10-01T06:00:00.000Z', closed: true }], version: 2, attendancePct: 75, mandatory: false, ld: true, confirmed: true },
  enrolled: [{ enrolmentId: 'e1', employeeId: 'p1', name: 'Imran Khan', source: 'nominated' }],
  waitlist: [],
  attendance: [{ enrolmentId: 'e1', name: 'Imran Khan', marks: ['Present'], method: 'QR' }],
  results: [{ name: 'Imran Khan', status: 'Completed', reason: 'Attended 1 of 1 slots' }],
  costLines: [],
  feedback: { responses: 1, overall: 4, trainer: 5, comments: ['Good drills'] },
};
const pageLive = (data: LiveSessionPageData): LiveSessionPage => ({ state: 'ready', onRetry: () => {}, data, trainers: [], people: [], onReschedule: vi.fn(), onCancel: vi.fn(), onWithdraw: vi.fn(), onNominate: vi.fn(), onMark: vi.fn(), onConfirm: vi.fn(), onShowQr: vi.fn() });

describe('Session page feedback and results (LRN-04, LRN-12, answer 2608)', () => {
  it('L&D sees results and the feedback summary', async () => {
    show(<LiveSessionPageScreen live={pageLive(PAGE)} />);
    await ue.click(screen.getByRole('tab', { name: 'Feedback' }));
    expect(screen.getByText('“Good drills”')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Results' })).toBeInTheDocument();
  });

  it('a trainer who is not L&D gets no Results tab; no ratings yet shows an empty state', async () => {
    show(<LiveSessionPageScreen live={pageLive({ ...PAGE, session: { ...PAGE.session, ld: false }, results: [], feedback: { responses: 0, overall: null, trainer: null, comments: [] } })} />);
    expect(screen.queryByRole('tab', { name: 'Results' })).toBeNull();
    await ue.click(screen.getByRole('tab', { name: 'Feedback' }));
    expect(screen.getByText('No feedback yet')).toBeInTheDocument();
  });
});
