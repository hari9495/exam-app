import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ui';
import { useExamMonitoring } from '../lib/hooks/useExamMonitoring';
import * as useExamMonitoringModule from '../lib/hooks/useExamMonitoring';
import * as useAttemptModerationModule from '../lib/hooks/useAttemptModeration';
import * as useProctoringEventsModule from '../lib/hooks/useProctoringEvents';
import { LiveMonitoringPanel } from './LiveMonitoringPanel';

jest.mock('../lib/hooks/useExamMonitoring', () => ({ useExamMonitoring: jest.fn() }));
jest.mock('../lib/hooks/useAttemptModeration', () => ({ useUnblockAttempt: jest.fn() }));
jest.mock('../lib/hooks/useProctoringEvents', () => ({ useProctoringEvents: jest.fn() }));

const now = new Date('2026-01-01T00:10:00Z');

function renderPanel(examId = 'exam-1') {
  return render(
    <ToastProvider>
      <LiveMonitoringPanel examId={examId} />
    </ToastProvider>,
  );
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
    jest.spyOn(useExamMonitoringModule, 'useExamMonitoring').mockReturnValue({
      roster: [{ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'blocked', online: true, remainingSeconds: null, answeredCount: 2, totalQuestions: 5 }],
      alerts: [],
      leaderboard: [],
      connectionStatus: 'connected',
      joinError: null,
    });
    const mutate = jest.fn();
    jest.spyOn(useAttemptModerationModule, 'useUnblockAttempt').mockReturnValue({ mutate, isPending: false } as any);

    renderPanel();

    // userEvent's default click uses real setTimeout delays, which hangs under this
    // file's jest.useFakeTimers(); delay: null makes it synchronous.
    const user = userEvent.setup({ delay: null });
    const unblockButton = screen.getByRole('button', { name: /unblock/i });
    await user.click(unblockButton);
    // The component passes onSuccess/onError toast callbacks as a second arg (see Step 7 of the brief).
    expect(mutate).toHaveBeenCalledWith('a1', expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }));
  });

  describe('proctoring log modal', () => {
    beforeEach(() => {
      jest.spyOn(useExamMonitoringModule, 'useExamMonitoring').mockReturnValue({
        roster: [{ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'blocked', online: true, remainingSeconds: null, answeredCount: 2, totalQuestions: 5 }],
        alerts: [],
        leaderboard: [],
        connectionStatus: 'connected',
        joinError: null,
      });
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

      renderPanel();
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      expect(screen.getByText('Proctoring log')).toBeInTheDocument();
      expect(screen.getByText('dev_tools_detected')).toBeInTheDocument();
      expect(screen.getByText('tab_switch')).toBeInTheDocument();
      expect(useProctoringEventsModule.useProctoringEvents).toHaveBeenCalledWith('a1');
    });

    it('shows an empty state in the log modal when the attempt has no recorded events', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({ data: [], isLoading: false } as any);

      renderPanel();
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      expect(screen.getByText('No proctoring events recorded for this attempt.')).toBeInTheDocument();
    });
  });
});
