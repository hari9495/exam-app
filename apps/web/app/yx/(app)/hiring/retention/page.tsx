'use client';

import { useRouter } from 'next/navigation';
import { CandidateRetentionScreen, type DataRequestMatch, type RetentionPreview, type RetentionRunRow } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useApiWrite, useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { saveBlob } from '../../../../../lib/yx-pay';

const MONTHS = ['6', '9', '12', '18', '24', '36'];

// Hiring › Candidate data retention: the designed HIR-05 retention page with `live` (founder decision 9). The period is
// the company setting ats.retention_months (default 12); data requests find a person by email (POST, so the email never
// sits in a URL), export or erase them; the sweep previews, runs and logs. Every route needs the data-rights key.
export default function YxHiringRetentionPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const { accessToken } = useAuth();
  const data = useHiring<{ months: number; runs: RetentionRunRow[] }>('/retention/runs');
  const write = useHiringWrite();
  const apiWrite = useApiWrite();
  const ls = loadState(data);
  return (
    <CandidateRetentionScreen
      months={String(data.data?.months ?? 12)}
      monthsOptions={MONTHS}
      canChange={perms.has('org.settings.manage')}
      runs={data.data?.runs ?? []}
      live={{
        state: ls === 'no-access' ? 'denied' : ls === 'ready' ? 'ready' : ls === 'loading' ? 'loading' : 'error',
        onRetry: () => void data.refetch(),
        onMonths: async (m) => {
          await apiFetch('/org/settings', { method: 'PUT', body: JSON.stringify({ key: 'ats.retention_months', scopeType: 'tenant', value: m }) }, accessToken ?? undefined);
          await data.refetch();
        },
        onPreview: () => write<RetentionPreview>('POST', '/retention/run', { dryRun: true }),
        onRun: () => write<RetentionPreview>('POST', '/retention/run', { dryRun: false }),
        onFind: async (email) => (await write<{ match: DataRequestMatch | null }>('POST', '/data-requests/lookup', { email })).match,
        onOpen: (id) => router.push(`/yx/hiring/candidates/${encodeURIComponent(id)}`),
        onExport: async (id) => {
          const body = await apiFetch(`/candidates/${encodeURIComponent(id)}/export`, {}, accessToken ?? undefined);
          saveBlob(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }), `candidate-data-${id}.json`);
        },
        onErase: async (id) => void (await apiWrite('POST', `/candidates/${encodeURIComponent(id)}/erase`)),
      }}
    />
  );
}
