'use client';

import { MyDeclarationsScreen, type MyCertificate, type MyDeclarations } from '@yukthix/ui/pay';
import { payState, usePayDownload } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';

// Me › Tax declarations (PAY-10.12, PAY-22): what I declare, my proofs, and my year-end certificates' Part A.
export default function YxMyTaxDeclarationsPage() {
  const data = useApi<MyDeclarations>('/tax/me/declarations');
  const certificates = useApi<MyCertificate[]>('/tax/me/certificates');
  const write = useApiWrite();
  const download = usePayDownload();
  return (
    <MyDeclarationsScreen
      state={payState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      certificates={certificates.data ?? null}
      onDeclare={(line) => write('/tax/me/declarations', { lines: [line] })}
      onProof={(lineId, file) => {
        const form = new FormData();
        form.append('file', file);
        return write(`/tax/me/proofs/${encodeURIComponent(lineId)}`, form);
      }}
      onPartA={(c) => download(`/tax/me/certificates/${encodeURIComponent(c.id)}/part-a`, `${c.form}-part-a-${c.taxYear}.pdf`)}
    />
  );
}
