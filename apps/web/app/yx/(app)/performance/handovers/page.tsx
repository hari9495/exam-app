'use client';

import { HandoverListScreen, type HandoverDecision, type HandoverRow } from '@yukthix/ui/performance';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePerf, usePerfGet, usePerfWrite } from '../../../../../lib/yx-performance';

type Row = Omit<HandoverRow, 'effective'> & { effectiveOn: string; decision: string | null };

// PRF-13 hand-over list (performance builder 3): HR with perf.cycle.manage sees every hand-over in the company; a
// manager sees what was handed over to them. A moved goal's alignment is decided here, once.
export default function YxHandoversPage() {
  const perms = useYxPermissions();
  const hr = perms.has('perf.cycle.manage');
  const rows = usePerf<Row[]>(hr ? '/handover-list/all' : '/handover-list');
  const get = usePerfGet();
  const write = usePerfWrite();
  const state = loadState(rows);
  return (
    <HandoverListScreen
      persona={hr ? 'hr' : 'mgr'}
      rows={[]}
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void rows.refetch(),
        rows: (rows.data ?? []).map((r) => ({ ...r, note: r.note ?? undefined, effective: new Date(`${r.effectiveOn}T00:00:00`) })),
        parentOptions: (id) => get<{ value: string; label: string }[]>(`/handover-list/${encodeURIComponent(id)}/parent-options`),
        onDecide: async (id: string, input: HandoverDecision) => void (await write('POST', `/handover-list/${encodeURIComponent(id)}/decide`, input)),
      }}
    />
  );
}
