import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ui';
import { useExamMonitoring } from '../lib/hooks/useExamMonitoring';
import * as useExamMonitoringModule from '../lib/hooks/useExamMonitoring';
import * as useAttemptModerationModule from '../lib/hooks/useAttemptModeration';
import * as useProctoringEventsModule from '../lib/hooks/useProctoringEvents';
import { LiveMonitoringPanel } from './LiveMonitoringPanel';
import { RosterRow } from '../lib/types';

jest.mock('../lib/hooks/useExamMonitoring', () => ({ useExamMonitoring: jest.fn() }));
jest.mock('../lib/hooks/useAttemptModeration', () => ({
  useUnblockAttempt: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useBypassProctoring: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useRevokeProctoringBypass: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}));
jest.mock('../lib/hooks/useProctoringEvents', () => ({ useProctoringEvents: jest.fn() }));

const now = new Date('2026-01-01T00:10:00Z');

function renderPanel(examId = 'exam-1') {
  return render(
    <ToastProvider>
      <LiveMonitoringPanel examId={examId} />
    </ToastProvider>,
  );
}

function renderPanelWithRoster(roster: RosterRow[]): void {
  jest.spyOn(useExamMonitoringModule, 'useExamMonitoring').mockReturnValue({
    roster,
    alerts: [],
    connectionStatus: 'connected',
    joinError: null,
  } as any);
  renderPanel();
}

describe('LiveMonitoringPanel', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders stat tiles computed from the roster and alert feed', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({
      roster: [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: true, remainingSeconds: 120, answeredCount: 2, totalQuestions: 5 },
        { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'submitted', online: false, remainingSeconds: null, answeredCount: 5, totalQuestions: 5 },
      ],
      alerts: [
        { attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'medium', occurredAt: '2026-01-01T00:08:00Z' },
        { attemptId: 'a1', candidateId: 'c1', eventType: 'copy_paste', severity: 'low', occurredAt: '2025-01-01T00:00:00Z' },
      ],
      connectionStatus: 'connected',
      joinError: null,
    });

    renderPanel();

    expect(screen.getByText('Online now')).toBeInTheDocument();
    // The four stat tiles (online, in-progress, submitted, recent alerts) plus the
    // per-row integrity alert chip for a1 (one medium alert) all compute to 1.
    expect(screen.getAllByText('1', { exact: true })).toHaveLength(5);
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Alerts (last 5 min)')).toBeInTheDocument();
  });

  it('shows a per-row integrity alert chip counting medium/high severity alerts for that attemptId', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({
      roster: [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: true, remainingSeconds: 120, answeredCount: 2, totalQuestions: 5 },
      ],
      alerts: [
        { attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'medium', occurredAt: '2026-01-01T00:08:00Z' },
        { attemptId: 'a1', candidateId: 'c1', eventType: 'copy_paste', severity: 'medium', occurredAt: '2026-01-01T00:09:00Z' },
        { attemptId: 'a1', candidateId: 'c1', eventType: 'right_click', severity: 'low', occurredAt: '2026-01-01T00:09:30Z' },
      ],
      connectionStatus: 'connected',
      joinError: null,
    });

    renderPanel();

    expect(screen.getByText('Integrity alerts')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the roster table with candidate rows', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({
      roster: [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: true, remainingSeconds: 65, answeredCount: 2, totalQuestions: 5 },
      ],
      alerts: [],
      connectionStatus: 'connected',
      joinError: null,
    });

    renderPanel();

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('in_progress')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('01:05')).toBeInTheDocument();
  });

  it('shows an empty state when no proctoring alerts have arrived', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'connected', joinError: null });

    renderPanel();

    expect(screen.getByText('No proctoring alerts yet.')).toBeInTheDocument();
  });

  it('shows the join error inline instead of the roster when one is present', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'connected', joinError: 'Exam exam-1 not found' });

    renderPanel();

    expect(screen.getByText('Exam exam-1 not found')).toBeInTheDocument();
    expect(screen.queryByText('No candidates invited yet.')).not.toBeInTheDocument();
  });

  it('shows a disconnected status indicator when the socket drops', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'disconnected', joinError: null });

    renderPanel();

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('fires a one-time toast when connectionStatus transitions from connected to disconnected', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'connected', joinError: null });
    const { rerender } = renderPanel();

    expect(screen.queryByText('Live connection lost. Reconnecting…')).not.toBeInTheDocument();

    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'disconnected', joinError: null });
    rerender(
      <ToastProvider>
        <LiveMonitoringPanel examId="exam-1" />
      </ToastProvider>,
    );

    expect(screen.getByText('Live connection lost. Reconnecting…')).toBeInTheDocument();
  });

  it('does not fire the disconnect toast on initial mount, only on a connected-to-disconnected transition', () => {
    (useExamMonitoring as jest.Mock).mockReturnValue({ roster: [], alerts: [], connectionStatus: 'disconnected', joinError: null });

    renderPanel();

    expect(screen.queryByText('Live connection lost. Reconnecting…')).not.toBeInTheDocument();
  });

  it('shows an Unblock action for a blocked candidate and calls the mutation on click', async () => {
    const mutate = jest.fn();
    jest.spyOn(useAttemptModerationModule, 'useUnblockAttempt').mockReturnValue({ mutate, isPending: false } as any);

    renderPanelWithRoster([
      { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'blocked', online: true, remainingSeconds: null, answeredCount: 2, totalQuestions: 5, proctoringBypassed: false },
    ]);

    // userEvent's default click uses real setTimeout delays, which hangs under this
    // file's jest.useFakeTimers(); delay: null makes it synchronous.
    const user = userEvent.setup({ delay: null });
    const unblockButton = screen.getByRole('button', { name: /unblock/i });
    await user.click(unblockButton);
    // The component passes onSuccess/onError toast callbacks as a second arg (see Step 7 of the brief).
    expect(mutate).toHaveBeenCalledWith('a1', expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }));
  });

  describe('proctoring log modal', () => {
    const roster: RosterRow[] = [
      { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'blocked', online: true, remainingSeconds: null, answeredCount: 2, totalQuestions: 5, proctoringBypassed: false },
    ];

    beforeEach(() => {
      jest.spyOn(useAttemptModerationModule, 'useUnblockAttempt').mockReturnValue({ mutate: jest.fn(), isPending: false } as any);
    });

    it('opens a modal listing the attempt proctoring events when View log is clicked', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({
        data: [
          { id: 'e1', attemptId: 'a1', eventType: 'dev_tools_detected', severity: 'high', occurredAt: '2026-01-01T00:01:00Z', metadataJson: null },
          { id: 'e2', attemptId: 'a1', eventType: 'tab_switch', severity: 'medium', occurredAt: '2026-01-01T00:02:00Z', metadataJson: null },
        ],
        isLoading: false,
      } as any);

      renderPanelWithRoster(roster);
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      expect(screen.getByText('Proctoring log')).toBeInTheDocument();
      expect(screen.getByText('dev_tools_detected')).toBeInTheDocument();
      expect(screen.getByText('tab_switch')).toBeInTheDocument();
      expect(useProctoringEventsModule.useProctoringEvents).toHaveBeenCalledWith('a1');
    });

    it('shows an empty state in the log modal when the attempt has no recorded events', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({ data: [], isLoading: false } as any);

      renderPanelWithRoster(roster);
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      expect(screen.getByText('No proctoring events recorded for this attempt.')).toBeInTheDocument();
    });
  });

  describe('proctoring bypass', () => {
    it('keeps the confirm button disabled until a reason is typed', async () => {
      renderPanelWithRoster([
        { candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
          online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false },
      ]);

      // See the Unblock test above: userEvent's default click uses real setTimeout
      // delays, which hangs under this file's jest.useFakeTimers(); delay: null makes it synchronous.
      const user = userEvent.setup({ delay: null });
      await user.click(await screen.findByRole('button', { name: 'Relax proctoring' }));

      expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

      await user.type(screen.getByLabelText('Why are you relaxing proctoring?'), 'webcam driver crashing');

      expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled();
    });

    it('shows a badge and a restore action for an already-bypassed attempt', async () => {
      renderPanelWithRoster([
        { candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
          online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: true },
      ]);

      expect(await screen.findByText('Proctoring relaxed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Restore proctoring' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Relax proctoring' })).not.toBeInTheDocument();
    });

    it('offers neither action on a settled attempt, which the server would reject with a 400', async () => {
      renderPanelWithRoster([
        { candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'submitted',
          online: false, remainingSeconds: null, answeredCount: 5, totalQuestions: 5, proctoringBypassed: false },
        { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'auto_submitted',
          online: false, remainingSeconds: null, answeredCount: 5, totalQuestions: 5, proctoringBypassed: true },
        { candidateId: 'c3', candidateName: 'Cat', invitationId: 'i3', attemptId: 'a3', status: 'force_submitted',
          online: false, remainingSeconds: null, answeredCount: 5, totalQuestions: 5, proctoringBypassed: false },
      ]);

      expect(await screen.findByText('Ann')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Relax proctoring' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Restore proctoring' })).not.toBeInTheDocument();
    });

    it('offers the relax action from paused and blocked, not just in_progress', async () => {
      renderPanelWithRoster([
        { candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'paused',
          online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false },
        { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'blocked',
          online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false },
      ]);

      expect(await screen.findAllByRole('button', { name: 'Relax proctoring' })).toHaveLength(2);
    });
  });
});
