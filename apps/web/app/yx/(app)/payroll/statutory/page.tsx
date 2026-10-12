'use client';

import { useEffect, useState } from 'react';
import { StatutoryHubScreen, type FilingRow, type SetupEntity, type StatutoryHub, type TdsReturnRow } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload, usePayWrite } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Statutory filings (PAY-10.04, CMP-01 … CMP-08): the hub for a legal entity and month, files, and TDS returns.
export default function YxPayStatutoryPage() {
  const perms = useYxPermissions();
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
  const write = useApiWrite();
  const payWrite = usePayWrite();
  const download = usePayDownload();
  return (
    <StatutoryHubScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      month={month}
      onMonth={setMonth}
      hub={hub.data ?? null}
      filings={filings.data ?? null}
      returns={returns.data ?? (returns.isError ? [] : null)}
      can={{ generate: perms.has('statutory.filing.generate'), markFiled: perms.has('statutory.filing.mark_filed') }}
      onGenerate={(c, reason) => write('/statutory/filings', { legalEntityId: entityId, statute: c.statute, ...(c.state ? { state: c.state } : {}), month, ...(reason ? { reason } : {}) })}
      onUploaded={(id, reference) => write(`/statutory/filings/${encodeURIComponent(id)}/uploaded`, { reference })}
      onFiled={(id, confirmation) => write(`/statutory/filings/${encodeURIComponent(id)}/filed`, { confirmation })}
      onDownload={async (fileId, name) => {
        const link = await payWrite<{ path: string }>(`/files/${encodeURIComponent(fileId)}/link`);
        await download(link.path, name);
      }}
      onCreateReturn={(taxYear, quarter) => write('/statutory/tds-returns', { entityId, taxYear, quarter })}
      onReconcile={(id) => write(`/statutory/tds-returns/${encodeURIComponent(id)}/reconcile`)}
      onReturnFile={(id) => write(`/statutory/tds-returns/${encodeURIComponent(id)}/file`)}
      onUploadFvu={(id, file) => {
        const body = new FormData();
        body.append('file', file);
        return write(`/statutory/tds-returns/${encodeURIComponent(id)}/fvu`, body);
      }}
      onReturnFiled={(id, tokenNo, confirmation) => write(`/statutory/tds-returns/${encodeURIComponent(id)}/filed`, { tokenNo, confirmation })}
    />
  );
}
