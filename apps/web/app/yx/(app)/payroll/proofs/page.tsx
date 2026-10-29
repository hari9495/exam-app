'use client';

import { useState } from 'react';
import { ProofQueueScreen, type Form12bRow, type ProofQueueLine, type ProofStatusFilter } from '@yukthix/ui/pay';
import { payState, usePayDownload } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';

// Payroll › Proof checking (PAY-23): employees' tax proofs and previous employers' Form 12B (founder decision 6),
// approved, partly approved or rejected; never one's own (the API leaves them out).
export default function YxPayProofsPage() {
  const [status, setStatus] = useState<ProofStatusFilter>('pending');
  const lines = useApi<ProofQueueLine[]>(`/tax/proofs?status=${status}`);
  const form12b = useApi<Form12bRow[]>(status === 'partly' ? null : `/tax/form12b?status=${status}`);
  const write = useApiWrite();
  const download = usePayDownload();
  const e = encodeURIComponent;
  const line = (l: ProofQueueLine) => `/tax/proofs/${e(l.workspaceId)}/lines/${e(l.id)}`;
  return (
    <ProofQueueScreen
      live={{
        state: payState(lines),
        onRetry: () => void Promise.all([lines.refetch(), form12b.refetch()]),
        status,
        onStatus: setStatus,
        lines: lines.data ?? null,
        form12b: status === 'partly' ? [] : (form12b.data ?? null),
        onFile: (l, n, name) => download(`${line(l)}/files/${n}`, name),
        onDecide: (l, d) => write(`${line(l)}/decision`, d),
        onForm12bFile: (r) => download(`/tax/form12b/${e(r.id)}/file`, r.file.name),
        onForm12bDecide: (r, d) => write(`/tax/form12b/${e(r.id)}/decision`, d),
      }}
    />
  );
}
