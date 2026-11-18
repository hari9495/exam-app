import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HiringDashboardScreen, type LiveHiringDashboard } from './analytics-live';

const live = (over: Partial<LiveHiringDashboard> = {}): LiveHiringDashboard => ({
  state: 'ready',
  onRetry: () => undefined,
  period: '90',
  onPeriod: () => undefined,
  data: { openJobs: 18, timeToHire: { medianDays: 33.6, hiredCount: 14 }, offers: { accepted: 18, declined: 6 }, funnel: [{ stage: 'active', reached: 120 }, { stage: 'offer', reached: 22 }, { stage: 'hired', reached: 14 }], sources: [{ source: 'referral', entered: 40, hired: 7 }] },
  costPerHire: { spend: 700000, hires: 14 },
  links: { jobs: '/jobs', candidates: '/candidates', costs: '/costs' },
  ...over,
});

describe('Hiring dashboard (ANL-02 Recruiter, answer 2432)', () => {
  it('shows open jobs, median time to hire, offer acceptance and cost per hire, each with a way in', () => {
    render(<HiringDashboardScreen live={live()} />);
    expect(screen.getByRole('heading', { name: 'Hiring dashboard', level: 1 })).toBeTruthy();
    expect(screen.getByText('34')).toBeTruthy();
    expect(screen.getByText('75')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View open jobs' }).getAttribute('href')).toBe('/jobs');
    expect(screen.getByRole('link', { name: 'View recruiting costs' }).getAttribute('href')).toBe('/costs');
    expect(screen.getAllByText('Referral').length).toBeGreaterThan(0);
  });

  it('negative: without the costs key there is no cost per hire; with no hires or answers, it says so instead of 0', () => {
    render(<HiringDashboardScreen live={live({ costPerHire: undefined, links: { jobs: '/jobs', candidates: '/candidates' }, data: { openJobs: 0, timeToHire: { medianDays: null, hiredCount: 0 }, offers: { accepted: 0, declined: 0 }, funnel: [], sources: [] } })} />);
    expect(screen.queryByText(/Cost per hire/)).toBeNull();
    expect(screen.getByText('No hires in the last 90 days')).toBeTruthy();
    expect(screen.getByText('No offers answered in the last 90 days')).toBeTruthy();
  });
});
