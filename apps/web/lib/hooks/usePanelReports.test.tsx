import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth-context';
import {
  useResultsSummary,
  useResultsList,
  useAttemptInsight,
  useRegenerateAttemptInsight,
  useResultsExport,
} from './usePanelReports';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('usePanelReports', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('useResultsSummary fetches the summary for the given exam', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'test-token' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/results/summary')) {
        return new Response(JSON.stringify({ totalCandidates: 3, settledCount: 2, inProgressCount: 1, notStartedCount: 0, passRate: 50, averagePercentage: 60, scoreDistribution: [], attemptDuration: null }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = useResultsSummary('exam-1');
      if (isLoading || !data) return <p>Loading</p>;
      return <p>total:{data.totalCandidates}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('total:3')).toBeInTheDocument());
  });

  it('useResultsList fetches the candidate result rows for the given exam', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'test-token' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/results')) {
        return new Response(JSON.stringify([{ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt: null, proctoringAnalysis: null }]), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = useResultsList('exam-1');
      if (isLoading || !data) return <p>Loading</p>;
      return <p>rows:{data.length}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('rows:1')).toBeInTheDocument());
  });

  it('useAttemptInsight returns null (not an error) when the insight has not been generated yet (404)', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'test-token' }), { status: 200 });
      }
      if (String(url).endsWith('/attempts/a1/ai-insight')) {
        return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = useAttemptInsight('a1');
      if (isLoading) return <p>Loading</p>;
      return <p>insight:{data === null ? 'none' : 'present'}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('insight:none')).toBeInTheDocument());
  });

  it('useRegenerateAttemptInsight posts to the regenerate endpoint', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'test-token' }), { status: 200 });
      }
      calls.push(`${(options as RequestInit).method} ${url}`);
      return new Response(JSON.stringify({ id: 'ins-1', attemptId: 'a1', status: 'pending', summary: null, generatedAt: '2026-01-01' }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useRegenerateAttemptInsight> | undefined;
    function Probe() {
      hook = useRegenerateAttemptInsight();
      return null;
    }
    render(<Probe />, { wrapper });
    await hook!.mutateAsync('a1');
    expect(calls.some((c) => c.includes('POST') && c.includes('/attempts/a1/ai-insight/regenerate'))).toBe(true);
  });

  it('useResultsExport calls the export endpoint with the given format and returns a blob', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'test-token' }), { status: 200 });
      }
      if (String(url).includes('/exams/exam-1/results/export?format=csv')) {
        return new Response(new Blob(['a,b']), { status: 200, headers: { 'Content-Disposition': 'attachment; filename="exam-exam-1-results.csv"' } });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useResultsExport> | undefined;
    function Probe() {
      hook = useResultsExport('exam-1');
      return null;
    }
    render(<Probe />, { wrapper });
    const result = await hook!.mutateAsync('csv');
    expect(result.filename).toBe('exam-exam-1-results.csv');
  });
});
