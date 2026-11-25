'use client';

import { useParams, useRouter } from 'next/navigation';
import { InvoiceRecordScreen, type InvoiceDetail } from '@yukthix/ui/hiring';
import { deskState, rupees, useStaffing, useStaffingDownload, useStaffingWrite } from '../../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../../lib/auth-context';

// Staffing desk › Invoices › one invoice (HIR-18 record with the HIR-31 window): issue a draft (next number of its
// series), raise a credit note (never an edit), cancel and reissue past the e-invoice window. The IRP is not connected.
export default function YxStaffingInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const one = useStaffing<InvoiceDetail>(`/invoices/${encodeURIComponent(id)}`);
  const write = useStaffingWrite();
  const download = useStaffingDownload();
  const path = `/invoices/${encodeURIComponent(id)}`;
  const data = one.data ? { ...one.data, canEdit: one.data.canEdit && !(impersonating || actingSuperAdmin) } : null;
  return (
    <InvoiceRecordScreen
      live={{
        state: deskState(one),
        onRetry: () => void one.refetch(),
        data,
        onIssue: () => write('POST', `${path}/issue`, { version: one.data!.invoice.version }),
        onDelete: async () => {
          await write('DELETE', path);
          router.push('/yx/staffing/invoices');
        },
        onCreditNote: ({ amount, reason }) => write('POST', `${path}/credit-note`, { amount: rupees(amount), reason }),
        onReissue: async (reason) => {
          const r = await write<{ draftId: string }>('POST', `${path}/reissue`, { reason });
          router.push(`/yx/staffing/invoices/${encodeURIComponent(r.draftId)}`);
        },
        onOpen: (other) => router.push(`/yx/staffing/invoices/${encodeURIComponent(other)}`),
        onPdf: () => void download(`${path}/pdf`, `${one.data?.invoice.number ?? 'invoice'}.pdf`),
      }}
    />
  );
}
