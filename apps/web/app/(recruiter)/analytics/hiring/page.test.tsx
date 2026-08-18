import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HiringAnalyticsPage from './page';
import { HiringAnalytics, JobListItem } from '../../../../lib/types';

jest.mock('../../../../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token' }) }));

const JOBS: JobListItem[] = [
  {
    id: 'job-1',
    title: 'Backend Engineer',
    status: 'open',
    createdAt: '2026-08-01T00:00:00.000Z',
    stageCounts: { applied: 2, screened: 1, interview: 0, offer: 0, hired: 1, rejected: 0 },
  },
  {
    id: 'job-2',
    title: 'Frontend Engineer',
    status: 'closed',
    createdAt: '2026-08-02T00:00:00.000Z',
    stageCounts: { applied: 1, screened: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
  },
];

jest.mock('../../../../lib/hooks/usePipeline', () => ({ useJobs: () => ({ data: JOBS }) }));

const FIXTURE: HiringAnalytics = {
  funnel: [
    { stage: 'applied', reached: 10, conversionFromPrev: null },
    { stage: 'screened', reached: 6, conversionFromPrev: 0.6 },
    { stage: 'interview', reached: 4, conversionFromPrev: 0.667 },
    { stage: 'offer', reached: 2, conversionFromPrev: 0.5 },
    { stage: 'hired', reached: 1, conversionFromPrev: 0.5 },
  ],
  timeToHire: { avgDays: 12.5, medianDays: 10, hiredCount: 1 },
  sources: [{ source: 'referral', entered: 5, hired: 1, hireRate: 0.2 }],
  jobs: [{ jobId: 'job-1', title: 'Backend Engineer', status: 'open', entered: 10, hired: 1, conversionPct: 10, avgTimeToHireDays: 12.5 }],
};

const useHiringAnalyticsMock = jest.fn((_params: { from: string; to: string; jobId?: string }) => ({ data: FIXTURE, isLoading: false }));
jest.mock('../../../../lib/hooks/useHiringAnalytics', () => ({
  useHiringAnalytics: (params: { from: string; to: string; jobId?: string }) => useHiringAnalyticsMock(params),
}));

describe('HiringAnalyticsPage', () => {
  beforeEach(() => useHiringAnalyticsMock.mockClear());

  it('renders the funnel, time-to-hire tiles, a source row, and a job row linking to the job', () => {
    render(<HiringAnalyticsPage />);

    expect(screen.getByRole('img', { name: 'Applied: 10' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hired: 1' })).toBeInTheDocument();

    expect(screen.getByText('Avg time to hire').nextElementSibling).toHaveTextContent('12.5');
    expect(screen.getByText('Median time to hire').nextElementSibling).toHaveTextContent('10.0');
    expect(screen.getByText('Hired', { selector: 'p' }).nextElementSibling).toHaveTextContent('1');

    expect(screen.getByText('referral')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();

    const jobLink = screen.getByRole('link', { name: 'Backend Engineer' });
    expect(jobLink).toHaveAttribute('href', '/jobs/job-1');
  });

  it('refetches with the new jobId when the job dropdown changes', async () => {
    render(<HiringAnalyticsPage />);

    expect(useHiringAnalyticsMock).toHaveBeenLastCalledWith(expect.objectContaining({ jobId: undefined }));

    await userEvent.click(screen.getByRole('combobox', { name: 'Job' }));
    await userEvent.click(screen.getByRole('option', { name: 'Backend Engineer' }));

    expect(useHiringAnalyticsMock).toHaveBeenLastCalledWith(expect.objectContaining({ jobId: 'job-1' }));
    // Selecting a single job drops the org-wide jobs table.
    expect(screen.queryByRole('link', { name: 'Backend Engineer' })).not.toBeInTheDocument();
  });
});
