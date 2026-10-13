'use client';

import { useRouter } from 'next/navigation';
import { CompCyclesScreen, type CompCycle, type CompMatrix, type ReviewCycle } from '@yukthix/ui/performance';
import type { LegalEntity } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../lib/yx-performance';

// Comp review cycles (PRF-10, M06 batch PM7): HR with perf.comp.manage sets them up; approvers and managers open them.
export default function YxCompCyclesPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const canManage = perms.has('perf.comp.manage');
  const cycles = usePerf<CompCycle[]>('/comp-cycles');
  const matrices = usePerf<CompMatrix[]>('/comp-matrices', canManage);
  const reviewCycles = usePerf<ReviewCycle[]>('/cycles', perms.has('perf.cycle.manage'));
  const entities = useOrg<LegalEntity[]>('/legal-entities', canManage);
  const write = usePerfWrite();
  const open = (id: string) => router.push(`/yx/performance/comp/${encodeURIComponent(id)}`);
  return (
    <CompCyclesScreen
      state={loadState(cycles)}
      onRetry={() => void cycles.refetch()}
      cycles={cycles.data ?? []}
      canManage={canManage}
      matrices={matrices.data ?? []}
      entities={(entities.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
      reviewCycles={(reviewCycles.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
      onStarterMatrix={() => write('POST', '/comp-matrices/from-starter')}
      onCreate={async (input) => open((await write<{ id: string }>('POST', '/comp-cycles', input)).id)}
      onOpen={open}
    />
  );
}
