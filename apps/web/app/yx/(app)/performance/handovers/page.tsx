'use client';

import { HandoverListScreen, type HandoverAuditEntry, type HandoverDecision, type HandoverRow, PerfNoAccessScreen } from '@yukthix/ui/performance';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePerf, usePerfGet, usePerfWrite, refused } from '../../../../../lib/yx-performance';

type Row = Omit<HandoverRow, 'effective'> & { effectiveOn: string; decision: string | null };

// PRF-13 hand-over list (performance builder 3): HR with perf.cycle.manage sees every hand-over in the company; a
// manager sees what was handed over to them. A moved goal's alignment is decided here, once. HR may take open decisions
// off the new manager ("Reassign to HR") and read each hand-over's audit entry.
export default function YxHandoversPage() {
  const perms = useYxPermissions();
  const hr = perms.has('perf.cycle.manage');
  const rows = usePerf<Row[]>(hr ? '/handover-list/all' : '/handover-list');
  const get = usePerfGet();
  const write = usePerfWrite();
  const state = loadState(rows);
  if (refused(rows)) return <PerfNoAccessScreen title="Hand-over list" what="the hand-over list" grantedBy="HR" active="Reviews & cycles" persona="hr" />;
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
        ...(hr
          ? {
              onWithHr: (ids: string[]) => write<{ moved: number; skipped: { id: string; reason: string }[] }>('POST', '/handover-list/with-hr', { ids }),
              auditOf: async (id: string): Promise<HandoverAuditEntry[]> => (await get<(Omit<HandoverAuditEntry, 'at'> & { at: string })[]>(`/handover-list/${encodeURIComponent(id)}/audit`)).map((e) => ({ ...e, at: new Date(e.at) })),
            }
          : {}),
      }}
    />
  );
}
