import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiUsageCard } from './ApiUsageCard';
import type { ApiUsageReport } from '../../../../../lib/types';

// Mocked directly (not through react-query) -- this is a pure component test of the card, mirroring
// the pipelines page.test.tsx pattern of mocking the hook module rather than the network layer.
const useApiUsageMock = jest.fn();
jest.mock('../../../../../lib/hooks/useApiUsage', () => ({
  useApiUsage: (window: number) => useApiUsageMock(window),
}));

const report30: ApiUsageReport = {
  window: 30,
  totals: { requests: 120, throttled: 4 },
  byEndpoint: [
    { endpoint: 'GET /public/candidates', requests: 100, throttled: 3 },
    { endpoint: 'GET /public/exams', requests: 20, throttled: 1 },
  ],
  byDay: [
    { day: '2026-09-06', requests: 60, throttled: 2 },
    { day: '2026-09-07', requests: 60, throttled: 2 },
  ],
};

const report90: ApiUsageReport = {
  window: 90,
  totals: { requests: 500, throttled: 10 },
  byEndpoint: [{ endpoint: 'GET /public/candidates', requests: 500, throttled: 10 }],
  byDay: [{ day: '2026-08-01', requests: 500, throttled: 10 }],
};

const emptyReport: ApiUsageReport = {
  window: 30,
  totals: { requests: 0, throttled: 0 },
  byEndpoint: [],
  byDay: [],
};

describe('ApiUsageCard', () => {
  beforeEach(() => useApiUsageMock.mockReset());

  it('renders totals and a per-endpoint table for the default 30-day window', () => {
    useApiUsageMock.mockReturnValue({ data: report30, isLoading: false });
    render(<ApiUsageCard />);

    expect(useApiUsageMock).toHaveBeenCalledWith(30);
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('GET /public/candidates')).toBeInTheDocument();
    expect(screen.getByText('GET /public/exams')).toBeInTheDocument();
  });

  it('refetches the 90-day window when that toggle is clicked', async () => {
    const user = userEvent.setup();
    useApiUsageMock.mockImplementation((window: number) => ({ data: window === 90 ? report90 : report30, isLoading: false }));
    render(<ApiUsageCard />);

    await user.click(screen.getByRole('button', { name: '90 days' }));

    expect(useApiUsageMock).toHaveBeenCalledWith(90);
    // "500" and "10" each appear twice (totals + the single by-endpoint row) -- assert presence, not uniqueness.
    expect(screen.getAllByText('500').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
  });

  it('shows an empty state when totals are both zero', () => {
    useApiUsageMock.mockReturnValue({ data: emptyReport, isLoading: false });
    render(<ApiUsageCard />);

    expect(screen.getByText('No API usage recorded yet.')).toBeInTheDocument();
    expect(screen.queryByText('GET /public/candidates')).not.toBeInTheDocument();
  });
});
