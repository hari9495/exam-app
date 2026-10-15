'use client';

import { useRouter } from 'next/navigation';
import { ReviewCyclesScreen, type ReviewCycle, type ReviewCyclesScreenProps } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg } from '../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

// Review cycles (PRF-06, M06 batch PM4): HR with perf.cycle.manage start cycles from an active template.
export default function YxReviewCyclesPage() {
  const router = useRouter();
  const cycles = usePerf<ReviewCycle[]>('/cycles');
  const templates = usePerf<ReviewCyclesScreenProps['templates']>('/cycle-templates');
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  const write = usePerfWrite();
  const open = (id: string) => router.push(`/yx/performance/cycles/${encodeURIComponent(id)}`);
  return (
    <ReviewCyclesScreen
      state={loadState(cycles, templates)}
      onRetry={() => void Promise.all([cycles.refetch(), templates.refetch()])}
      cycles={cycles.data ?? []}
      templates={templates.data ?? []}
      departments={(departments.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name }))}
      onCreate={async (input) => open((await write<{ id: string }>('POST', '/cycles', input)).id)}
      onOpen={open}
    />
  );
}
