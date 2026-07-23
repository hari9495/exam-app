import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

describe('DashboardPage', () => {
  const originalFetch = global.fetch;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    // Recharts' ResponsiveContainer measures its container via ResizeObserver /
    // getBoundingClientRect to size its chart. jsdom has no layout engine, so both
    // report 0x0, which makes Recharts warn on every render. Report a real size so
    // the chart renders without the "width(0) and height(0)" console.warn noise.
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.getBoundingClientRect = () =>
      ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  function mockSummaryFetch(summary: any) {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(JSON.stringify(summary), { status: 200 });
      }
      if (String(url).includes('/dashboard/trend')) {
        return new Response(JSON.stringify({ points: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/exam-performance')) {
        return new Response(JSON.stringify({ exams: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/funnel')) {
        return new Response(JSON.stringify({ invited: 0, started: 0, submitted: 0, passed: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
  }

  function renderPage() {
    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <DashboardPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );
  }

  it('renders the 4 stat cards from the summary endpoint', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('refetches a stat card trend when its window dropdown changes', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    const fetchMock = global.fetch as jest.Mock;
    const trendCallsBefore = fetchMock.mock.calls.filter(([url]) => String(url).includes('/dashboard/trend?metric=candidates')).length;
    expect(trendCallsBefore).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('days=14'))).toBe(true);

    const trigger = screen.getAllByLabelText('Trend window')[0];
    fireEvent.click(trigger);
    const option = await screen.findByText('30 days');
    fireEvent.click(option);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=candidates&days=30'))).toBe(true),
    );
  });

  it('renders the exam performance chart and refetches when its filters change', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(
          JSON.stringify({
            stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
            attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
            activity: [],
            upcomingExams: [],
            // ponytail: page.tsx still reads summary.funnel (pre-existing Task 8 leftover,
            // removed only in Task 10). Included here so this new test isn't blocked by
            // that unrelated, already-known bug; not a statement about the funnel feature.
            funnel: { invited: 0, started: 0, submitted: 0, passed: 0 },
          }),
          { status: 200 },
        );
      }
      if (String(url).includes('/dashboard/trend')) {
        return new Response(JSON.stringify({ points: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/exam-performance')) {
        return new Response(
          JSON.stringify({ exams: [{ examId: 'exam-1', examTitle: 'Backend Round', passRate: 70, avgScore: 62, candidateCount: 12 }] }),
          { status: 200 },
        );
      }
      if (String(url).includes('/dashboard/funnel')) {
        return new Response(JSON.stringify({ invited: 0, started: 0, submitted: 0, passed: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByText('Exam performance')).toBeInTheDocument());

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/exam-performance?limit=5&window=all'))).toBe(true);

    const limitTrigger = screen.getByLabelText('Top exams');
    fireEvent.click(limitTrigger);
    const tenOption = await screen.findByText('Top 10');
    fireEvent.click(tenOption);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/exam-performance?limit=10&window=all'))).toBe(true),
    );
  });

  it('renders attention items with their counts', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 4 },
      attention: {
        pendingGrading: [{ examId: 'exam-1', examTitle: 'Backend Round — Python', count: 4 }],
        recentProctoringFlags: [],
        staleInvitationCount: 6,
      },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/Backend Round — Python/)).toBeInTheDocument());
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/Backend Round — Python/).closest('a')).toHaveAttribute('href', '/exams/exam-1/edit');
  });

  it('links proctoring-flag attention items to their exam', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: {
        pendingGrading: [],
        recentProctoringFlags: [{ examId: 'exam-2', examTitle: 'Frontend Round — React', occurredAt: '2026-07-17T10:00:00Z' }],
        staleInvitationCount: 0,
      },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/Frontend Round — React/)).toBeInTheDocument());
    expect(screen.getByText(/Frontend Round — React/).closest('a')).toHaveAttribute('href', '/exams/exam-2/edit');
  });

  it('renders the recent activity feed', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [{ id: 'log-1', description: '3 candidates invited to Backend Round', occurredAt: '2026-07-17T10:00:00Z' }],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('3 candidates invited to Backend Round')).toBeInTheDocument());
  });

  it('renders the upcoming exams widget', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [{ examId: 'exam-3', examTitle: 'Scheduled Round', availabilityWindowStart: '2026-08-01T09:00:00.000Z' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Scheduled Round')).toBeInTheDocument());
    expect(screen.getByText(/Scheduled Round/).closest('a')).toHaveAttribute('href', '/exams/exam-3/edit');
  });

  it('renders the candidate funnel from the funnel endpoint and refetches when its filters change', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(
          JSON.stringify({
            stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
            attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
            activity: [],
            upcomingExams: [],
          }),
          { status: 200 },
        );
      }
      if (String(url).includes('/dashboard/trend')) {
        return new Response(JSON.stringify({ points: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/exam-performance')) {
        return new Response(JSON.stringify({ exams: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/funnel')) {
        return new Response(JSON.stringify({ invited: 100, started: 60, submitted: 55, passed: 22 }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round' }], total: 1, page: 1, pageSize: 100, totalPages: 1 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Invited: 100')).toBeInTheDocument());
    expect(screen.getByLabelText('Started: 60')).toBeInTheDocument();
    expect(screen.getByLabelText('Submitted: 55')).toBeInTheDocument();
    expect(screen.getByLabelText('Passed: 22')).toBeInTheDocument();

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/funnel?examId=all&window=all'))).toBe(true);

    const examTrigger = screen.getByLabelText('Funnel exam');
    fireEvent.click(examTrigger);
    const examOption = await screen.findByText('Backend Round');
    fireEvent.click(examOption);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/funnel?examId=exam-1&window=all'))).toBe(true),
    );
  });

  it('shows an empty-state message when there are no upcoming exams', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('No upcoming exams.')).toBeInTheDocument());
  });

  it('shows an error state when the summary fetch fails', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
