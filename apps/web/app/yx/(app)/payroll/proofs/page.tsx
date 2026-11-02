'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProofQueueScreen, type Form12bRow, type MyDeclarations, type MyTaxWorkspace, type PanLinkRow, type ProofQueueLine, type ProofStatusFilter, type ResidencyRow } from '@yukthix/ui/pay';
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
  // PAY-22 NoPan: PAN-Aadhaar link confirmations, checked in the same queue.
  const panLinks = useApi<PanLinkRow[]>(status === 'partly' ? null : `/tax/pan-links?status=${status}`);
  // Deep links (?line=, ?form12b=, ?residency=, ?pan=) open that item. One's own never comes in the queue: the page reads it
  // from the person's own workspace and the drawer shows the designed refusal (PAY-23 OwnProof, ResidencyOwn).
  const params = useSearchParams();
  const lineId = params?.get('line') ?? null;
  const resId = params?.get('residency') ?? null;
  const f12Id = params?.get('form12b') ?? null;
  const panId = params?.get('pan') ?? null;
  const openId = lineId ? `l-${lineId}` : f12Id ? `f-${f12Id}` : resId ? `r-${resId}` : panId ? `p-${panId}` : undefined;
  const ownWs = useApi<MyTaxWorkspace & { residencyRequest?: Omit<ResidencyRow, 'employeeId' | 'employeeName' | 'legalEntityId'> | null }>(lineId || resId ? '/tax/me/workspace' : null);
  const ownDecl = useApi<MyDeclarations>(lineId ? '/tax/me/declarations' : null);
  const ownLine = lineId && !lines.data?.some((l) => l.id === lineId) ? ownDecl.data?.lines.find((l) => l.id === lineId) : undefined;
  const ownRes = resId && !residency.data?.some((r) => r.id === resId) && ownWs.data?.residencyRequest?.id === resId ? ownWs.data.residencyRequest : undefined;
  const own = {
    ...(ownLine && ownWs.data?.id ? { line: { ...ownLine, workspaceId: ownWs.data.id, employeeId: '', employeeName: 'You' } } : {}),
    ...(ownRes ? { residency: { ...ownRes, employeeId: '', employeeName: 'You', legalEntityId: '' } } : {}),
  };
  const write = useApiWrite();
  const download = usePayDownload();
  const blob = usePayBlob();
  const e = encodeURIComponent;
  const line = (l: ProofQueueLine) => `/tax/proofs/${e(l.workspaceId)}/lines/${e(l.id)}`;
  return (
    <ProofQueueScreen
      live={{
        state: payState(lines),
        onRetry: () => void Promise.all([lines.refetch(), form12b.refetch(), residency.refetch(), panLinks.refetch()]),
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
        panLinks: status === 'partly' ? [] : (panLinks.data ?? null),
        onPanLinkFile: (r) => download(`/tax/pan-links/${e(r.id)}/file`, r.file?.name ?? 'pan-link.pdf'),
        onPanLinkPreview: (r) => blob(`/tax/pan-links/${e(r.id)}/file`),
        onPanLinkDecide: (r, d) => write(`/tax/pan-links/${e(r.id)}/decision`, d),
        openId,
        own: own.line || own.residency ? own : undefined,
      }}
    />
  );
}
