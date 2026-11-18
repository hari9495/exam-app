'use client';

import { useState } from 'react';
import { NoAccessState } from '@yukthix/ui';
import { HiringDashboardScreen, type HiringPeriod, type LiveHiringDashboard } from '@yukthix/ui/assessments';
import { useApi, useHiring } from '../../../../../lib/yx-hiring';
import { quarterOf, quarterSpend, type ApiCost } from '../../../../../lib/yx-hiring-costs';
import { useYxPermissions } from '../../../../../lib/yx-org';

// Answer 2432 (decision 2398): Hire › Dashboard, the designed ANL-02 Recruiter dashboard, live, in place of the older
// /v2 recruiting overview and hiring analytics. The API checks results:view; cost per hire only with the costs key.
type Overview = { from: string; to: string; hires: number };
export default function YxHiringDashboardPage() {
  const [period, setPeriod] = useState<HiringPeriod>('90');
  const perms = useYxPermissions();
  const reader = perms.has('results:view' as never);
  const costsKey = perms.has('ats.costs.manage' as never);
  const from = new Date(Date.now() - Number(period) * 86_400_000).toISOString();
  const data = useApi<LiveHiringDashboard['data']>(reader ? `/analytics/hiring?from=${encodeURIComponent(from.slice(0, 10))}` : null);
  const costs = useHiring<ApiCost[]>('/costs', costsKey);
  const overview = useHiring<Overview>('/costs/overview', costsKey);
  if (perms.isSuccess && !reader) return <NoAccessState grantedBy="HR" what="the hiring dashboard" />;
  const months = overview.data ? quarterOf(overview.data.from, overview.data.to).months : [];
  return (
    <HiringDashboardScreen
      live={{
        state: data.isError ? 'error' : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        period,
        onPeriod: setPeriod,
        data: data.data ?? null,
        costPerHire: costsKey ? (overview.data && costs.data ? { spend: quarterSpend(costs.data, months), hires: overview.data.hires } : null) : undefined,
        links: { jobs: '/yx/hiring/jobs', candidates: '/yx/hiring/candidates', ...(costsKey ? { costs: '/yx/hiring/costs' } : {}) },
      }}
    />
  );
}
