'use client';

import { AssetsScreen, type AssetRow } from '@yukthix/ui/lifecycle';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Assets (PPL-25; D3: one shared list): what the company owns and who holds it; issue and take back.
export default function YxAssetsPage() {
  const perms = useYxPermissions();
  const canManage = perms.has('asset.manage');
  const data = useLife<{ today: string; rows: AssetRow[] }>('/lifecycle/assets');
  const places = useJoinerPlaces(canManage);
  const write = useLifeWrite();
  return (
    <AssetsScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      rows={data.data?.rows ?? null}
      canAdd={canManage}
      today={data.data?.today ?? ''}
      entities={places.entities}
      locations={places.locations}
      people={places.managers}
      onAdd={(x) => write('POST', '/lifecycle/assets', Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null)))}
      onIssue={(a, x) => write('POST', `/lifecycle/assets/${id(a.id)}/issue`, x)}
      onReturn={(a, x) => write('POST', `/lifecycle/assets/${id(a.id)}/return`, x)}
    />
  );
}
