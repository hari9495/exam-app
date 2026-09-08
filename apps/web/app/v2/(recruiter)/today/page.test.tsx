import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as useTodayHooks from '../../../../lib/hooks/useToday';
import * as useCurrentUserHooks from '../../../../lib/hooks/useCurrentUser';
import { TodayResponse } from '../../../../lib/types';
import V2TodayPage from './page';

jest.mock('../../../../lib/hooks/useToday');
jest.mock('../../../../lib/hooks/useCurrentUser');

const mockedUseToday = useTodayHooks.useToday as jest.Mock;
const mockedUseCurrentUser = useCurrentUserHooks.useCurrentUser as jest.Mock;

const TIME_ZONE = 'Asia/Kolkata';

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

function fixture(overrides: Partial<TodayResponse> = {}): TodayResponse {
  return {
    today: { iso: '2026-09-08T00:00:00.000Z', timeZone: TIME_ZONE },
    needsYou: {
      feedbackOwed: [
        { id: 'f1', candidateId: 'c1', candidateName: 'Asha Rao', subtitle: 'Backend Engineer · interviewed today · scorecard due', at: '2026-09-08T09:00:00.000Z', actionLabel: 'Add feedback', actionHref: '/v2/jobs/j1' },
      ],
      interviewsToday: [
        { id: 'i1', candidateId: 'c2', candidateName: 'Ben Cole', subtitle: 'Frontend Engineer · 14:00 with panel', at: '2026-09-08T14:00:00.000Z', actionLabel: 'Open brief', actionHref: '/v2/jobs/j2' },
      ],
      offersExpiring: [],
      approvalsPending: [
        { id: 'a1', candidateId: null, candidateName: 'Staff Engineer', subtitle: 'Requisition · waiting for your decision', at: '2026-09-07T10:00:00.000Z', actionLabel: 'Review', actionHref: '/v2/approvals' },
      ],
      total: 3,
    },
    watch: { staleInvitations: 4, proctoringFlags: 2, nextDrive: null },
    week: { newApplicants: 12, invited: 8, awaitingGrading: 3, passRate: 62 },
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <V2TodayPage />
    </QueryClientProvider>,
  );
}

describe('V2TodayPage', () => {
  let getHoursSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedUseCurrentUser.mockReturnValue({ data: { name: 'Priya Sharma' } });
    getHoursSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9); // morning
  });

  afterEach(() => {
    getHoursSpy.mockRestore();
  });

  it('renders "Loading…" while the query is loading', () => {
    mockedUseToday.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders an alert on error', () => {
    mockedUseToday.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load today. Try again.");
  });

  it('shows the greeting with the first name and the total count', () => {
    mockedUseToday.mockReturnValue({ data: fixture(), isLoading: false, isError: false });
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Priya.');
    expect(document.body).toHaveTextContent('3 things need you today.');
  });

  it('shows the singular line when total is 1', () => {
    mockedUseToday.mockReturnValue({
      data: fixture({ needsYou: { feedbackOwed: [], interviewsToday: [], offersExpiring: [], approvalsPending: fixture().needsYou.approvalsPending, total: 1 } }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(document.body).toHaveTextContent('One thing needs you today.');
  });

  it('shows the all-clear line (twice: greeting + card) when total is 0, and still renders the rail', () => {
    mockedUseToday.mockReturnValue({
      data: fixture({ needsYou: { feedbackOwed: [], interviewsToday: [], offersExpiring: [], approvalsPending: [], total: 0 } }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getAllByText('Nothing needs you right now.')).toHaveLength(2);
    expect(screen.getByText(/worth a look/i)).toBeInTheDocument();
    expect(screen.getByText(/this week/i)).toBeInTheDocument();
  });

  it('renders needsYou groups in the fixed order, hides empty groups, and labels each "Label · n"', () => {
    mockedUseToday.mockReturnValue({ data: fixture(), isLoading: false, isError: false });
    renderPage();
    const headers = screen.getAllByText(/·\s*\d+$/).map((el) => el.textContent);
    const order = headers.filter((h) => h && ['Feedback you owe', 'Interviews today', 'Offers expiring', 'Approvals waiting on you'].some((label) => h.startsWith(label)));
    expect(order).toEqual(['Feedback you owe · 1', 'Interviews today · 1', 'Approvals waiting on you · 1']);
    expect(screen.queryByText(/Offers expiring/)).not.toBeInTheDocument();
  });

  it('exactly one action has the primary/solid variant; it is the first row of the first non-empty group', () => {
    mockedUseToday.mockReturnValue({ data: fixture(), isLoading: false, isError: false });
    renderPage();
    const primaryLinks = document.querySelectorAll('a[data-variant="primary"]');
    const outlineLinks = document.querySelectorAll('a[data-variant="outline"]');
    expect(primaryLinks).toHaveLength(1);
    expect(primaryLinks[0]).toHaveTextContent('Add feedback');
    expect(outlineLinks.length).toBeGreaterThan(0);
  });

  it('a row shows the candidate name, subtitle, the time in today.timeZone, and links the action', () => {
    mockedUseToday.mockReturnValue({ data: fixture(), isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText('Ben Cole')).toBeInTheDocument();
    expect(screen.getByText('Frontend Engineer · 14:00 with panel')).toBeInTheDocument();
    expect(screen.getByText(fmtTime('2026-09-08T14:00:00.000Z'))).toBeInTheDocument();
    const openBrief = screen.getByRole('link', { name: 'Open brief' });
    expect(openBrief).toHaveAttribute('href', '/v2/jobs/j2');
  });

  it('"Worth a look" rows appear only for non-zero/non-null values, and the card is absent when all are empty', () => {
    mockedUseToday.mockReturnValue({ data: fixture(), isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText('4 invitations unopened for 5+ days')).toBeInTheDocument();
    expect(screen.getByText('2 proctoring flags waiting for your review')).toBeInTheDocument();
    expect(screen.queryByText(/Walk-in drive/)).not.toBeInTheDocument();
  });

  it('hides the "Worth a look" card entirely when staleInvitations/proctoringFlags/nextDrive are all empty', () => {
    mockedUseToday.mockReturnValue({ data: fixture({ watch: { staleInvitations: 0, proctoringFlags: 0, nextDrive: null } }), isLoading: false, isError: false });
    renderPage();
    expect(screen.queryByText(/worth a look/i)).not.toBeInTheDocument();
  });

  it('shows the nextDrive row when present', () => {
    mockedUseToday.mockReturnValue({
      data: fixture({ watch: { staleInvitations: 0, proctoringFlags: 0, nextDrive: { id: 'd1', name: 'Drive', groupName: 'Walk-ins', startsAt: '2026-09-10T10:00:00.000Z', registered: 7 } } }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByText(/Walk-in drive .* · 7 registered/)).toBeInTheDocument();
  });

  it('"This week" shows the three numbers and the pass-rate sentence only when passRate is not null', () => {
    mockedUseToday.mockReturnValue({ data: fixture(), isLoading: false, isError: false });
    renderPage();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('3', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText(/Pass rate is holding at 62%/)).toBeInTheDocument();
  });

  it('omits the pass-rate sentence when passRate is null', () => {
    mockedUseToday.mockReturnValue({ data: fixture({ week: { newApplicants: 12, invited: 8, awaitingGrading: 3, passRate: null } }), isLoading: false, isError: false });
    renderPage();
    expect(screen.queryByText(/Pass rate is holding/)).not.toBeInTheDocument();
  });

  it('has a "Full reports" link pointing at /v2/reports', () => {
    mockedUseToday.mockReturnValue({ data: fixture(), isLoading: false, isError: false });
    renderPage();
    expect(screen.getByRole('link', { name: 'Full reports' })).toHaveAttribute('href', '/v2/reports');
  });
});
