import { render, screen } from '@testing-library/react';
import BillingSettingsPage from './page';
import * as useBillingHook from '../../../../lib/hooks/useBilling';
import { OrgUsage } from '../../../../lib/types';

jest.mock('../../../../lib/hooks/useBilling');

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

describe('BillingSettingsPage', () => {
  it('shows a loading state before usage has loaded', () => {
    mockedUseOrgUsage.mockReturnValue({ data: undefined });
    const { container } = render(<BillingSettingsPage />);
    // The bare "Loading…" text was replaced by the shared skeleton, which marks itself aria-busy.
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the plan name, each dimension as used / limit, and the reset date', () => {
    mockedUseOrgUsage.mockReturnValue({ data: usage() });
    render(<BillingSettingsPage />);

    expect(screen.getByText('trial')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('40 / 100')).toBeInTheDocument();
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(screen.getByText('30 / 60')).toBeInTheDocument();
    // periodStart is UTC midnight on 2026-08-01 -> next reset must be September 2026 for
    // EVERY viewer regardless of local timezone. Assert on the rendered text (not a re-derived
    // Date, which could carry the same local-getter bug) so this fails on the old local-getter
    // implementation when run on a negative-UTC-offset machine. Check for month + year
    // substrings rather than a fixed day/month/year ordering, since that depends on locale.
    const resetText = screen.getByText(/Usage resets on/i).textContent;
    expect(resetText).toContain('September');
    expect(resetText).toContain('2026');
  });

  it('rolls the reset date over to January of the next year for a December periodStart', () => {
    mockedUseOrgUsage.mockReturnValue({ data: usage({ periodStart: '2026-12-01T00:00:00.000Z' }) });
    render(<BillingSettingsPage />);

    const resetText = screen.getByText(/Usage resets on/i).textContent;
    expect(resetText).toContain('January');
    expect(resetText).toContain('2027');
  });

  it('flags a dimension as over limit with a warning icon when used >= limit', () => {
    mockedUseOrgUsage.mockReturnValue({ data: usage({ seats: { used: 5, limit: 5 } }) });
    render(<BillingSettingsPage />);

    const seatsRow = screen.getByText('5 / 5').closest('span');
    expect(seatsRow).toHaveTextContent('⚠');
    expect(screen.getByLabelText('over limit')).toBeInTheDocument();
  });

  it('does not flag a dimension under its limit', () => {
    mockedUseOrgUsage.mockReturnValue({ data: usage() });
    render(<BillingSettingsPage />);
    expect(screen.queryByLabelText('over limit')).not.toBeInTheDocument();
  });
});
