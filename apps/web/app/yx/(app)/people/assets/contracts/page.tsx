'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { AssetContractsScreen, type ContractRow } from '@yukthix/ui/frame';
import type { AssetRow } from '@yukthix/ui/lifecycle';
import { loadState, todayIst, useYxPermissions } from '../../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';

// People › Asset contracts (IT assets part 3, answer 2717): contracts with their supplier, place, renewal, notice and
// covered assets; ?open=<id> opens one (from an asset page). Read with asset.view; asset managers of a contract's place
// change it and renew an express one (answer 2824); the value only for money holders. The API checks every call.
function Contracts() {
  const router = useRouter();
  const open = useSearchParams().get('open');
  const canManage = useYxPermissions().has('asset.manage');
  const data = useLife<{ today: string; money: boolean; canAdd: boolean; rows: ContractRow[] }>('/lifecycle/asset-contracts');
  const suppliers = useLife<{ rows: { id: string; name: string; retired: boolean }[] }>(canManage ? '/lifecycle/asset-suppliers' : null);
  const assets = useLife<{ rows: AssetRow[] }>(canManage ? '/lifecycle/assets' : null);
  const places = useJoinerPlaces(canManage);
  const write = useLifeWrite();
  return (
    <AssetContractsScreen
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
        assets: (assets.data?.rows ?? []).map((a) => ({ value: a.id, label: `${a.tag} · ${a.name}` })),
        onSave: (id, x) => (id ? write('PUT', `/lifecycle/asset-contracts/${encodeURIComponent(id)}`, x) : write('POST', '/lifecycle/asset-contracts', x)),
        onRenew: (id, version) => write('POST', `/lifecycle/asset-contracts/${encodeURIComponent(id)}/renew`, { version }),
        onOpenAsset: (id) => router.push(`/yx/people/assets/${encodeURIComponent(id)}`),
        open,
      }}
    />
  );
}

export default function YxAssetContractsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Contracts />
    </Suspense>
  );
}
