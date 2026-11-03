'use client';

import { useRouter } from 'next/navigation';
import { CycleSetupScreen, type Preflight, type ReviewCycle } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg } from '../../../../../lib/yx-org';
import { perfState, usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

type Templates = { id: string; name: string; kind: ReviewCycle['kind']; templateVersion: number }[];

/** PRF-04 cycle set-up for a new cycle or a draft (HR with perf.cycle.manage company-wide). */
export function CycleSetup({ cycle, state, onRetry }: { cycle: ReviewCycle | null; state?: 'ready' | 'loading' | 'error'; onRetry?: () => void }) {
  const router = useRouter();
  const templates = usePerf<Templates>('/cycle-templates');
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  // PRF-04: who can run calibration sessions, for the sessions planned in the wizard.
  const facilitators = usePerf<{ value: string; label: string }[]>('/calibration-facilitators');
  const write = usePerfWrite();
  const ready = perfState(loadState(templates));
  return (
    <CycleSetupScreen
      key={cycle?.id ?? "new"}
      live={{
        state: state && state !== 'ready' ? state : ready,
        onRetry: () => void (onRetry?.(), templates.refetch()),
        cycle,
        templates: templates.data ?? [],
        departments: (departments.data ?? []).filter((d) => !d.archivedAt).map((d) => ({ value: d.id, label: d.name })),
        facilitators: facilitators.data ?? [],
        onSave: (input, id) => (id ? write<ReviewCycle>('PUT', `/cycles/${encodeURIComponent(id)}`, input) : write<ReviewCycle>('POST', '/cycles', input)),
        onPeer: (id, peer) => (peer ? write('PUT', `/cycles/${encodeURIComponent(id)}/peer-feedback`, peer) : cycle?.peerFeedback ? write('DELETE', `/cycles/${encodeURIComponent(id)}/peer-feedback`) : Promise.resolve()),
        onCheck: (id) => write<Preflight>('POST', `/cycles/${encodeURIComponent(id)}/preflight`),
        onLaunch: (id, version) => write('POST', `/cycles/${encodeURIComponent(id)}/launch`, { version }),
        onDone: (id, launched) => router.push(launched ? `/yx/performance/cycles/${encodeURIComponent(id)}` : '/yx/performance#cycles'),
      }}
    />
  );
}
