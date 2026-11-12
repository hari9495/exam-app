'use client';

import { ProductAnalyticsScreen, type LiveAnalytics } from '@yukthix/ui/console';
import { loadState, useConsole } from '../../../../lib/yx-console';

type Overview = Omit<LiveAnalytics, 'state' | 'onRetry'>;
const EMPTY: Overview = { windowDays: 30, minCompanies: 5, totalCompanies: 0, areas: [], byFeature: [], bySize: { bands: [], adoption: [] }, byCompany: [] };

// Console › Product analytics (C-8, YX-09): which features companies use, counts only; groups under 5 companies hidden.
export default function ConsoleAnalyticsPage() {
  const data = useConsole<Overview>('/analytics');
  return <ProductAnalyticsScreen funnel={[]} cohorts={[]} adoption={{ modules: [], small: [], mid: [] }} quickstart={[]} live={{ ...(data.data ?? EMPTY), state: loadState(data), onRetry: () => void data.refetch() }} />;
}
