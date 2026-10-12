'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CycleScreen, type Disagreement, type EligibilityRow, type Preflight, type ReviewCycle, type ReviewCyclesScreenProps } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg } from '../../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// One review cycle (PRF-06, M06 batch PM4): the pre-flight check and start; then where reviews are and who is in.
export default function YxReviewCyclePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/cycles/${encodeURIComponent(id)}`;
  const cycle = usePerf<ReviewCycle>(base);
  const running = Boolean(cycle.data && cycle.data.status !== 'draft');
  const templates = usePerf<ReviewCyclesScreenProps['templates']>('/cycle-templates');
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  const funnel = usePerf<{ stage: string; label: string; count: number }[]>(running ? `${base}/funnel` : null);
  const eligibility = usePerf<EligibilityRow[]>(running ? `${base}/eligibility` : null);
  const disagreements = usePerf<Disagreement[]>(running ? `${base}/disagreements` : null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const write = usePerfWrite();
  return (
    <CycleScreen
      state={loadState(cycle)}
      onRetry={() => void cycle.refetch()}
      cycle={cycle.data ?? null}
      templates={templates.data ?? []}
      departments={(departments.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name }))}
      preflight={preflight}
      funnel={funnel.data ?? []}
      eligibility={eligibility.data ?? []}
      disagreements={disagreements.data ?? []}
      onRelease={() => write('POST', `${base}/release`)}
      onDecide={(rowId, status, hrNote) => write('POST', `/disagreements/${encodeURIComponent(rowId)}/decide`, { status, hrNote })}
      onBack={() => router.push('/yx/performance/cycles')}
      onSave={async (input) => {
        await write('PUT', base, input);
        setPreflight(null);
      }}
      onCheck={async () => setPreflight(await write<Preflight>('POST', `${base}/preflight`))}
      onLaunch={() => write('POST', `${base}/launch`, { version: cycle.data!.version })}
      onOverride={(rowId, reviewed, reason) => write('PUT', `/eligibility/${encodeURIComponent(rowId)}`, { reviewed, reason })}
    />
  );
}
