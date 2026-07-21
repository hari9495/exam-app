import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

describe('DashboardPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockSummaryFetch(summary: any) {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(JSON.stringify(summary), { status: 200 });
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
      funnel: { invited: 312, started: 200, submitted: 180, passed: 90 },
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
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
      funnel: { invited: 0, started: 0, submitted: 0, passed: 0 },
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
      funnel: { invited: 0, started: 0, submitted: 0, passed: 0 },
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
      funnel: { invited: 0, started: 0, submitted: 0, passed: 0 },
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('3 candidates invited to Backend Round')).toBeInTheDocument());
  });

  it('renders the candidate funnel and upcoming exams widgets', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      funnel: { invited: 100, started: 60, submitted: 55, passed: 22 },
      upcomingExams: [{ examId: 'exam-3', examTitle: 'Scheduled Round', availabilityWindowStart: '2026-08-01T09:00:00.000Z' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Scheduled Round')).toBeInTheDocument());
    expect(screen.getByText(/Scheduled Round/).closest('a')).toHaveAttribute('href', '/exams/exam-3/edit');
  });

  it('shows an empty-state message when there are no upcoming exams', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      funnel: { invited: 0, started: 0, submitted: 0, passed: 0 },
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
