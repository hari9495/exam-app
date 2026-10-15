'use client';

import { CandidateRetentionScreen, type RetentionPreview, type RetentionRunRow } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';

const MONTHS = ['6', '9', '12', '18', '24', '36'];

// Hiring › Candidate data retention (M10 batch AT4, YX-ATS-53): the period, a dry-run preview, a manual run and the log.
export default function YxHiringRetentionPage() {
  const perms = useYxPermissions();
  const { accessToken } = useAuth();
  const data = useHiring<{ months: number; runs: RetentionRunRow[] }>('/retention/runs');
  const write = useHiringWrite();
  return (
    <CandidateRetentionScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      months={String(data.data?.months ?? 12)}
      monthsOptions={MONTHS}
      canChange={perms.has('org.settings.manage')}
      onMonths={async (m) => {
        await apiFetch('/org/settings', { method: 'PUT', body: JSON.stringify({ key: 'ats.retention_months', scopeType: 'tenant', value: m }) }, accessToken ?? undefined);
        await data.refetch();
      }}
      runs={data.data?.runs ?? []}
      onPreview={() => write<RetentionPreview>('POST', '/retention/run', { dryRun: true })}
      onRun={() => write<RetentionPreview>('POST', '/retention/run', { dryRun: false })}
    />
  );
}
