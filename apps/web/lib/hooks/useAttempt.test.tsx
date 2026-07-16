import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ui';
import { CandidateAuthProvider } from '../candidate-auth-context';
import { useAttemptQuery, useAnswerMutation, useRunCode } from './useAttempt';

const mockToast = jest.fn();
jest.mock('../../components/ui', () => {
  const actual = jest.requireActual('../../components/ui');
  return { ...actual, useToast: () => ({ toast: mockToast }) };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CandidateAuthProvider>{children}</CandidateAuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function AttemptProbe() {
  const { data, isLoading } = useAttemptQuery();
  if (isLoading || !data) return <p>Loading</p>;
  return <p>{'status' in data ? `status:${data.status}` : `preview:${data.exam.title}`}</p>;
}

describe('useAttemptQuery', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('fetches the current attempt once authenticated', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'tok', refreshToken: 'rt' }), { status: 200 });
      }
      if (String(url).endsWith('/attempt/current')) {
        return new Response(JSON.stringify({ exam: { title: 'Preview Exam', instructions: null, durationMinutes: 30 } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    render(<AttemptProbe />, { wrapper });
    await waitFor(() => expect(screen.getByText('preview:Preview Exam')).toBeInTheDocument());
  });
});

describe('useAnswerMutation', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    mockToast.mockClear();
  });

  it('debounces rapid saves for the same question into one request', async () => {
    jest.useFakeTimers();
    const calls: unknown[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      calls.push(JSON.parse((options as RequestInit).body as string));
      return new Response(JSON.stringify({ questionId: 'q1', selectedOptionIds: ['b'], isMarkedForReview: false }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useAnswerMutation> | undefined;
    function Probe() {
      hook = useAnswerMutation();
      return null;
    }
    render(<Probe />, { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    act(() => {
      hook!.saveAnswer('q1', ['a']);
      hook!.saveAnswer('q1', ['b']);
    });
    await act(async () => {
      jest.advanceTimersByTime(800);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ questionId: 'q1', selectedOptionIds: ['b'] });
  });

  it('flush() fires a pending save immediately without waiting for the debounce', async () => {
    const calls: unknown[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      calls.push(JSON.parse((options as RequestInit).body as string));
      return new Response(JSON.stringify({ questionId: 'q1', selectedOptionIds: ['a'], isMarkedForReview: false }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useAnswerMutation> | undefined;
    function Probe() {
      hook = useAnswerMutation();
      return null;
    }
    render(<Probe />, { wrapper });

    act(() => {
      hook!.saveAnswer('q1', ['a']);
    });
    await act(async () => {
      await hook!.flush();
    });

    expect(calls).toHaveLength(1);
  });

  it('shows a non-blocking error toast after 3 failed retries and does not throw', async () => {
    jest.useFakeTimers();
    let answerAttempts = 0;
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      answerAttempts += 1;
      return new Response(JSON.stringify({ message: 'fail' }), { status: 500 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useAnswerMutation> | undefined;
    function Probe() {
      hook = useAnswerMutation();
      return null;
    }
    render(<Probe />, { wrapper });

    act(() => {
      hook!.saveAnswer('q1', ['a']);
    });

    // debounce (800ms) + retry backoffs (500ms + 1000ms) across 3 attempts
    await act(async () => {
      await jest.advanceTimersByTimeAsync(800 + 500 + 1000);
    });

    expect(answerAttempts).toBe(3);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});

describe('useRunCode', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts the code and stdin to /attempt/run-code and returns the sandbox result', async () => {
    const calls: { url: string; body: unknown }[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      calls.push({ url: String(url), body: JSON.parse((options as RequestInit).body as string) });
      return new Response(
        JSON.stringify({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useRunCode> | undefined;
    function Probe() {
      hook = useRunCode();
      return null;
    }
    render(<Probe />, { wrapper });

    const result = await hook!.mutateAsync({ questionId: 'q-1', code: 'print("hi")', stdin: 'Alice' });

    expect(result).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false });
    expect(calls[0].url).toContain('/attempt/run-code');
    expect(calls[0].body).toEqual({ questionId: 'q-1', code: 'print("hi")', stdin: 'Alice' });
  });
});
