'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuditLogScreen, type LiveAuditEntry, type LiveAuditFilters } from '@yukthix/ui/hiring';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload } from '../../../../../lib/yx-pay';

// Answer 1563: the company audit log, for audit.view. The same query, scope and masking as Payroll's own audit page
// (GET /payroll/audit), filtered by area, person and date. Payroll's page stays for the chain check, holds and export.
const AREAS = [
  ['settings', 'Settings'],
  ['access', 'Access & security'],
  ['people', 'People'],
  ['time', 'Time and leave'],
  ['payroll', 'Payroll'],
  ['hiring', 'Hiring'],
  ['performance', 'Performance'],
  ['expenses', 'Expenses'],
  ['helpdesk', 'Helpdesk'],
  ['approvals', 'Approvals'],
  ['projects', 'Projects'],
].map(([value, label]) => ({ value: value!, label: label! }));

const query = (f: LiveAuditFilters, before?: string) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  if (before) q.set('before', before);
  return q.toString();
};

export default function YxAuditLogPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const [filters, setFilters] = useState<LiveAuditFilters>({});
  const [before, setBefore] = useState<string | undefined>(undefined);
  const page = usePay<{ entries: (LiveAuditEntry & { at: string })[]; next: string | null }>(`/audit?${query(filters, before)}`);
  const state = payState(page);
  // Answer 1722: the daily integrity check and the recorded export (audit.export), as on Payroll's page.
  const chain = usePay<{ checks: { at: string; result: 'ok' | 'broken'; problem: string | null }[] }>(perms.has('audit.view') ? '/audit/chain' : null);
  const download = usePayDownload();
  return (
    <AuditLogScreen
      rows={[]}
      live={{
        state: state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void page.refetch(),
        entries: page.data?.entries ?? [],
        areas: AREAS,
        filters,
        onFilters: (f) => {
          setBefore(undefined);
          setFilters(f);
        },
        onMore: page.data?.next ? () => setBefore(page.data!.next!) : undefined,
        onOpenPayroll: perms.has('audit.view') ? () => router.push('/yx/payroll/audit') : undefined,
        chain: chain.data?.checks?.[0] ?? null,
        onExport: perms.has('audit.export') ? () => download(`/payroll/audit/export?${query(filters)}`, 'audit-log.csv') : undefined,
      }}
    />
  );
}
