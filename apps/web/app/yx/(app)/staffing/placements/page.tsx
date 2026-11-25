'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlacementSheet, PlacementsScreen, type PlaceableRow, type PlacementRowView } from '@yukthix/ui/hiring';
import { deskState, useStaffing, useStaffingWrite } from '../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../lib/auth-context';

type List = { canManage: boolean; showPay: boolean; rows: PlacementRowView[] };

// Staffing desk › Placements (HIR-17): the designed list with `live`. Pay rates and margins only for account managers;
// a submission the client selected becomes a placement on the client's rate-card line.
export default function YxStaffingPlacementsPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const list = useStaffing<List>('/placements');
  const canManage = Boolean(list.data?.canManage) && !(impersonating || actingSuperAdmin);
  const placeable = useStaffing<PlaceableRow[]>('/placements/placeable', canManage);
  const write = useStaffingWrite();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PlacementsScreen
        live={{
          state: deskState(list),
          onRetry: () => void list.refetch(),
          rows: list.data?.rows ?? [],
          showPay: Boolean(list.data?.showPay),
          canManage,
          onNew: () => setAdding(true),
          onOpen: (id) => router.push(`/yx/staffing/placements/${encodeURIComponent(id)}`),
          onBench: () => router.push('/yx/staffing/bench'),
        }}
      />
      {adding && placeable.data && (
        <PlacementSheet
          open
          onOpenChange={(o) => !o && setAdding(false)}
          placeable={placeable.data}
          today={new Date()}
          onSave={async (input) => {
            const made = await write<{ id: string }>('POST', '/placements', input);
            router.push(`/yx/staffing/placements/${encodeURIComponent(made.id)}`);
          }}
        />
      )}
    </>
  );
}
