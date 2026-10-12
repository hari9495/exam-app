'use client';

import { useEffect, useState } from 'react';
import { TaxCertificatesScreen, type CertificateRow, type PartAImport, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite, useNames } from '../../../../../lib/yx-pay-5j';

const lastTaxYear = () => {
  const now = new Date();
  const y = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

// Payroll › Tax certificates (PAY-10.15, PAY-5.08): Part A from TRACES and the year-end certificates issued.
export default function YxPayCertificatesPage() {
  const perms = useYxPermissions();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const [taxYear, setTaxYear] = useState(lastTaxYear);
  const certificates = useApi<CertificateRow[]>(entityId ? `/tax/certificates?entityId=${encodeURIComponent(entityId)}&taxYear=${taxYear}` : null);
  const write = useApiWrite();
  const nameOf = useNames();
  const file = (f: File) => {
    const form = new FormData();
    form.append('file', f);
    return form;
  };
  return (
    <TaxCertificatesScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      taxYear={taxYear}
      onTaxYear={setTaxYear}
      certificates={certificates.data ?? null}
      nameOf={nameOf}
      can={{ importZip: perms.has('statutory.filing.generate'), issueAll: perms.has('statutory.register.sign') }}
      onImportZip={(f) => {
        const form = file(f);
        form.append('entityId', entityId!);
        form.append('taxYear', taxYear);
        return write<PartAImport>('/statutory/tds-returns/part-a', form);
      }}
      onPartA={(c, f) => write(`/tax/certificates/${encodeURIComponent(c.id)}/part-a`, file(f))}
      onIssue={(c, confirmation) => write(`/tax/certificates/${encodeURIComponent(c.id)}/issue`, { confirmation })}
      onIssueAll={(confirmation) => write('/statutory/form130/batch', { entityId, taxYear, confirmation })}
    />
  );
}
