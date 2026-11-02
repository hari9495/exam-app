'use client';

import { useState } from 'react';
import { ProofQueueScreen, type Form12bRow, type ProofQueueLine, type ProofStatusFilter, type ResidencyRow } from '@yukthix/ui/pay';
import { payState, usePayBlob, usePayDownload } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';

// Payroll › Proof checking (PAY-23): employees' tax proofs, previous employers' Form 12B (founder decision 6) and
// residential-status changes with the TRC (founder answer 2, 30 Oct 2026), approved, partly approved or rejected; never
// one's own (the API leaves them out).
export default function YxPayProofsPage() {
  const [status, setStatus] = useState<ProofStatusFilter>('pending');
  const lines = useApi<ProofQueueLine[]>(`/tax/proofs?status=${status}`);
  const form12b = useApi<Form12bRow[]>(status === 'partly' ? null : `/tax/form12b?status=${status}`);
  const residency = useApi<ResidencyRow[]>(status === 'partly' ? null : `/tax/residency?status=${status}`);
  const write = useApiWrite();
  const download = usePayDownload();
  const blob = usePayBlob();
  const e = encodeURIComponent;
  const line = (l: ProofQueueLine) => `/tax/proofs/${e(l.workspaceId)}/lines/${e(l.id)}`;
  return (
    <ProofQueueScreen
      live={{
        state: payState(lines),
        onRetry: () => void Promise.all([lines.refetch(), form12b.refetch(), residency.refetch()]),
        status,
        onStatus: setStatus,
        lines: lines.data ?? null,
        form12b: status === 'partly' ? [] : (form12b.data ?? null),
        onFile: (l, n, name) => download(`${line(l)}/files/${n}`, name),
        onPreview: (l, n) => blob(`${line(l)}/files/${n}`),
        onDecide: (l, d) => write(`${line(l)}/decision`, d),
        onForm12bFile: (r) => download(`/tax/form12b/${e(r.id)}/file`, r.file.name),
        onForm12bDecide: (r, d) => write(`/tax/form12b/${e(r.id)}/decision`, d),
        residency: status === 'partly' ? [] : (residency.data ?? null),
        onResidencyFile: (r) => download(`/tax/residency/${e(r.id)}/file`, r.file?.name ?? 'trc.pdf'),
        onResidencyDecide: (r, d) => write(`/tax/residency/${e(r.id)}/decision`, d),
      }}
    />
  );
}
