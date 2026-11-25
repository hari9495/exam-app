'use client';

import { useState } from 'react';
import { PayDocumentsScreen, type PayDocuments } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload, usePayWrite, verifyUrl } from '../../../../../lib/yx-pay';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';

// Payroll › Pay documents (P05, PAY-48): as issued, with their verify codes; someone else's download is recorded.
// A nominee added here reads the person's documents in the pay portal (YX-DOC-19, PAY-10.16).
export default function YxPayDocumentsPage() {
  const [entityId, setEntityId] = useState<string | null>(null);
  const docs = usePay<PayDocuments>(`/documents${entityId ? `?legalEntityId=${encodeURIComponent(entityId)}` : ''}`);
  const download = usePayDownload();
  const perms = useYxPermissions();
  const write = usePayWrite();
  const search = usePeopleSearch();
  return (
    <PayDocumentsScreen
      live={{
        state: payState(docs),
        onRetry: () => void docs.refetch(),
        data: docs.data ?? null,
        entityId,
        onEntity: setEntityId,
        onDownload: (d) => download(`/payroll/documents/${encodeURIComponent(d.id)}/file`, `${d.referenceNo}.pdf`),
        verifyUrl,
        canAddNominee: perms.has('payroll.document.issue'),
        onSearch: search,
        onAddNominee: (x) => write('/documents/nominees', x),
      }}
    />
  );
}
