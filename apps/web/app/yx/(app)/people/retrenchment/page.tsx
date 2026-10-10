'use client';

import { RetrenchmentScreen, type IrOverview } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Retrenchment and VRS (PPL-40; LIFE-5.07, YX-LC-27): government permission requests, closures, VRS schemes.
export default function YxRetrenchmentPage() {
  const data = useLife<IrOverview>('/lifecycle/ir-permissions');
  const places = useJoinerPlaces(true);
  const write = useLifeWrite();
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  return (
    <RetrenchmentScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      today={today}
      entities={places.entities}
      onApply={(x) => write('POST', '/lifecycle/ir-permissions', x)}
      onDecide={(r, x) => write('POST', `/lifecycle/ir-permissions/${id(r.id)}/decide`, { ...x, version: r.version })}
      onClosure={(r, x) => write<{ opened: number }>('POST', `/lifecycle/ir-permissions/${id(r.id)}/closure`, x)}
      onScheme={(x) => write('POST', '/lifecycle/vrs-schemes', Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null)))}
    />
  );
}
