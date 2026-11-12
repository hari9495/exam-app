import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductAnalyticsScreen } from './console-ops';
import type { LiveAnalytics } from './console-analytics-live';

// Console C-8, YX-09: which features companies use, counts only; hidden groups say so.
const live = (o: Partial<LiveAnalytics> = {}): LiveAnalytics => ({
  state: 'ready',
  onRetry: () => {},
  windowDays: 30,
  minCompanies: 5,
  totalCompanies: 64,
  areas: [{ key: 'time', label: 'Time and leave' }, { key: 'hiring', label: 'Hiring' }],
  byFeature: [
    { area: 'time', label: 'Time and leave', companies: 41, actions: 22400 },
    { area: 'hiring', label: 'Hiring', companies: null, actions: null },
  ],
  bySize: { bands: [{ label: 'Under 200 employees', companies: 49 }, { label: '200+ employees', companies: null }], adoption: [{ area: 'time', label: 'Time and leave', pct: [59, null] }, { area: 'hiring', label: 'Hiring', pct: [null, null] }] },
  byCompany: [{ id: 'c1', company: 'Kaveri Foods', band: 'Under 200 employees', areas: { time: 640 }, lastActive: '2026-11-11T00:00:00Z' }],
  ...o,
});
const show = (l: LiveAnalytics) => render(<ProductAnalyticsScreen funnel={[]} cohorts={[]} adoption={{ modules: [], small: [], mid: [] }} quickstart={[]} live={l} />);

describe('Product analytics (live)', () => {
  it('counts by feature; a group under the minimum says "Fewer than 5", never a small number', () => {
    show(live());
    expect(screen.getByText('41')).toBeInTheDocument();
    expect(screen.getByText('Fewer than 5')).toBeInTheDocument();
    expect(screen.getByText(/Any group of fewer than 5 companies is hidden/)).toBeInTheDocument();
  });

  it('a hidden size band is named as hidden; by company shows counts per feature', () => {
    show(live());
    expect(screen.getByText(/Hidden \(fewer than 5 companies\): 200\+ employees/)).toBeInTheDocument();
    expect(screen.getByText('Kaveri Foods')).toBeInTheDocument();
    expect(screen.getByText('640')).toBeInTheDocument();
  });

  it('every band hidden: no chart, and it says why', () => {
    show(live({ bySize: { bands: [{ label: 'Under 200 employees', companies: null }, { label: '200+ employees', companies: null }], adoption: [] } }));
    expect(screen.getByText('Every size band has fewer than 5 companies, so none is shown.')).toBeInTheDocument();
  });
});
