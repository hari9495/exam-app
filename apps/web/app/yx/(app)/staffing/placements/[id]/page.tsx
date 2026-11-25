'use client';

import { useParams, useRouter } from 'next/navigation';
import { PlacementRecordScreen, type HoursRowView, type LivePlacementFee, type PlacementRowView } from '@yukthix/ui/hiring';
import { deskState, rupees, useStaffing, useStaffingWrite } from '../../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../../lib/auth-context';

type One = { canManage: boolean; showPay: boolean; placement: PlacementRowView; fee: Omit<LivePlacementFee, 'today' | 'onHired' | 'onLeft' | 'onOpenInvoice'> | null };

// Staffing desk › Placements › one placement (HIR-17 record): extend (a later last day and a reason) or end early (the
// last day and a reason; own payroll moves to the bench). Each write carries the version; a stale one is refused.
export default function YxStaffingPlacementPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const one = useStaffing<One>(`/placements/${encodeURIComponent(id)}`);
  // Slice 3: weekly hours (account managers and finance; others get 403 and see no hours card).
  const hours = useStaffing<{ canEnter: boolean; contacts: { id: string; name: string; role: string }[]; rows: HoursRowView[] }>(`/placements/${encodeURIComponent(id)}/hours`, one.isSuccess);
  const write = useStaffingWrite();
  const path = `/placements/${encodeURIComponent(id)}`;
  return (
    <PlacementRecordScreen
      live={{
        state: deskState(one),
        onRetry: () => void one.refetch(),
        placement: one.data?.placement ?? null,
        showPay: Boolean(one.data?.showPay),
        canManage: Boolean(one.data?.canManage) && !(impersonating || actingSuperAdmin),
        today: new Date(),
        onExtend: (input) => write('POST', `${path}/extend`, input),
        onEnd: (input) => write('POST', `${path}/end`, { ...input, ...(input.note ? {} : { note: undefined }) }),
        hours: hours.data
          ? {
              ...hours.data,
              canEnter: hours.data.canEnter && !(impersonating || actingSuperAdmin),
              today: new Date(),
              onSave: ({ overtime, ...h }) => write('POST', `${path}/hours`, { ...h, ...(overtime ? { overtime } : {}) }),
              onApprove: (hid, contactId, version) => write('POST', `/hours/${encodeURIComponent(hid)}/approve`, { contactId, version }),
            }
          : null,
        fee: one.data?.fee
          ? {
              ...one.data.fee,
              today: new Date(),
              onHired: ({ ctc, ...h }) => write('POST', `${path}/hired`, { ...h, ctc: rupees(ctc) }),
              onLeft: (leftOn) => write('POST', `${path}/left`, { leftOn }),
              onOpenInvoice: (inv) => router.push(`/yx/staffing/invoices/${encodeURIComponent(inv)}`),
            }
          : null,
      }}
    />
  );
}
