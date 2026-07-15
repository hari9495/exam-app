import { renderHook, waitFor, act } from '@testing-library/react';
import { io } from 'socket.io-client';
import { AuthProvider } from '../auth-context';
import { useExamMonitoring } from './useExamMonitoring';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

type Handler = (...args: unknown[]) => void;

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

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('useExamMonitoring', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'test-token' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('connects and joins the exam room once the socket connects', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    renderHook(() => useExamMonitoring('exam-1'), { wrapper });

    await waitFor(() => expect(io).toHaveBeenCalledWith('http://localhost:3002/monitoring', {
      auth: { token: 'test-token' },
      transports: ['websocket'],
    }));

    act(() => socket.trigger('connect'));
    expect(socket.emit).toHaveBeenCalledWith('join-exam', { examId: 'exam-1' });
  });

  it('applies the roster snapshot and reports connectionStatus as connected', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
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

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
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

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
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

  it('accumulates proctoring:flag events newest-first, capped at 50', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));

    for (let i = 0; i < 52; i++) {
      act(() =>
        socket.trigger('proctoring:flag', {
          attemptId: 'a1', candidateId: 'c1', eventType: 'tab_switch', severity: 'medium', occurredAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        }),
      );
    }

    expect(result.current.alerts).toHaveLength(50);
    expect(result.current.alerts[0].occurredAt).toBe('2026-01-01T00:00:51Z');
  });

  it('surfaces a join-exam error via joinError', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { result } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
    await waitFor(() => expect(io).toHaveBeenCalled());
    act(() => socket.trigger('connect'));
    act(() => socket.trigger('error', { message: 'Exam exam-1 not found' }));

    expect(result.current.joinError).toBe('Exam exam-1 not found');
  });

  it('disconnects the socket on unmount', async () => {
    const socket = createMockSocket();
    (io as jest.Mock).mockReturnValue(socket);

    const { unmount } = renderHook(() => useExamMonitoring('exam-1'), { wrapper });
    await waitFor(() => expect(io).toHaveBeenCalled());

    unmount();

    expect(socket.disconnect).toHaveBeenCalled();
  });
});
