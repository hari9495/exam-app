import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth-context';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from './useCodeGrading';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('useCodeGrading hooks', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('usePendingGrading fetches the queue for the given exam', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'test-token' }), { status: 200 });
      if (String(url).endsWith('/exams/exam-1/pending-grading')) {
        return new Response(
          JSON.stringify([{ attemptId: 'a1', candidateId: 'c1', candidateName: 'Alice', codeQuestions: [] }]),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = usePendingGrading('exam-1');
      if (isLoading || !data) return <p>Loading</p>;
      return <p>rows:{data.length}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('rows:1')).toBeInTheDocument());
  });

  it('useGradeCodeAnswer POSTs marksAwarded and feedback', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      calls.push(`${(options as RequestInit).method} ${url}`);
      return new Response(JSON.stringify({ questionId: 'q1', marksAwarded: 8, gradingFeedback: 'Good' }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useGradeCodeAnswer> | undefined;
    function Probe() {
      hook = useGradeCodeAnswer('a1');
      return null;
    }
    render(<Probe />, { wrapper });
    await hook!.mutateAsync({ questionId: 'q1', marksAwarded: 8, feedback: 'Good' });
    expect(calls.some((c) => c.includes('POST') && c.includes('/attempts/a1/answers/q1/grade'))).toBe(true);
  });

  it('useFinalizeManualGrade POSTs to the finalize endpoint', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      calls.push(`${(options as RequestInit).method} ${url}`);
      return new Response(JSON.stringify({ status: 'submitted' }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useFinalizeManualGrade> | undefined;
    function Probe() {
      hook = useFinalizeManualGrade();
      return null;
    }
    render(<Probe />, { wrapper });
    await hook!.mutateAsync('a1');
    expect(calls.some((c) => c.includes('POST') && c.includes('/attempts/a1/finalize-manual-grade'))).toBe(true);
  });

  it('useCodeReview returns null (not an error) when no review has been generated yet (404)', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'test-token' }), { status: 200 });
      if (String(url).endsWith('/attempts/a1/answers/q1/code-review')) {
        return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = useCodeReview('a1', 'q1');
      if (isLoading) return <p>Loading</p>;
      return <p>review:{data === null ? 'none' : 'present'}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('review:none')).toBeInTheDocument());
  });

  it('useRegenerateCodeReview POSTs to the regenerate endpoint', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      calls.push(`${(options as RequestInit).method} ${url}`);
      return new Response(JSON.stringify({ id: 'r1', answerId: 'answer-1', status: 'completed', suggestedMarks: 7, summary: 'ok', generatedAt: '2026-01-01' }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useRegenerateCodeReview> | undefined;
    function Probe() {
      hook = useRegenerateCodeReview();
      return null;
    }
    render(<Probe />, { wrapper });
    await hook!.mutateAsync({ attemptId: 'a1', questionId: 'q1' });
    expect(calls.some((c) => c.includes('POST') && c.includes('/attempts/a1/answers/q1/code-review/regenerate'))).toBe(true);
  });
});
