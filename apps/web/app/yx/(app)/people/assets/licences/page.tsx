'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { AssetLicencesScreen, type LicenceRow } from '@yukthix/ui/frame';
import type { AssetRow } from '@yukthix/ui/lifecycle';
import { loadState, todayIst, useYxPermissions } from '../../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';

// People › Software licences (IT assets part 4, answer 2718): licences with their seats in use (people and devices),
// over quota in red; ?open=<id> opens one (from an alert or an asset page). Read with asset.view; asset managers of a
// licence's place change it and give and free seats; the cost only for money holders. The API checks every call.
function Licences() {
  const router = useRouter();
  const open = useSearchParams().get('open');
  const canManage = useYxPermissions().has('asset.manage');
  const data = useLife<{ today: string; money: boolean; canAdd: boolean; rows: LicenceRow[] }>('/lifecycle/asset-licences');
  const suppliers = useLife<{ rows: { id: string; name: string; retired: boolean }[] }>(canManage ? '/lifecycle/asset-suppliers' : null);
  const assets = useLife<{ rows: AssetRow[] }>(canManage ? '/lifecycle/assets' : null);
  const people = useLife<{ id: string; name: string }[]>(canManage ? '/lifecycle/assets/people' : null);
  const places = useJoinerPlaces(canManage);
  const write = useLifeWrite();
  return (
    <AssetLicencesScreen
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        today: data.data?.today ?? todayIst(),
        rows: data.data?.rows ?? [],
        money: data.data?.money,
        canAdd: Boolean(data.data?.canAdd),
        suppliers: (suppliers.data?.rows ?? []).filter((s) => !s.retired).map((s) => ({ value: s.id, label: s.name })),
        entities: places.entities,
        locations: places.locations,
        people: (people.data ?? []).map((p) => ({ value: p.id, label: p.name })),
        devices: (assets.data?.rows ?? []).filter((a) => a.status !== 'retired' && a.status !== 'lost').map((a) => ({ value: a.id, label: `${a.tag} · ${a.name}` })),
        onSave: (id, x) => (id ? write('PUT', `/lifecycle/asset-licences/${encodeURIComponent(id)}`, x) : write('POST', '/lifecycle/asset-licences', x)),
        onGiveSeat: (id, to) => write('POST', `/lifecycle/asset-licences/${encodeURIComponent(id)}/seats`, to),
        onFreeSeat: (id, seat, reason) => write('POST', `/lifecycle/asset-licences/${encodeURIComponent(id)}/seats/${encodeURIComponent(seat)}/free`, { reason }),
        onOpenAsset: (id) => router.push(`/yx/people/assets/${encodeURIComponent(id)}`),
        open,
      }}
    />
  );
}

export default function YxSoftwareLicencesPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Licences />
    </Suspense>
  );
}
