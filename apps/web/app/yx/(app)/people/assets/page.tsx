'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { AssetRegister } from '@yukthix/ui/frame';
import { AddAssetDrawer, type AssetRow } from '@yukthix/ui/lifecycle';
import type { PersonOption } from '@yukthix/ui/history';
import { todayIst, useYxPermissions, loadState } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;
const STATUS: Record<AssetRow['status'], string> = { in_stock: 'In stock', assigned: 'Assigned', in_repair: 'In repair', retired: 'Retired', lost: 'Lost' };

// People › Assets (PPL-25, design audit step 3; D3: one shared list for HR and IT): what the company owns and who holds
// it; add, issue and take back. The API checks every call (asset.view / asset.manage and the place it belongs to).
export default function YxAssetsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const perms = useYxPermissions();
  const canManage = perms.has('asset.manage');
  const data = useLife<{ today: string; money?: boolean; recovery?: { toFnf: boolean; basis: string }; rows: AssetRow[] }>('/lifecycle/assets');
  // IT assets part 1 (answer 2712): Add asset picks a category from the company list (Settings › Assets).
  const cats = useLife<{ rows: { id: string; name: string; nextTag: string | null }[] }>(canManage ? '/lifecycle/asset-categories' : null);
  const places = useJoinerPlaces(canManage);
  // IT assets part 3 (answer 2716): Add asset may name an active supplier.
  const suppliers = useLife<{ rows: { id: string; name: string; retired: boolean }[] }>(canManage ? '/lifecycle/asset-suppliers' : null);
  // Who an asset can go to: its own list for asset.manage (IT holds no employee grant, so /employees is empty for it).
  const people = useLife<PersonOption[]>(canManage ? '/lifecycle/assets/people' : null);
  const write = useLifeWrite();
  const [adding, setAdding] = useState(false);
  const today = data.data?.today ?? todayIst();
  // The site only; an asset with no site says so rather than showing its company under Location (founder, 22 Oct 2026).
  const where = (a: AssetRow) => places.locations.find((l) => l.value === a.locationId)?.label ?? 'Not set';
  const rows = (data.data?.rows ?? []).map((a) => ({
    id: a.id,
    tag: a.tag,
    type: a.category,
    name: a.name,
    serial: a.serial ?? '',
    location: where(a),
    status: STATUS[a.status],
    holder: a.holder?.name ?? '',
    // Answer 2711: the API sends no cost to whoever may not see money.
    cost: a.cost ? Number(a.cost) : null,
    purchased: new Date(`${a.purchasedOn ?? today}T00:00:00`),
    // Answer 2714: the register shows an ended warranty in red.
    warrantyEndsOn: a.warrantyEndsOn ?? null,
    live: a,
  }));
  return (
    <AssetRegister
      rows={[]}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        rows,
        money: data.data?.money,
        recovery: data.data?.recovery,
        today: new Date(`${today}T00:00:00`),
        people: (people.data ?? []).map((p) => ({ id: p.id, name: p.name, ...(p.designation ? { role: p.designation } : {}), ...(p.department ? { department: p.department } : {}) })),
        ...(canManage ? { onAdd: () => setAdding(true) } : {}),
        onOpen: (a) => router.push(`/yx/people/assets/${id(a.id)}`),
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
            categories={(cats.data?.rows ?? []).map((c) => ({ value: c.id, label: c.name, nextTag: c.nextTag }))}
            entities={places.entities}
            locations={places.locations}
            suppliers={(suppliers.data?.rows ?? []).filter((s) => !s.retired).map((s) => ({ value: s.id, label: s.name }))}
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
