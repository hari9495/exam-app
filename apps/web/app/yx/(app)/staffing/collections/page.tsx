'use client';

import { CollectionsScreen, type LedgerRowView } from '@yukthix/ui/hiring';
import { deskState, rupees, useStaffing, useStaffingWrite } from '../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../lib/auth-context';

// Staffing desk › Collections (HIR-19): the designed receivables with `live`: ageing by client, client TDS against 26AS,
// disputes, the next reminder on the company's schedule; staffing finance records receipts that settle invoices exactly.
export default function YxStaffingCollectionsPage() {
  const { impersonating, actingSuperAdmin } = useAuth();
  const q = useStaffing<{ canRecord: boolean; rows: LedgerRowView[] }>('/receivables');
  const write = useStaffingWrite();
  return (
    <CollectionsScreen
      live={{
        state: deskState(q),
        onRetry: () => void q.refetch(),
        rows: q.data?.rows ?? [],
        canRecord: Boolean(q.data?.canRecord) && !(impersonating || actingSuperAdmin),
        today: new Date(),
        onReceipt: ({ amount, tds, reference, allocations, ...rest }) => write('POST', '/receipts', { ...rest, amount: rupees(amount), tds: rupees(tds), ...(reference ? { reference } : {}), allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: rupees(a.amount) })) }),
        onCollection: (invoiceId, { tds26as, dispute, version }) => write('PUT', `/invoices/${encodeURIComponent(invoiceId)}/collection`, { version, ...(tds26as !== undefined ? { tds26as: tds26as == null ? null : rupees(tds26as) } : {}), ...(dispute !== undefined ? { dispute } : {}) }),
      }}
    />
  );
}
