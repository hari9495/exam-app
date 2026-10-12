'use client';

import { useState } from 'react';
import { ProofCheckScreen, type ProofCheckScreenProps, type ProofQueueLine } from '@yukthix/ui/pay';
import { payState, usePayDownload } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';

// Payroll › Proof checking (PAY-10.12, PAY-23): employees' tax proofs accepted, partly accepted or turned down.
export default function YxPayProofsPage() {
  const [status, setStatus] = useState<ProofCheckScreenProps['status']>('pending');
  const lines = useApi<ProofQueueLine[]>(`/tax/proofs?status=${status}`);
  const write = useApiWrite();
  const download = usePayDownload();
  const line = (l: ProofQueueLine) => `/tax/proofs/${encodeURIComponent(l.workspaceId)}/lines/${encodeURIComponent(l.id)}`;
  return (
    <ProofCheckScreen
      state={payState(lines)}
      onRetry={() => void lines.refetch()}
      lines={lines.data ?? null}
      status={status}
      onStatus={setStatus}
      onFile={(l, n, name) => download(`${line(l)}/files/${n}`, name)}
      onDecide={(l, d) => write(`${line(l)}/decision`, d)}
    />
  );
}
