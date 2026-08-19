import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverLimitBanner } from './OverLimitBanner';
import * as useBillingHook from '../../lib/hooks/useBilling';
import { OrgUsage } from '../../lib/types';

jest.mock('../../lib/hooks/useBilling');

const mockedUseOrgUsage = useBillingHook.useOrgUsage as jest.Mock;

function usage(overrides: Partial<OrgUsage> = {}): OrgUsage {
  return {
    planName: 'trial',
    periodStart: '2026-08-01T00:00:00.000Z',
    seats: { used: 2, limit: 5 },
    candidates: { used: 40, limit: 100 },
    aiCredits: { used: 3, limit: 10 },
    proctoringMinutes: { used: 30, limit: 60 },
    ...overrides,
  };
}

describe('OverLimitBanner', () => {
  it('renders nothing while usage is loading', () => {
    mockedUseOrgUsage.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<OverLimitBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on error', () => {
    mockedUseOrgUsage.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(<OverLimitBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every hard dimension is under its limit', () => {
    mockedUseOrgUsage.mockReturnValue({ data: usage(), isLoading: false, isError: false });
    const { container } = render(<OverLimitBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when only a soft dimension (seats/candidates) is over its limit', () => {
    mockedUseOrgUsage.mockReturnValue({
      data: usage({ seats: { used: 5, limit: 5 }, candidates: { used: 100, limit: 100 } }),
      isLoading: false,
      isError: false,
    });
    const { container } = render(<OverLimitBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the banner when aiCredits is at or over its limit', () => {
    mockedUseOrgUsage.mockReturnValue({
      data: usage({ aiCredits: { used: 10, limit: 10 } }),
      isLoading: false,
      isError: false,
    });
    render(<OverLimitBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent("You've hit your AI credit limit — contact us to upgrade.");
  });

  it('shows the banner when proctoringMinutes is over its limit', () => {
    mockedUseOrgUsage.mockReturnValue({
      data: usage({ proctoringMinutes: { used: 61, limit: 60 } }),
      isLoading: false,
      isError: false,
    });
    render(<OverLimitBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('proctoring minutes limit');
  });

  it('is dismissible and stays hidden after dismissal', async () => {
    mockedUseOrgUsage.mockReturnValue({
      data: usage({ aiCredits: { used: 10, limit: 10 } }),
      isLoading: false,
      isError: false,
    });
    render(<OverLimitBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
