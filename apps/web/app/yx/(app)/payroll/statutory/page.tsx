'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatutoryHubScreen, type FilingRow, type ImportBatch, type SetupEntity, type StatutoryHub, type TdsReturnRow } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload, usePayWrite } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

// Compliance › Statutory hub: the designed CMP-01 hub with real data (CMP-04 challan sheet over it, CMP-05 TDS returns tab).
export default function YxPayStatutoryPage() {
  const perms = useYxPermissions();
  const router = useRouter();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const [month, setMonth] = useState(() => {
    const d = new Date(`${todayIndia().slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const q = entityId ? `entityId=${encodeURIComponent(entityId)}` : null;
  const hub = useApi<StatutoryHub>(q ? `/statutory/hub?${q}&month=${month}` : null);
  const filings = useApi<FilingRow[]>(q ? `/statutory/filings?${q}&month=${month}` : null);
  const returns = useApi<TdsReturnRow[]>(q ? `/statutory/tds-returns?${q}` : null);
  const challans = useApi<{ id: string; month: string; status: string; tds: string; interest: string; payrollTds: string | null; editReason: string | null }[]>(q ? `/statutory/challans?${q}` : null);
  const write = useApiWrite();
  const payWrite = usePayWrite();
  const download = usePayDownload();
  const id = encodeURIComponent;
  return (
    <StatutoryHubScreen
      items={[]}
      today={new Date()}
      live={{
        state: payState(entities),
        onRetry: () => void entities.refetch(),
        entities: entities.data ?? [],
        entityId,
        onEntity: setEntityId,
        month,
        onMonth: setMonth,
        hub: hub.data ?? null,
        filings: filings.data ?? null,
        returns: returns.data ?? (returns.isError ? [] : null),
        can: { generate: perms.has('statutory.filing.generate'), markFiled: perms.has('statutory.filing.mark_filed'), challan: perms.has('statutory.challan.manage') },
        challan: challans.data?.find((c) => c.month === month) ?? null,
        onPrepareChallan: () => write('/statutory/challans', { entityId, month }),
        onDeposit: (cid, d) => write(`/statutory/challans/${id(cid)}`, d, 'PATCH'),
        onGenerate: (c, reason) => write('/statutory/filings', { legalEntityId: entityId, statute: c.statute, ...(c.state ? { state: c.state } : {}), month, ...(reason ? { reason } : {}) }),
        // CMP-12 (founder answer 22): a supplementary filing, or an excess, against the filed month.
        onCorrect: (c, x) => write('/statutory/filings', { legalEntityId: entityId, statute: c.statute, ...(c.state ? { state: c.state } : {}), month, kind: x.kind, reason: x.reason, ...(x.amount ? { amount: x.amount } : {}) }),
        onUploaded: (fid, reference) => write(`/statutory/filings/${id(fid)}/uploaded`, { reference }),
        onFiled: (fid, confirmation) => write(`/statutory/filings/${id(fid)}/filed`, { confirmation }),
        onDownload: async (fileId, name) => {
          const link = await payWrite<{ path: string }>(`/files/${id(fileId)}/link`);
          await download(link.path, name);
        },
        onCreateReturn: (taxYear, quarter) => write('/statutory/tds-returns', { entityId, taxYear, quarter }),
        onReconcile: (rid) => write(`/statutory/tds-returns/${id(rid)}/reconcile`),
        onReturnFile: (rid) => write(`/statutory/tds-returns/${id(rid)}/file`),
        onUploadFvu: (rid, file) => {
          const body = new FormData();
          body.append('file', file);
          return write(`/statutory/tds-returns/${id(rid)}/fvu`, body);
        },
        onReturnFiled: (rid, tokenNo, confirmation) => write(`/statutory/tds-returns/${id(rid)}/filed`, { tokenNo, confirmation }),
        // CMP-05 MissingMonth: a month paid before go-live, imported as as-paid lines (Payroll set-up › Imports).
        ...(perms.has('payroll.import.run')
          ? {
              onImportMonth: (_month: string, rows: Record<string, string>[]) => payWrite<ImportBatch>('/imports', { legalEntityId: entityId, kind: 'as_paid_lines', rows }),
              onCommitImport: (batchId: string) => payWrite(`/imports/${id(batchId)}/commit`),
            }
          : {}),
        // CMP-01 SetupNeeded: registrations live in Payroll set-up.
        ...(perms.has('payroll.setup.manage') ? { onOpenSetup: () => router.push('/yx/payroll/setup') } : {}),
      }}
    />
  );
}
