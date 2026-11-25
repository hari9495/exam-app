'use client';

import { useParams, useRouter } from 'next/navigation';
import { PlacementFeeSettingsScreen, type FeeTermsView } from '@yukthix/ui/hiring';
import { deskState, rupees, useStaffing, useStaffingWrite } from '../../../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../../../lib/auth-context';

type Terms = { client: { id: string; name: string; contractStart: string | null; contractEnd: string | null }; canEdit: boolean; terms: FeeTermsView | null };

// Staffing desk › Clients › one client › Fees and guarantee (HIR-30): the client's permanent placement fee, conversion
// taper and replacement guarantee. Account managers change them; staffing finance reads.
export default function YxStaffingClientFeesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const q = useStaffing<Terms>(`/clients/${encodeURIComponent(id)}/terms`);
  const write = useStaffingWrite();
  const c = q.data?.client;
  return (
    <PlacementFeeSettingsScreen
      live={{
        state: deskState(q),
        onRetry: () => void q.refetch(),
        client: c?.name ?? '',
        contract: c?.contractStart ? `Contract ${c.contractStart.slice(0, 4)}–${(c.contractEnd ?? '').slice(2, 4)}` : null,
        canEdit: Boolean(q.data?.canEdit) && !(impersonating || actingSuperAdmin),
        terms: q.data?.terms ?? null,
        onSave: ({ feeAmount, feePct, version, ...rest }) => write('PUT', `/clients/${encodeURIComponent(id)}/terms`, { ...rest, ...(feePct ? { feePct } : {}), ...(feeAmount != null ? { feeAmount: rupees(feeAmount) } : {}), ...(version ? { version } : {}) }),
        onCancel: () => router.push(`/yx/staffing/clients/${encodeURIComponent(id)}`),
      }}
    />
  );
}
