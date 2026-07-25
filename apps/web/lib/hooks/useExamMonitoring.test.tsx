import { renderHook, waitFor, act } from '@testing-library/react';
import { io } from 'socket.io-client';
import { useAuth } from '../auth-context';
import { useExamMonitoring } from './useExamMonitoring';
import {
  ALERT_RETENTION_MINUTES,
  ATTENTION_ALERT_COUNT,
  MAX_ALERTS_PER_ATTEMPT,
  flaggedAttemptIds,
} from '../attention-alert';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('../auth-context', () => ({ useAuth: jest.fn() }));

type Handler = (...args: unknown[]) => void;

// Timestamps are relative to the real clock: retention is now age-based, so a fixed
// literal date would fall out of the window depending on when the suite runs.
const startedAt = Date.now();
function flag(attemptId: string, candidateId: string, secondsAgo: number) {
  return {
    attemptId,
    candidateId,
    eventType: 'tab_switch',
    severity: 'medium',
    occurredAt: new Date(startedAt - secondsAgo * 1000).toISOString(),
  };
}

function createMockSocket() {
  const handlers: Record<string, Handler> = {};
  return {
    on: jest.fn((event: string, handler: Handler) => {
      handlers[event] = handler;
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

function mockAccessToken(accessToken: string | null) {
  (useAuth as jest.Mock).mockReturnValue({
    accessToken,
    organizationSlug: 'acme',
    role: 'recruiter',
    isLoading: false,
    login: jest.fn(),
    logout: jest.fn(),
  });
}

describe('useExamMonitoring', () => {
  beforeEach(() => {
    mockAccessToken('test-token');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('connects and joins the exam room once the socket connects', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    renderHook(() => useExamMonitoring('exam-1'));

    await waitFor(() => expect(io).toHaveBeenCalled());
    const [url, options] = (io as jest.Mock).mock.calls[0];
    expect(url).toBe('http://localhost:3002/monitoring');
    expect(options.transports).toEqual(['websocket']);
    expect(typeof options.auth).toBe('function');
    const authCb = jest.fn();
    options.auth(authCb);
    expect(authCb).toHaveBeenCalledWith({ token: 'test-token' });

    act(() => socket.trigger('connect'));
    expect(socket.emit).toHaveBeenCalledWith('join-exam', { examId: 'exam-1' });
  });

  it('applies the roster snapshot and reports connectionStatus as connected', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    const row = {
      candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1',
      status: 'invited', online: false, remainingSeconds: null, answeredCount: null, totalQuestions: null,
    };
    act(() => socket.trigger('roster:snapshot', [row]));

    expect(result.current.roster).toEqual([row]);
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('applies a roster:presence update to the matching attempt only', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));
    act(() =>
      socket.trigger('roster:snapshot', [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: false, remainingSeconds: 100, answeredCount: 0, totalQuestions: 5 },
        { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'in_progress', online: false, remainingSeconds: 100, answeredCount: 0, totalQuestions: 5 },
      ]),
    );

    act(() => socket.trigger('roster:presence', { attemptId: 'a1', candidateId: 'c1', online: true }));

    expect(result.current.roster.find((r) => r.attemptId === 'a1')?.online).toBe(true);
    expect(result.current.roster.find((r) => r.attemptId === 'a2')?.online).toBe(false);
  });

  it('applies an attempt:status update to the matching attempt', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));
    act(() =>
      socket.trigger('roster:snapshot', [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'invited', online: false, remainingSeconds: null, answeredCount: null, totalQuestions: null },
      ]),
    );

    act(() => socket.trigger('attempt:status', { attemptId: 'a1', candidateId: 'c1', status: 'in_progress' }));

    expect(result.current.roster[0].status).toBe('in_progress');
  });

  it('applies an attempt:status update for a candidate whose roster row has no attempt yet', async () => {
    // Regression: a freshly invited candidate's roster row has attemptId: null until
    // they start — the very first attempt:status event must still be able to find
    // that row, which requires matching by candidateId rather than attemptId.
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));
    act(() =>
      socket.trigger('roster:snapshot', [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: null, status: 'invited', online: false, remainingSeconds: null, answeredCount: null, totalQuestions: null },
      ]),
    );

    act(() => socket.trigger('attempt:status', { attemptId: 'a1', candidateId: 'c1', status: 'in_progress' }));

    expect(result.current.roster[0].status).toBe('in_progress');
    expect(result.current.roster[0].attemptId).toBe('a1');
  });

  it('merges an attempt:proctoring-bypass update into the matching roster row only', async () => {
    // Without this the recruiter's row keeps offering "Relax proctoring" after a
    // successful relax — the roster is socket state, so no query invalidation reaches it.
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));
    act(() =>
      socket.trigger('roster:snapshot', [
        { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'in_progress', online: true, remainingSeconds: 100, answeredCount: 0, totalQuestions: 5, proctoringBypassed: false },
        { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'in_progress', online: true, remainingSeconds: 100, answeredCount: 0, totalQuestions: 5, proctoringBypassed: false },
      ]),
    );

    act(() => socket.trigger('attempt:proctoring-bypass', { attemptId: 'a1', proctoringBypassed: true }));

    expect(result.current.roster.find((r) => r.attemptId === 'a1')?.proctoringBypassed).toBe(true);
    expect(result.current.roster.find((r) => r.attemptId === 'a2')?.proctoringBypassed).toBe(false);

    act(() => socket.trigger('attempt:proctoring-bypass', { attemptId: 'a1', proctoringBypassed: false }));

    expect(result.current.roster.find((r) => r.attemptId === 'a1')?.proctoringBypassed).toBe(false);
  });

  it('accumulates proctoring:flag events newest-first and drops ones older than the retention window', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    for (let i = 0; i < 52; i++) {
      act(() => socket.trigger('proctoring:flag', flag('a1', 'c1', 52 - i)));
    }
    // Retention is by age, not by an exam-wide count: 52 recent alerts for one attempt
    // all survive, where the old 50-event buffer would have evicted two.
    expect(result.current.alerts).toHaveLength(52);
    expect(result.current.alerts[0].occurredAt).toBe(flag('a1', 'c1', 1).occurredAt);

    act(() =>
      socket.trigger('proctoring:flag', {
        ...flag('a1', 'c1', 0),
        occurredAt: new Date(Date.now() - (ALERT_RETENTION_MINUTES + 1) * 60_000).toISOString(),
      }),
    );

    expect(result.current.alerts).toHaveLength(52);
  });

  it('keeps every candidate flaggable when the whole fleet misfires at once', async () => {
    // Regression: with a 50-event exam-wide buffer, 30 candidates each firing 5 alerts
    // left ~1.7 alerts per candidate in the feed and nobody could ever be flagged --
    // the feature went dark in exactly the scenario it exists for.
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    for (let round = 0; round < ATTENTION_ALERT_COUNT; round++) {
      for (let candidate = 0; candidate < 30; candidate++) {
        act(() => socket.trigger('proctoring:flag', flag(`a${candidate}`, `c${candidate}`, round)));
      }
    }

    expect(flaggedAttemptIds(result.current.alerts, Date.now()).size).toBe(30);
  });

  it('caps a single spamming attempt without evicting anyone else', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    act(() => socket.trigger('proctoring:flag', flag('quiet', 'c-quiet', 0)));
    for (let i = 0; i < MAX_ALERTS_PER_ATTEMPT + 10; i++) {
      act(() => socket.trigger('proctoring:flag', flag('noisy', 'c-noisy', i)));
    }

    const alerts = result.current.alerts;
    expect(alerts.filter((a) => a.attemptId === 'noisy')).toHaveLength(MAX_ALERTS_PER_ATTEMPT);
    expect(alerts.filter((a) => a.attemptId === 'quiet')).toHaveLength(1);
  });

  it('seeds the alert feed from proctoring:recent and still appends live flags', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    act(() =>
      socket.trigger('proctoring:recent', [
        { ...flag('a1', 'c1', 0), severity: 'high' },
        { ...flag('a2', 'c2', 0), eventType: 'window_blur' },
      ]),
    );

    expect(result.current.alerts).toHaveLength(2);

    act(() => socket.trigger('proctoring:flag', { ...flag('a1', 'c1', 1), eventType: 'copy_paste' }));

    expect(result.current.alerts).toHaveLength(3);
    expect(result.current.alerts[0].eventType).toBe('copy_paste');
  });

  it('drops seeded history older than the retention window', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    act(() =>
      socket.trigger('proctoring:recent', [
        flag('a1', 'c1', 0),
        { ...flag('a2', 'c2', 0), occurredAt: new Date(Date.now() - (ALERT_RETENTION_MINUTES + 1) * 60_000).toISOString() },
      ]),
    );

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].attemptId).toBe('a1');
  });

  it('updates leaderboard state on leaderboard:snapshot and leaderboard:update', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    act(() => socket.trigger('leaderboard:snapshot', [{ rank: 1, candidateId: 'c1', candidateName: 'Alice', correctCount: 2 }]));
    expect(result.current.leaderboard).toEqual([{ rank: 1, candidateId: 'c1', candidateName: 'Alice', correctCount: 2 }]);

    act(() => socket.trigger('leaderboard:update', [{ rank: 1, candidateId: 'c2', candidateName: 'Bob', correctCount: 3 }]));
    expect(result.current.leaderboard).toEqual([{ rank: 1, candidateId: 'c2', candidateName: 'Bob', correctCount: 3 }]);
  });

  it('surfaces a join-exam error via joinError', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));
    act(() => socket.trigger('error', { message: 'Exam exam-1 not found' }));

    expect(result.current.joinError).toBe('Exam exam-1 not found');
  });

  it('reports connectionStatus as disconnected when the initial handshake fails (connect_error)', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());

    expect(result.current.connectionStatus).toBe('connecting');
    act(() => socket.trigger('connect_error', new Error('xhr poll error')));

    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('disconnects the socket on unmount', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { unmount } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalled());

    unmount();

    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('keeps the socket connected and preserves accumulated alerts across an access-token refresh', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result, rerender } = renderHook(() => useExamMonitoring('exam-1'));
    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    act(() => socket.trigger('connect'));

    act(() => socket.trigger('proctoring:flag', flag('a1', 'c1', 0)));
    expect(result.current.alerts).toHaveLength(1);

    // Simulate AuthProvider.silentRefresh() swapping in a new token after a 401.
    mockAccessToken('refreshed-token');
    rerender();

    // The effect must not have torn down and reconnected the socket.
    expect(io).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    // The alert accumulated before the refresh must still be present.
    expect(result.current.alerts).toHaveLength(1);
  });
});
