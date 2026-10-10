'use client';

import { useRouter } from 'next/navigation';
import { ExitCasesScreen, type ExitRow, type IrOverview } from '@yukthix/ui/lifecycle';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// People › Exits (PPL-19; design §10): resignations and company exits in scope; HR starts company exits here.
export default function YxExitsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const canStart = perms.has('lifecycle.exit.manage');
  const data = useLife<{ today: string; rows: ExitRow[] }>('/lifecycle/exits');
  const places = useJoinerPlaces(canStart);
  const write = useLifeWrite();
  const ir = useLife<IrOverview>(canStart ? '/lifecycle/ir-permissions' : null);
  return (
    <ExitCasesScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      rows={data.data?.rows ?? null}
      today={data.data?.today ?? ''}
      canStart={canStart}
      people={places.managers}
      permissions={(ir.data?.requests ?? []).filter((r) => r.kind !== 'layoff' && r.status !== 'refused').map((r) => ({ value: r.id, label: `${r.kind} applied ${r.appliedOn} (${r.status})` }))}
      onStart={(x) => write<{ id: string }>('POST', '/lifecycle/exits', x)}
      onOpen={(id) => router.push(`/yx/people/exits/${encodeURIComponent(id)}`)}
    />
  );
}
