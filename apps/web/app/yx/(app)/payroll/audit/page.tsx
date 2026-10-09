'use client';

import { useState } from 'react';
import { AuditScreen, type AuditEntry, type AuditFilters, type AuditPage, type ChainStatus } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload, usePayRead, usePayWrite } from '../../../../../lib/yx-pay';

const query = (f: AuditFilters, before?: string) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  if (before) q.set('before', before);
  return q.toString();
};

// Payroll › Audit log (P08 Part B): in scope, masked, with record timelines, the chain check and the recorded export.
export default function YxPayAuditPage() {
  const perms = useYxPermissions();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [before, setBefore] = useState<string | undefined>(undefined);
  const page = usePay<AuditPage>(`/audit?${query(filters, before)}`);
  const chain = usePay<ChainStatus>('/audit/chain');
  const read = usePayRead();
  const write = usePayWrite();
  const download = usePayDownload();
  return (
    <AuditScreen
      state={payState(page)}
      onRetry={() => void page.refetch()}
      data={page.data ?? null}
      chain={chain.data ?? null}
      filters={filters}
      onFilters={(f) => {
        setBefore(undefined);
        setFilters(f);
      }}
      onMore={page.data?.next ? () => setBefore(page.data!.next!) : undefined}
      canExport={perms.has('audit.export')}
      onExport={() => download(`/payroll/audit/export?${query(filters)}`, 'audit-log.csv')}
      onVerify={() => write('/audit/chain/verify')}
      onTimeline={(type, id) => read<AuditEntry[]>(`/audit/timeline?entityType=${encodeURIComponent(type)}&entityId=${encodeURIComponent(id)}`)}
    />
  );
}
