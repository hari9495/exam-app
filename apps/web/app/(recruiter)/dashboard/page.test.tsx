import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

// A full, valid analytics payload. The dashboard reads nested fields
// (scores.count, integrity.flaggedRate, ...), so a stub must supply the whole
// shape or the panels throw -- the production API always returns it complete.
function analyticsFixture(overrides: Record<string, unknown> = {}) {
  return {
    scores: {
      count: 30,
      passRate: 60,
      avg: 62,
      median: 65,
      p25: 48,
      p75: 78,
      distribution: Array.from({ length: 10 }, (_, i) => ({ bucket: `${i * 10}-${i * 10 + 9}`, count: i })),
    },
    integrity: {
      submittedAttempts: 28,
      cleanAttempts: 22,
      flaggedAttempts: 6,
      flaggedRate: 21,
      byType: [{ type: 'tab_switch', count: 9 }],
      bySeverity: [{ severity: 'high', count: 3 }],
    },
    funnel: { invited: 100, started: 60, submitted: 55, passed: 22, completionRate: 92, abandoned: 5 },
    timing: { avgMinutes: 34, medianMinutes: 31, distribution: [{ bucket: '<5m', count: 0 }, { bucket: '5-15m', count: 4 }] },
    examQuality: [
      { examId: 'exam-1', examTitle: 'Backend Round', candidateCount: 12, avgScore: 62, passRate: 70, scoreSpread: 14, avgMinutes: 34, allottedMinutes: 60 },
    ],
    questionDifficulty: [{ questionId: 'q1', text: 'Hardest question here', correctRate: 22, answered: 18 }],
    ...overrides,
  };
}

describe('DashboardPage', () => {
  const originalFetch = global.fetch;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
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

  function mockDashboardFetch(summary: any, analytics: any = analyticsFixture()) {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (u.includes('/dashboard/summary')) return new Response(JSON.stringify(summary), { status: 200 });
      if (u.includes('/dashboard/analytics')) return new Response(JSON.stringify(analytics), { status: 200 });
      if (u.includes('/dashboard/trend')) return new Response(JSON.stringify({ points: [] }), { status: 200 });
      if (u.includes('/exams')) return new Response(JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round' }], total: 1, page: 1, pageSize: 200, totalPages: 1 }), { status: 200 });
      if (u.includes('/candidates')) return new Response(JSON.stringify({ data: [{ id: 'cand-1', name: 'Ada Lovelace' }], total: 1, page: 1, pageSize: 200, totalPages: 1 }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
  }

  const emptySummary = {
    stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
    attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
    activity: [],
    upcomingExams: [],
  };

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
    mockDashboardFetch({ ...emptySummary, stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 } });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('shows a neutral flat indicator, not a green up arrow, when a stat card has 0% trend', async () => {
    mockDashboardFetch({ ...emptySummary, stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 } });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    // useDashboardTrend resolves { points: [] } here, so every card's change is exactly 0%.
    const flatBadges = screen.getAllByText('– 0%');
    expect(flatBadges).toHaveLength(4);
    flatBadges.forEach((badge) => {
      expect(badge).toHaveClass('text-recruiter-text-tertiary');
      expect(badge).not.toHaveClass('text-status-success');
    });
  });

  it('hides the Analysis context row until a filter narrows away from the default, then shows it', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Exam')).toBeInTheDocument());
    expect(screen.queryByText('Analysis')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Exam'));
    fireEvent.click(await screen.findByRole('option', { name: 'Backend Round' }));

    await waitFor(() => expect(screen.getByText('Analysis')).toBeInTheDocument());
  });

  it('defaults to a 14-day range and fetches summary, trends, and analytics; refetches on range change', async () => {
    mockDashboardFetch({ ...emptySummary, stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 } });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/summary?window=14d'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/analytics?window=14d'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=candidates&days=14'))).toBe(true);

    fireEvent.click(screen.getByLabelText('Range'));
    fireEvent.click(await screen.findByText('Last 30 days'));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/summary?window=30d'))).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/analytics?window=30d'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=attempts&days=30'))).toBe(true);
  });

  it('caps stat-card trend requests to 90 days on "All time" while summary/analytics use window=all', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Range')).toBeInTheDocument());
    const fetchMock = global.fetch as jest.Mock;

    fireEvent.click(screen.getByLabelText('Range'));
    fireEvent.click(await screen.findByText('All time'));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/summary?window=all'))).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/analytics?window=all'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=candidates&days=90'))).toBe(true);
  });

  it('filters analytics by exam when an exam is selected', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Exam')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Exam'));
    // 'Backend Round' also appears in the exam-quality table, so target the dropdown option.
    fireEvent.click(await screen.findByRole('option', { name: 'Backend Round' }));

    const fetchMock = global.fetch as jest.Mock;
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/analytics') && String(url).includes('examId=exam-1'))).toBe(true));
  });

  it('filters analytics to a specific month via a from/to range', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Period')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Period'));
    fireEvent.click(await screen.findByText('By month'));

    const fetchMock = global.fetch as jest.Mock;
    // Month mode emits a from/to range instead of a relative window.
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/analytics') && String(url).includes('from=') && String(url).includes('to='))).toBe(true));
  });

  it('renders the score-distribution stats from analytics', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByText('Score distribution')).toBeInTheDocument());
    expect(screen.getByText('Median')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument(); // median (unique to this panel)
    expect(screen.getByText('48–78')).toBeInTheDocument(); // middle-50% range p25-p75
  });

  it('renders the proctoring-integrity panel with the flagged rate', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByText('Proctoring integrity')).toBeInTheDocument());
    expect(screen.getByText('21%')).toBeInTheDocument(); // flaggedRate
    expect(screen.getByText(/6 flagged/)).toBeInTheDocument();
  });

  it('renders the hiring funnel and exam-quality table from analytics', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByText('Hiring funnel & throughput')).toBeInTheDocument());
    expect(screen.getByText('Exam quality')).toBeInTheDocument();
    expect(screen.getByText('Backend Round')).toBeInTheDocument();
    expect(screen.getByText('Hardest question here')).toBeInTheDocument();
  });

  it('renders attention items with their counts', async () => {
    mockDashboardFetch({
      ...emptySummary,
      stats: { ...emptySummary.stats, pendingGradingCount: 4 },
      attention: { pendingGrading: [{ examId: 'exam-1', examTitle: 'Backend Round — Python', count: 4 }], recentProctoringFlags: [], staleInvitationCount: 6 },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/Backend Round — Python/)).toBeInTheDocument());
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/Backend Round — Python/).closest('a')).toHaveAttribute('href', '/exams/exam-1/edit');
  });

  it('renders the recent activity feed', async () => {
    mockDashboardFetch({ ...emptySummary, activity: [{ id: 'log-1', description: '3 candidates invited to Backend Round', occurredAt: '2026-07-17T10:00:00Z' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('3 candidates invited to Backend Round')).toBeInTheDocument());
  });

  it('renders the upcoming exams widget when there are upcoming exams', async () => {
    mockDashboardFetch({ ...emptySummary, upcomingExams: [{ examId: 'exam-3', examTitle: 'Scheduled Round', availabilityWindowStart: '2026-08-01T09:00:00.000Z' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Scheduled Round')).toBeInTheDocument());
    expect(screen.getByText(/Scheduled Round/).closest('a')).toHaveAttribute('href', '/exams/exam-3/edit');
  });

  it('hides the upcoming-exams widget entirely when there are none', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByText('Score distribution')).toBeInTheDocument());
    expect(screen.queryByText('Upcoming exams')).not.toBeInTheDocument();
  });

  it('shows an error state when the summary fetch fails', async () => {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (u.includes('/dashboard/summary')) return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
