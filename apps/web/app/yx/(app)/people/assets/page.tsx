'use client';

import { useState } from 'react';
import { useToast } from '@yukthix/ui';
import { AssetRegister } from '@yukthix/ui/frame';
import { AddAssetDrawer, type AssetRow } from '@yukthix/ui/lifecycle';
import type { PersonOption } from '@yukthix/ui/history';
import { todayIst, useYxPermissions, loadState } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { usePeople } from '../../../../../lib/yx-people';

const id = encodeURIComponent;
const STATUS: Record<AssetRow['status'], string> = { in_stock: 'In stock', assigned: 'Assigned', in_repair: 'In repair', retired: 'Retired', lost: 'Lost' };

// People › Assets (PPL-25, design audit step 3; D3: one shared list for HR and IT): what the company owns and who holds
// it; add, issue and take back. The API checks every call (asset.view / asset.manage and the place it belongs to).
export default function YxAssetsPage() {
  const { toast } = useToast();
  const perms = useYxPermissions();
  const canManage = perms.has('asset.manage');
  const data = useLife<{ today: string; rows: AssetRow[] }>('/lifecycle/assets');
  const places = useJoinerPlaces(canManage);
  const people = usePeople<PersonOption[]>(canManage ? '/employees' : null);
  const write = useLifeWrite();
  const [adding, setAdding] = useState(false);
  const today = data.data?.today ?? todayIst();
  const where = (a: AssetRow) => places.locations.find((l) => l.value === a.locationId)?.label ?? places.entities.find((e) => e.value === a.legalEntityId)?.label ?? '';
  const rows = (data.data?.rows ?? []).map((a) => ({
    id: a.id,
    tag: a.tag,
    type: a.category,
    name: a.name,
    serial: a.serial ?? '',
    location: where(a),
    status: STATUS[a.status],
    holder: a.holder?.name ?? '',
    cost: a.cost ? Number(a.cost) : null,
    purchased: new Date(`${a.purchasedOn ?? today}T00:00:00`),
    live: a,
  }));
  return (
    <AssetRegister
      rows={[]}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        rows,
        today: new Date(`${today}T00:00:00`),
        people: (people.data ?? []).map((p) => ({ id: p.id, name: p.name, ...(p.designation ? { role: p.designation } : {}), ...(p.department ? { department: p.department } : {}) })),
        ...(canManage ? { onAdd: () => setAdding(true) } : {}),
        onIssue: async (a, x) => {
          await write('POST', `/lifecycle/assets/${id(a.id)}/issue`, x);
          toast({ tone: 'success', title: `${a.name} (${a.tag}) issued to ${people.data?.find((p) => p.id === x.employeeId)?.name ?? 'the employee'}` });
        },
        onReturn: async (a, x) => {
          await write('POST', `/lifecycle/assets/${id(a.id)}/return`, x);
          toast({ tone: 'success', title: x.status === 'lost' ? `${a.name} (${a.tag}) marked not returned by ${a.holder?.name ?? 'the holder'}` : `${a.name} (${a.tag}) returned by ${a.holder?.name ?? 'the holder'}`, ...(x.recoveryAmount ? { description: `₹${Number(x.recoveryAmount).toLocaleString('en-IN')} goes on their F&F as a recovery.` } : {}) });
        },
        children: adding && (
          <AddAssetDrawer
            entities={places.entities}
            locations={places.locations}
            onClose={() => setAdding(false)}
            onAdd={async (x) => {
              await write('POST', '/lifecycle/assets', Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null)));
              toast({ tone: 'success', title: `${x.name} (${x.tag}) added` });
            }}
          />
        ),
      }}
    />
  );
}
