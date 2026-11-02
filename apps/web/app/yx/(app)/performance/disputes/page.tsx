'use client';

import { useRouter } from 'next/navigation';
import { DisputeListScreen } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf } from '../../../../../lib/yx-performance';

type Row = { id: string; ref: string; employee: string; cycle: string; raisedOn: string; status: 'raised' | 'resolved'; legalHold: boolean };

// PRF-15 escalated rating disputes (performance builder 3): only perf.dispute.manage holders in scope; listing is audited.
export default function YxDisputesPage() {
  const router = useRouter();
  const rows = usePerf<Row[]>('/disputes');
  const state = loadState(rows);
  return (
    <DisputeListScreen
      state={state === 'no-access' ? 'error' : state}
      onRetry={() => void rows.refetch()}
      rows={(rows.data ?? []).map((r) => ({ id: r.id, ref: r.ref, employee: r.employee, cycle: r.cycle, raised: new Date(`${r.raisedOn}T00:00:00`), status: r.status === 'resolved' ? 'Resolved' : 'Raised', legalHold: r.legalHold }))}
      onOpen={(id) => router.push(`/yx/performance/disputes/${encodeURIComponent(id)}`)}
    />
  );
}
