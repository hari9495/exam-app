'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { VrsScheme } from '@yukthix/ui/frame';
import type { ExitRow, IrOverview } from '@yukthix/ui/lifecycle';
import { loadState, todayIst } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;
const STATUS: Record<ExitRow['status'], string> = { submitted: 'Waiting for approval', accepted: 'Accepted · serving notice', rejected: 'Not accepted', withdrawn: 'Withdrawn', cleared: 'Cleared', exited: 'Exited', closed: 'Closed' };

// People › VRS schemes (PPL-40, design audit step 3; LIFE-5.07, YX-LC-27): the voluntary retirement scheme with its
// applications (exit cases of type VRS) and set-up, and the government permission requests for retrenchment, lay-off
// and closure. The API checks every call.
export default function YxRetrenchmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const data = useLife<IrOverview>('/lifecycle/ir-permissions');
  const exits = useLife<{ today: string; rows: ExitRow[] }>('/lifecycle/exits');
  const places = useJoinerPlaces(true);
  const write = useLifeWrite();
  const today = todayIst();
  const entity = (legalEntityId: string | null) => places.entities.find((e) => e.value === legalEntityId)?.label ?? 'the whole company';
  return (
    <VrsScheme
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        today,
        entities: places.entities,
        applications: (exits.data?.rows ?? []).filter((r) => r.exitType === 'vrs').map((r) => ({ id: r.id, name: r.name, status: STATUS[r.status], lastDay: r.lastDay })),
        onOpenCase: (caseId) => router.push(`/yx/people/exits/${id(caseId)}`),
        onApply: async (x) => {
          await write('POST', '/lifecycle/ir-permissions', x);
          toast({ tone: 'success', title: `Permission request for ${x.workersAffected} workers at ${entity(x.legalEntityId)} recorded` });
        },
        onDecide: async (r, x) => {
          await write('POST', `/lifecycle/ir-permissions/${id(r.id)}/decide`, { ...x, version: r.version });
          toast({ tone: 'success', title: `Decision on the ${r.kind} request at ${entity(r.legalEntityId)} saved` });
        },
        onClosure: async (r, x) => {
          const out = await write<{ opened: number }>('POST', `/lifecycle/ir-permissions/${id(r.id)}/closure`, x);
          toast({ tone: 'success', title: `${out.opened} exits started for the closure of ${entity(r.legalEntityId)}` });
          return out;
        },
        onScheme: async (x) => {
          await write('POST', '/lifecycle/vrs-schemes', Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null)));
          toast({ tone: 'success', title: `${x.name} is open` });
        },
      }}
    />
  );
}
