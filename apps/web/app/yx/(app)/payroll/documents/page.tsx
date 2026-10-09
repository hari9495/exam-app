'use client';

import { useState } from 'react';
import { PayDocumentsScreen, type PayDocuments } from '@yukthix/ui/pay';
import { payState, usePay, usePayDownload, verifyUrl } from '../../../../../lib/yx-pay';

// Payroll › Pay documents (P05, PAY-1.09): as issued, with their verify codes; someone else's download is recorded.
export default function YxPayDocumentsPage() {
  const [entityId, setEntityId] = useState<string | null>(null);
  const docs = usePay<PayDocuments>(`/documents${entityId ? `?legalEntityId=${encodeURIComponent(entityId)}` : ''}`);
  const download = usePayDownload();
  return (
    <PayDocumentsScreen
      state={payState(docs)}
      onRetry={() => void docs.refetch()}
      data={docs.data ?? null}
      entityId={entityId}
      onEntity={setEntityId}
      onDownload={(d) => download(`/payroll/documents/${encodeURIComponent(d.id)}/file`, `${d.referenceNo}.pdf`)}
      verifyUrl={verifyUrl}
    />
  );
}
