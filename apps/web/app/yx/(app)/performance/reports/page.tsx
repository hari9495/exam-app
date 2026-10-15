'use client';

import { useState } from 'react';
import { PerformanceReportsScreen, type PerfReport, type ReportKind } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf, usePerfDownload } from '../../../../../lib/yx-performance';

// Performance reports (§13, M06 batch PM6): people in my scope; small groups are not shown.
export default function YxPerformanceReportsPage() {
  const cycles = usePerf<{ value: string; label: string }[]>('/report-cycles');
  const [chosen, setChosen] = useState<string | null>(null);
  const [kind, setKind] = useState<ReportKind>('completion');
  const cycleId = chosen ?? cycles.data?.[0]?.value ?? null;
  const report = usePerf<PerfReport>(cycleId ? `/reports/${kind}?cycle=${encodeURIComponent(cycleId)}` : null);
  const download = usePerfDownload();
  return (
    <PerformanceReportsScreen
      state={loadState(cycles, ...(cycleId ? [report] : []))}
      onRetry={() => void Promise.all([cycles.refetch(), report.refetch()])}
      cycles={cycles.data ?? []}
      cycleId={cycleId}
      onCycle={setChosen}
      kind={kind}
      onKind={setKind}
      report={report.data ?? null}
      onDownload={cycleId ? () => download(`/reports/${kind}/csv?cycle=${encodeURIComponent(cycleId)}`, `performance-${kind}.csv`) : undefined}
    />
  );
}
