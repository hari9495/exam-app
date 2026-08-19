import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DashboardPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

// A full, valid analytics payload. The dashboard reads nested fields
// (scores.count, integrity.highConcernRate, ...), so a stub must supply the whole
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
      highConcern: 3,
      review: 19,
      clear: 6,
      unanalyzed: 0,
      highConcernRate: 11,
      byType: [{ type: 'tab_switch', count: 9 }],
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

// 2 miskeyed-suspect (negative discrimination) + 1 weak-discrimination, matching the
// production shape the brief calls out (5 miskeyed + 50 weak today) at test-sized numbers.
// The classification lives in `flags`, not the sign of `discrimination` -- these codes are
// what the authoritative classifyFlags() in item-statistics.ts would have produced.
function flaggedFixture() {
  return [
    { questionId: 'q-neg-1', text: 'Which of these is NOT a valid HTTP method?', discrimination: -0.4, responses: 25, percentCorrect: 0.3, flags: [{ code: 'miskeyed_suspect', severity: 'critical', message: 'Stronger candidates answered this correctly less often than weaker ones.' }], options: [], hasEnoughData: true },
    { questionId: 'q-neg-2', text: 'What does CSS stand for?', discrimination: -0.1, responses: 30, percentCorrect: 0.4, flags: [{ code: 'miskeyed_suspect', severity: 'critical', message: 'Stronger candidates answered this correctly less often than weaker ones.' }], options: [], hasEnoughData: true },
    { questionId: 'q-weak-1', text: 'Explain closures in JavaScript', discrimination: 0.05, responses: 22, percentCorrect: 0.5, flags: [{ code: 'weak_discrimination', severity: 'warning', message: 'This question barely separates stronger candidates from weaker ones.' }], options: [], hasEnoughData: true },
  ];
}

function questionHealthPanel() {
  return screen.getByText('Question Bank Health').closest('.rounded-lg') as HTMLElement;
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

  function mockDashboardFetch(summary: any, analytics: any = analyticsFixture(), flagged: any = flaggedFixture()) {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (u.includes('/dashboard/summary')) return new Response(JSON.stringify(summary), { status: 200 });
      if (u.includes('/dashboard/analytics')) return new Response(JSON.stringify(analytics), { status: 200 });
      if (u.includes('/dashboard/trend')) return new Response(JSON.stringify({ points: [] }), { status: 200 });
      if (u.includes('/analytics/questions/flagged')) return new Response(JSON.stringify(flagged), { status: 200 });
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
      expect(badge).toHaveClass('text-muted');
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

    await waitFor(() => expect(screen.getByText('Score Distribution')).toBeInTheDocument());
    expect(screen.getByText('Median')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument(); // median (unique to this panel)
    expect(screen.getByText('48–78')).toBeInTheDocument(); // middle-50% range p25-p75
  });

  // Old tests here pinned the two-segment (clean/flagged) donut and "N flagged" copy --
  // both counter-derived metrics that Task 1/3 replaced with stored-verdict counts.

  it('headlines high_concern only -- review does not drive the colour', async () => {
    // THE test this design exists for: 195 review of 265 must NOT read as an alarm.
    mockDashboardFetch(
      emptySummary,
      analyticsFixture({
        integrity: { submittedAttempts: 265, highConcern: 23, review: 195, clear: 47, unanalyzed: 0, highConcernRate: 9, byType: [] },
      }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Proctoring Integrity')).toBeInTheDocument());
    const headline = screen.getByText('9%');
    expect(headline).toBeInTheDocument();
    expect(screen.getByText(/need review/i)).toBeInTheDocument();
    // amber at 9% (>= 8, < 15), not danger -- review being the overwhelming majority must not flip this to red.
    expect(headline).toHaveClass('text-status-warning');
    expect(headline).not.toHaveClass('text-status-danger');
  });

  it('renders the unanalyzed row only when non-zero', async () => {
    mockDashboardFetch(
      emptySummary,
      analyticsFixture({
        integrity: { submittedAttempts: 28, highConcern: 3, review: 19, clear: 6, unanalyzed: 0, highConcernRate: 11, byType: [] },
      }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Proctoring Integrity')).toBeInTheDocument());
    expect(screen.queryByText(/not analysed/)).not.toBeInTheDocument();
  });

  it('renders the unanalyzed row when present', async () => {
    mockDashboardFetch(
      emptySummary,
      analyticsFixture({
        integrity: { submittedAttempts: 28, highConcern: 3, review: 17, clear: 6, unanalyzed: 2, highConcernRate: 11, byType: [] },
      }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Proctoring Integrity')).toBeInTheDocument());
    expect(screen.getByText(/2 not analysed/)).toBeInTheDocument();
  });

  it('shows the three-way breakdown as context', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByText('Proctoring Integrity')).toBeInTheDocument());
    expect(screen.getByText(/3 high concern/)).toBeInTheDocument();
    expect(screen.getByText(/19 review/)).toBeInTheDocument();
    expect(screen.getByText(/6 clear/)).toBeInTheDocument();
  });

  it('renders the hiring funnel and exam-quality table from analytics', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByText('Hiring Funnel & Throughput')).toBeInTheDocument());
    expect(screen.getByText('Exam Quality')).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText('Score Distribution')).toBeInTheDocument());
    expect(screen.queryByText('Upcoming exams')).not.toBeInTheDocument();
  });

  it('question health panel: headlines the negative-discrimination count as "Likely miskeyed"', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByText('Question Bank Health')).toBeInTheDocument());
    const panel = within(questionHealthPanel());
    expect(panel.getByText('Likely miskeyed')).toBeInTheDocument();
    // 2 negative (discrimination < 0) of the 3-row fixture -- the weak-but-positive row must not count.
    expect(panel.getByText('2')).toBeInTheDocument();
    expect(panel.getByText('1 weak discrimination')).toBeInTheDocument();
  });

  it('question health panel: orders the list worst-first by discrimination and links each row to the question edit page', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByText('Question Bank Health')).toBeInTheDocument());
    const panel = within(questionHealthPanel());
    const rows = panel.getAllByRole('link');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute('href', '/questions/q-neg-1/edit'); // -0.40, most negative
    expect(rows[0]).toHaveTextContent('-0.40');
    expect(rows[1]).toHaveAttribute('href', '/questions/q-neg-2/edit'); // -0.10
    expect(rows[2]).toHaveAttribute('href', '/questions/q-weak-1/edit'); // 0.05, least negative last
  });

  it('question health panel: a question flagged only for difficulty (null discrimination) counts in neither headline, renders "—", and sorts after measured items', async () => {
    // Mirrors flagged() including questions where pointBiserial returned null (UNMEASURABLE)
    // because they were flagged only on too_easy/very_hard -- not on discrimination at all.
    const flagged = [
      ...flaggedFixture(),
      {
        questionId: 'q-null-1',
        text: 'A question almost nobody answers correctly',
        discrimination: null,
        responses: 21,
        percentCorrect: 0.05,
        flags: [{ code: 'very_hard', severity: 'info', message: 'Very few candidates answer this correctly.' }],
        options: [],
        hasEnoughData: true,
      },
    ];
    mockDashboardFetch(emptySummary, analyticsFixture(), flagged);
    renderPage();

    await waitFor(() => expect(screen.getByText('Question Bank Health')).toBeInTheDocument());
    const panel = within(questionHealthPanel());

    // Neither headline: still exactly 2 miskeyed and 1 weak -- the difficulty-only,
    // null-discrimination row must not be coalesced into either bucket.
    expect(panel.getByText('2')).toBeInTheDocument();
    expect(panel.getByText('1 weak discrimination')).toBeInTheDocument();

    const rows = panel.getAllByRole('link');
    expect(rows).toHaveLength(4);
    // Null discrimination has no position on the ascending-discrimination scale, so it must
    // sort after every measured item, not coalesce to 0 and land mid-list.
    expect(rows[3]).toHaveAttribute('href', '/questions/q-null-1/edit');
    expect(rows[3]).toHaveTextContent('—');
    expect(rows[3]).not.toHaveTextContent('0.00');
  });

  it('question health panel: shows the positive empty state with honest subtext when nothing is flagged', async () => {
    mockDashboardFetch(emptySummary, analyticsFixture(), []);
    renderPage();

    await waitFor(() => expect(screen.getByText('Question Bank Health')).toBeInTheDocument());
    expect(screen.getByText('No question issues detected')).toBeInTheDocument();
    expect(screen.getByText('Questions with at least 20 responses are measured')).toBeInTheDocument();
  });

  it('question health panel: labels itself org-wide, independent of the dashboard filter bar', async () => {
    mockDashboardFetch(emptySummary);
    renderPage();

    await waitFor(() => expect(screen.getByText('Question Bank Health')).toBeInTheDocument());
    expect(screen.getByText('All exams, all time · questions with ≥ 20 responses')).toBeInTheDocument();
  });

  it('question health panel: shows its own error card without affecting the other panels', async () => {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (u.includes('/dashboard/summary')) return new Response(JSON.stringify(emptySummary), { status: 200 });
      if (u.includes('/dashboard/analytics')) return new Response(JSON.stringify(analyticsFixture()), { status: 200 });
      if (u.includes('/dashboard/trend')) return new Response(JSON.stringify({ points: [] }), { status: 200 });
      if (u.includes('/analytics/questions/flagged')) return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      if (u.includes('/exams')) return new Response(JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round' }], total: 1, page: 1, pageSize: 200, totalPages: 1 }), { status: 200 });
      if (u.includes('/candidates')) return new Response(JSON.stringify({ data: [{ id: 'cand-1', name: 'Ada Lovelace' }], total: 1, page: 1, pageSize: 200, totalPages: 1 }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByText('Score Distribution')).toBeInTheDocument());
    expect(screen.getByText('Hiring Funnel & Throughput')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Failed to load question health.')).toBeInTheDocument());
  });

  it('question health panel: still renders, and analytics shows an error, when the analytics fetch fails', async () => {
    // The mirror image of the test above. QuestionHealthPanel fetches independently, so a
    // failing /dashboard/analytics must not take it down -- and the analytics area must say it
    // failed rather than sit on "Loading analytics…" forever, which is what discarding
    // useDashboardAnalytics's isError did.
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (u.includes('/dashboard/summary')) return new Response(JSON.stringify(emptySummary), { status: 200 });
      if (u.includes('/dashboard/analytics')) return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      if (u.includes('/dashboard/trend')) return new Response(JSON.stringify({ points: [] }), { status: 200 });
      if (u.includes('/analytics/questions/flagged')) return new Response(JSON.stringify(flaggedFixture()), { status: 200 });
      if (u.includes('/exams')) return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 200, totalPages: 0 }), { status: 200 });
      if (u.includes('/candidates')) return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 200, totalPages: 0 }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByText('Question Bank Health')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Failed to load analytics.')).toBeInTheDocument());
    expect(screen.queryByText('Loading analytics…')).not.toBeInTheDocument();
    expect(screen.queryByText('Score Distribution')).not.toBeInTheDocument();
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
