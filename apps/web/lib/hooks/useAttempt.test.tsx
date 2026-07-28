import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ui';
import { CandidateAuthProvider } from '../candidate-auth-context';
import { useAttemptQuery, useAnswerMutation, useCodeLanguages, useRunCode, useStartAttempt, useReportProctoringEvent, useScreenShareState } from './useAttempt';

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

describe('useCodeLanguages', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Regression: the endpoint wraps its list ({ languages: [...] }). The hook must unwrap —
  // returning the raw object made the exam page's `.map` over data throw during render and
  // tear down the whole page for any-language code questions.
  it('unwraps the { languages } envelope into the bare array consumers map over', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'tok', refreshToken: 'rt' }), { status: 200 });
      }
      if (String(url).endsWith('/attempt/code-languages')) {
        return new Response(
          JSON.stringify({ languages: [{ language: 'python', version: '3.10.0' }, { language: 'javascript', version: '18.15.0' }] }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data } = useCodeLanguages(true);
      if (!data) return <p>Loading</p>;
      return <p>{`langs:${data.map((entry) => entry.language).join(',')}`}</p>;
    }
    render(<Probe />, { wrapper });

    await waitFor(() => expect(screen.getByText('langs:python,javascript')).toBeInTheDocument());
  });
});

describe('useStartAttempt', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts consent: true to /attempt/start', async () => {
    const calls: { url: string; body: unknown }[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      calls.push({ url: String(url), body: JSON.parse((options as RequestInit).body as string) });
      return new Response(JSON.stringify({ id: 'attempt-1', status: 'in_progress' }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useStartAttempt> | undefined;
    function Probe() {
      hook = useStartAttempt();
      return null;
    }
    render(<Probe />, { wrapper });

    await hook!.mutateAsync();

    expect(calls[0].url).toContain('/attempt/start');
    expect(calls[0].body).toEqual({ consent: true });
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

    // debounce (800ms) + retry backoffs across 3 attempts. The backoffs are
    // jittered by +/-25% (see lib/retry.ts -- it stops a shared Retry-After
    // from resynchronising every client), so advance past the worst case,
    // 625ms + 1250ms, rather than the nominal 500ms + 1000ms.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(800 + 625 + 1250 + 100);
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

    const result = await hook!.mutateAsync({ questionId: 'q-1', code: 'print("hi")', codeLanguage: 'python', stdin: 'Alice' });

    expect(result).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false });
    expect(calls[0].url).toContain('/attempt/run-code');
    expect(calls[0].body).toEqual({ questionId: 'q-1', code: 'print("hi")', codeLanguage: 'python', stdin: 'Alice' });
  });
});

describe('useReportProctoringEvent', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('invalidates attempt/current after a successful report, so a strike is picked up', async () => {
    let currentCallCount = 0;
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'tok', refreshToken: 'rt' }), { status: 200 });
      }
      if (String(url).endsWith('/attempt/current')) {
        currentCallCount += 1;
        const status = currentCallCount === 1 ? 'in_progress' : 'paused';
        return new Response(JSON.stringify({ status, exam: { title: 'T' }, sections: [], answers: [], messages: [], feedback: null, organizationLogoUrl: null, organizationPrimaryColor: null, webcamViolationCount: 0, browserActivityViolationCount: 1, remainingSeconds: 100 }), { status: 200 });
      }
      if (String(url).endsWith('/attempt/proctoring-event')) {
        return new Response(JSON.stringify({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium', strike: 1, status: 'paused' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    let report: ReturnType<typeof useReportProctoringEvent> | undefined;
    function Probe() {
      report = useReportProctoringEvent();
      const { data } = useAttemptQuery();
      return <p>{data && 'status' in data ? `status:${data.status}` : 'loading'}</p>;
    }

    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('status:in_progress')).toBeInTheDocument());

    act(() => {
      report!('tab_switch');
    });

    await waitFor(() => expect(screen.getByText('status:paused')).toBeInTheDocument());
  });
});

describe('useScreenShareState', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retries a transient POST failure automatically instead of giving up after one attempt', async () => {
    // Covers the most common path a client-side "only fire once" guard cannot retry on its own:
    // mount, capture required, never shared, active stays false forever -- nothing ever changes
    // to re-trigger the caller. The mutation itself must be the thing that retries.
    let shareStateCallCount = 0;
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'tok', refreshToken: 'rt' }), { status: 200 });
      }
      if (String(url).endsWith('/attempt/screen-share-state')) {
        shareStateCallCount += 1;
        if (shareStateCallCount === 1) {
          return new Response(JSON.stringify({ message: 'transient failure' }), { status: 500 });
        }
        return new Response(JSON.stringify({ status: 'paused' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    let mutate: ((payload: { active: boolean }) => void) | undefined;
    function Probe() {
      const mutation = useScreenShareState();
      mutate = mutation.mutate;
      return null;
    }

    render(<Probe />, { wrapper });
    await waitFor(() => expect(mutate).toBeDefined());

    act(() => {
      mutate!({ active: false });
    });

    // The first POST fails; without a retry nothing else would ever call fetch again for this
    // mutation (page.tsx's own guard only reruns its effect when captureEnabled/active change,
    // neither of which happens here). React Query's default backoff retries automatically.
    await waitFor(() => expect(shareStateCallCount).toBeGreaterThanOrEqual(2), { timeout: 8000 });
  }, 10000);
});
