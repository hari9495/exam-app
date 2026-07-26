import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ui';
import * as useAttemptModerationModule from '../lib/hooks/useAttemptModeration';
import * as useProctoringEventsModule from '../lib/hooks/useProctoringEvents';
import { LiveMonitoringPanel } from './LiveMonitoringPanel';
import { RosterRow, ProctoringFlag, ConnectionStatus } from '../lib/types';
import { flaggedAttemptIds, ATTENTION_ALERT_COUNT, ATTENTION_WINDOW_MINUTES } from '../lib/attention-alert';

jest.mock('../lib/hooks/useAttemptModeration', () => ({
  useUnblockAttempt: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useBypassProctoring: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useRevokeProctoringBypass: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}));
jest.mock('../lib/hooks/useProctoringEvents', () => ({ useProctoringEvents: jest.fn() }));

const now = new Date('2026-01-01T00:10:00Z');

function renderPanel(
  monitoring: {
    roster?: RosterRow[];
    alerts?: ProctoringFlag[];
    flagged?: Set<string>;
    connectionStatus?: ConnectionStatus;
    joinError?: string | null;
  } = {},
) {
  const alerts = monitoring.alerts ?? [];
  return render(
    <ToastProvider>
      <LiveMonitoringPanel
        roster={monitoring.roster ?? []}
        alerts={alerts}
        flagged={monitoring.flagged ?? flaggedAttemptIds(alerts, Date.now())}
        connectionStatus={monitoring.connectionStatus ?? 'connected'}
        joinError={monitoring.joinError ?? null}
      />
    </ToastProvider>,
  );
}

function renderPanelWithRoster(roster: RosterRow[], alerts: ProctoringFlag[] = []): void {
  renderPanel({ roster, alerts });
}

describe('LiveMonitoringPanel', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders stat tiles computed from the roster and alert feed', () => {
    renderPanel({
      roster: [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: true, remainingSeconds: 120, answeredCount: 2, totalQuestions: 5, proctoringBypassed: false },
        { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'submitted', online: false, remainingSeconds: null, answeredCount: 5, totalQuestions: 5, proctoringBypassed: false },
      ],
      alerts: [
        { attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'medium', occurredAt: '2026-01-01T00:08:00Z' },
        { attemptId: 'a1', candidateId: 'c1', eventType: 'copy_paste', severity: 'low', occurredAt: '2025-01-01T00:00:00Z' },
      ],
    });

    expect(screen.getByText('Online now')).toBeInTheDocument();
    // The four stat tiles (online, in-progress, submitted, recent alerts) plus the
    // per-row integrity alert chip for a1 (one medium alert) all compute to 1.
    expect(screen.getAllByText('1', { exact: true })).toHaveLength(5);
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Alerts (last 5 min)')).toBeInTheDocument();
  });

  it('shows a per-row integrity alert chip counting medium/high severity alerts for that attemptId', () => {
    renderPanel({
      roster: [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: true, remainingSeconds: 120, answeredCount: 2, totalQuestions: 5, proctoringBypassed: false },
      ],
      alerts: [
        { attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'medium', occurredAt: '2026-01-01T00:08:00Z' },
        { attemptId: 'a1', candidateId: 'c1', eventType: 'copy_paste', severity: 'medium', occurredAt: '2026-01-01T00:09:00Z' },
        { attemptId: 'a1', candidateId: 'c1', eventType: 'right_click', severity: 'low', occurredAt: '2026-01-01T00:09:30Z' },
      ],
    });

    expect(screen.getByText('Integrity alerts')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the roster table with candidate rows', () => {
    renderPanel({
      roster: [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: true, remainingSeconds: 65, answeredCount: 2, totalQuestions: 5, proctoringBypassed: false },
      ],
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('in_progress')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('01:05')).toBeInTheDocument();
  });

  it('shows an empty state when no proctoring alerts have arrived', () => {
    renderPanel();

    expect(screen.getByText('No proctoring alerts yet.')).toBeInTheDocument();
  });

  it('shows the join error inline instead of the roster when one is present', () => {
    renderPanel({ joinError: 'Exam exam-1 not found' });

    expect(screen.getByText('Exam exam-1 not found')).toBeInTheDocument();
    expect(screen.queryByText('No candidates invited yet.')).not.toBeInTheDocument();
  });

  it('shows a disconnected status indicator when the socket drops', () => {
    renderPanel({ connectionStatus: 'disconnected' });

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('fires a one-time toast when connectionStatus transitions from connected to disconnected', () => {
    const { rerender } = renderPanel({ connectionStatus: 'connected' });

    expect(screen.queryByText('Live connection lost. Reconnecting…')).not.toBeInTheDocument();

    rerender(
      <ToastProvider>
        <LiveMonitoringPanel roster={[]} alerts={[]} flagged={new Set()} connectionStatus="disconnected" joinError={null} />
      </ToastProvider>,
    );

    expect(screen.getByText('Live connection lost. Reconnecting…')).toBeInTheDocument();
  });

  it('does not fire the disconnect toast on initial mount, only on a connected-to-disconnected transition', () => {
    renderPanel({ connectionStatus: 'disconnected' });

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

    it('renders a webcam snapshot thumbnail and enlarges it on click', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({
        data: [
          {
            id: 'e1',
            attemptId: 'a1',
            eventType: 'webcam_violation',
            severity: 'high',
            occurredAt: '2026-01-01T00:01:00Z',
            metadataJson: JSON.stringify({ snapshot: 'blob:webcam-1', strike: 2 }),
          },
        ],
        isLoading: false,
      } as any);

      renderPanelWithRoster(roster);
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      const thumbnail = screen.getByRole('button', { name: 'Enlarge webcam snapshot' });
      expect(thumbnail.querySelector('img')).toHaveAttribute('src', 'blob:webcam-1');
      expect(screen.getByText('Strike 2')).toBeInTheDocument();

      await user.click(thumbnail);

      expect(screen.getByText('Webcam snapshot')).toBeInTheDocument();
      expect(screen.getByAltText('Webcam snapshot')).toHaveAttribute('src', 'blob:webcam-1');
    });

    it('renders a screen capture thumbnail and enlarges it on click', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({
        data: [
          {
            id: 'e1',
            attemptId: 'a1',
            eventType: 'tab_switch',
            severity: 'high',
            occurredAt: '2026-01-01T00:01:00Z',
            metadataJson: JSON.stringify({ screenshot: 'blob:screen-1', strike: 2 }),
          },
        ],
        isLoading: false,
      } as any);

      renderPanelWithRoster(roster);
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      const thumbnail = screen.getByRole('button', { name: 'Enlarge screen capture' });
      expect(thumbnail.querySelector('img')).toHaveAttribute('src', 'blob:screen-1');

      await user.click(thumbnail);

      expect(screen.getByText('Screen capture')).toBeInTheDocument();
      expect(screen.getByAltText('Screen capture')).toHaveAttribute('src', 'blob:screen-1');
    });

    it('shows a cap-reached message instead of an image when the screen-capture cap was hit', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({
        data: [
          {
            id: 'e1',
            attemptId: 'a1',
            eventType: 'tab_switch',
            severity: 'high',
            occurredAt: '2026-01-01T00:01:00Z',
            metadataJson: JSON.stringify({ screenshotCapReached: true }),
          },
        ],
        isLoading: false,
      } as any);

      renderPanelWithRoster(roster);
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      expect(screen.getByText('Screen-capture limit reached — no image for this event')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Enlarge screen capture' })).not.toBeInTheDocument();
    });

    it('renders a human-readable duration for a window_blur event, distinguishing sub-second from long blurs', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({
        data: [
          { id: 'e1', attemptId: 'a1', eventType: 'window_blur', severity: 'low', occurredAt: '2026-01-01T00:01:00Z', metadataJson: JSON.stringify({ durationMs: 200 }) },
          { id: 'e2', attemptId: 'a1', eventType: 'window_blur', severity: 'high', occurredAt: '2026-01-01T00:02:00Z', metadataJson: JSON.stringify({ durationMs: 45000 }) },
        ],
        isLoading: false,
      } as any);

      renderPanelWithRoster(roster);
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      expect(screen.getByText('Away for 0.2s')).toBeInTheDocument();
      expect(screen.getByText('Away for 45s')).toBeInTheDocument();
    });

    it('renders a human-readable label for a paste event', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({
        data: [
          { id: 'e1', attemptId: 'a1', eventType: 'copy_paste', severity: 'medium', occurredAt: '2026-01-01T00:01:00Z', metadataJson: JSON.stringify({ action: 'paste' }) },
        ],
        isLoading: false,
      } as any);

      renderPanelWithRoster(roster);
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      expect(screen.getByText('Paste')).toBeInTheDocument();
    });

    it('renders the event plainly, without throwing, when metadataJson is malformed or not an object', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({
        data: [
          { id: 'e1', attemptId: 'a1', eventType: 'tab_switch', severity: 'medium', occurredAt: '2026-01-01T00:01:00Z', metadataJson: '{not json' },
          { id: 'e2', attemptId: 'a1', eventType: 'right_click', severity: 'low', occurredAt: '2026-01-01T00:02:00Z', metadataJson: '"a string"' },
        ],
        isLoading: false,
      } as any);

      renderPanelWithRoster(roster);
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      expect(screen.getByText('tab_switch')).toBeInTheDocument();
      expect(screen.getByText('right_click')).toBeInTheDocument();
    });

    it('renders an event with metadataJson: null as before', async () => {
      jest.spyOn(useProctoringEventsModule, 'useProctoringEvents').mockReturnValue({
        data: [
          { id: 'e1', attemptId: 'a1', eventType: 'dev_tools_detected', severity: 'high', occurredAt: '2026-01-01T00:01:00Z', metadataJson: null },
        ],
        isLoading: false,
      } as any);

      renderPanelWithRoster(roster);
      const user = userEvent.setup({ delay: null });
      await user.click(screen.getByRole('button', { name: 'View log' }));

      expect(screen.getByText('dev_tools_detected')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Enlarge webcam snapshot' })).not.toBeInTheDocument();
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

  describe('attention flag', () => {
    function burst(attemptId: string, count: number) {
      return Array.from({ length: count }, (_, i) => ({
        attemptId, candidateId: 'c1', eventType: 'tab_switch', severity: 'high',
        occurredAt: new Date(Date.now() - i * 1000).toISOString(),
      }));
    }

    it('shows a Needs attention badge for a candidate in a burst', async () => {
      renderPanelWithRoster(
        [{ candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
           online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false }],
        burst('a1', ATTENTION_ALERT_COUNT),
      );

      expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    });

    it('shows no badge below the threshold', async () => {
      renderPanelWithRoster(
        [{ candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
           online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false }],
        burst('a1', ATTENTION_ALERT_COUNT - 1),
      );

      // The alert sidebar renders one "Ann" per alert in the burst, so findByText('Ann')
      // would hit a multiple-match error here -- findAllByText waits for the same render.
      await screen.findAllByText('Ann');
      expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    });

    it('clears the badge once a burst has aged out of the attention window', async () => {
      const staleBurst = Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => ({
        attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'high',
        occurredAt: new Date(Date.now() - (ATTENTION_WINDOW_MINUTES * 60_000 + 1000) - i * 1000).toISOString(),
      }));

      renderPanelWithRoster(
        [{ candidateId: 'c1', candidateName: 'Dana', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
           online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false }],
        staleBurst,
      );

      await screen.findAllByText('Dana');
      expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    });
  });

  describe('alert feed size', () => {
    // The feed is no longer capped exam-wide (age + per-attempt retention can hold
    // thousands), so the sidebar must cap what it renders while counts stay accurate.
    function manyAlerts(attemptId: string, count: number, secondsAgoStart = 0) {
      return Array.from({ length: count }, (_, i) => ({
        attemptId, candidateId: 'c1', eventType: 'tab_switch', severity: 'medium',
        occurredAt: new Date(Date.now() - (secondsAgoStart + i) * 1000).toISOString(),
      }));
    }

    it('renders at most 50 alerts in the sidebar even when the feed holds far more', () => {
      renderPanelWithRoster(
        [{ candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
           online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false }],
        manyAlerts('a1', 200),
      );

      expect(screen.getAllByText('tab_switch')).toHaveLength(50);
    });

    it("still reports a candidate's true alert count in the per-row column past the sidebar's 50-item limit", async () => {
      const alerts = [
        ...manyAlerts('a1', 60), // within the "last 5 min" tile window
        ...manyAlerts('a1', 10, 400), // outside it, but still counted in the per-row total
      ];
      renderPanelWithRoster(
        [{ candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
           online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false }],
        alerts,
      );

      expect(await screen.findByText('60')).toBeInTheDocument(); // Alerts (last 5 min) tile
      expect(await screen.findByText('70')).toBeInTheDocument(); // Integrity alerts column: the true total, not truncated to 50
    });
  });
});
