'use client';

import { useEffect, useState } from 'react';
import { Form16BulkScreen, type CertificateRow, type PartAImport, type SetupEntity, type TdsReturnRow } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite, useNames } from '../../../../../lib/yx-pay-5j';

const lastTaxYear = () => {
  const now = new Date();
  const y = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

// Compliance › TDS & Form 16: the designed CMP-06 Form 16 screen with real data: Part A from TRACES, then certificates issued.
export default function YxPayCertificatesPage() {
  const perms = useYxPermissions();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const [taxYear, setTaxYear] = useState(lastTaxYear);
  const q = entityId ? encodeURIComponent(entityId) : null;
  const certificates = useApi<CertificateRow[]>(q ? `/tax/certificates?entityId=${q}&taxYear=${taxYear}` : null);
  // The year's Q4 salary return, to show the link (only for people who may see returns).
  const returns = useApi<TdsReturnRow[]>(q && perms.has('statutory.filing.view') ? `/statutory/tds-returns?entityId=${q}` : null);
  const write = useApiWrite();
  const nameOf = useNames();
  const file = (f: File) => {
    const form = new FormData();
    form.append('file', f);
    return form;
  };
  return (
    <Form16BulkScreen
      rows={[]}
      live={{
        state: payState(entities),
        onRetry: () => void entities.refetch(),
        entities: entities.data ?? [],
        entityId,
        onEntity: setEntityId,
        taxYear,
        onTaxYear: setTaxYear,
        certificates: certificates.data ?? (certificates.isError ? [] : null),
        q4Return: returns.data?.find((r) => r.taxYear === taxYear && r.quarter === 4 && r.kind !== 'correction') ?? null,
        nameOf,
        can: { importZip: perms.has('statutory.filing.generate'), issueAll: perms.has('statutory.register.sign') },
        onImportZip: (f) => {
          const form = file(f);
          form.append('entityId', entityId!);
          form.append('taxYear', taxYear);
          return write<PartAImport>('/statutory/tds-returns/part-a', form);
        },
        onPartA: (c, f) => write(`/tax/certificates/${encodeURIComponent(c.id)}/part-a`, file(f)),
        onIssue: (c, confirmation) => write(`/tax/certificates/${encodeURIComponent(c.id)}/issue`, { confirmation }),
        onIssueAll: (confirmation) => write('/statutory/form130/batch', { entityId, taxYear, confirmation }),
      }}
    />
  );
}
