'use client';

import { useState } from 'react';
import { Button } from '@yukthix/ui';
import { NomineeDrawer, PayDocumentsScreen, type PayDocuments } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload, usePayWrite, verifyUrl } from '../../../../../lib/yx-pay';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';

// Payroll › Pay documents (P05, PAY-1.09): as issued, with their verify codes; someone else's download is recorded.
// A nominee added here reads the person's documents in the pay portal (YX-DOC-19, PAY-10.16).
export default function YxPayDocumentsPage() {
  const [entityId, setEntityId] = useState<string | null>(null);
  const docs = usePay<PayDocuments>(`/documents${entityId ? `?legalEntityId=${encodeURIComponent(entityId)}` : ''}`);
  const download = usePayDownload();
  const perms = useYxPermissions();
  const write = usePayWrite();
  const search = usePeopleSearch();
  const [nominee, setNominee] = useState(false);
  return (
    <>
      <PayDocumentsScreen
        state={payState(docs)}
        onRetry={() => void docs.refetch()}
        data={docs.data ?? null}
        entityId={entityId}
        onEntity={setEntityId}
        onDownload={(d) => download(`/payroll/documents/${encodeURIComponent(d.id)}/file`, `${d.referenceNo}.pdf`)}
        verifyUrl={verifyUrl}
        actions={perms.has('payroll.document.issue') ? <Button onClick={() => setNominee(true)}>Add a nominee</Button> : undefined}
      />
      {nominee && <NomineeDrawer onSearch={search} onClose={() => setNominee(false)} onSave={(x) => write('/documents/nominees', x)} />}
    </>
  );
}
