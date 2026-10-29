'use client';

import { MyPayDocumentsScreen, type PayDocument } from '@yukthix/ui/pay';
import { payState, usePay, usePayDownload, verifyUrl } from '../../../../../lib/yx-pay';

// Me › Pay documents (PAY-54): one's own payslips and letters as issued (Employee @ self; the database pay guard opens only these rows).
export default function YxMyPayDocumentsPage() {
  const docs = usePay<PayDocument[]>('/me/documents');
  const download = usePayDownload();
  return (
    <MyPayDocumentsScreen
      live={{ state: payState(docs), onRetry: () => void docs.refetch(), data: docs.data ?? null, onDownload: (d) => download(`/payroll/documents/${encodeURIComponent(d.id)}/file`, `${d.referenceNo}.pdf`), verifyUrl }}
    />
  );
}
