'use client';

import { useEffect, useState } from 'react';
import { ConsultantTaxScreen, type ConsultantSection, type NonSalaryReturn, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload, usePayWrite } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';

// Payroll › Consultant TDS returns (PAY-8.04): challans per section, Form 140 / 26Q and Form 131 / 16A from TRACES.
export default function YxPayConsultantTdsPage() {
  const perms = useYxPermissions();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const returns = useApi<NonSalaryReturn[]>(entityId && perms.has('statutory.filing.view') ? `/payroll/consultant-returns?entityId=${encodeURIComponent(entityId)}` : null);
  const write = useApiWrite();
  const payWrite = usePayWrite();
  const download = usePayDownload();
  const id = encodeURIComponent;
  return (
    <ConsultantTaxScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      returns={returns.data ?? null}
      can={{ challans: perms.has('statutory.challan.manage'), file: perms.has('statutory.filing.generate'), certificates: perms.has('consultant.manage') }}
      onPrepareChallans={(month) => write<{ section: ConsultantSection; tds: string; status: string }[]>('/payroll/consultant-challans/prepare', { entityId, month })}
      onDraft={(taxYear, quarter) => write('/payroll/consultant-returns', { entityId, taxYear, quarter })}
      onReconcile={(r) => write(`/payroll/consultant-returns/${id(r.id)}/reconcile`)}
      onMakeFile={(r) => write(`/payroll/consultant-returns/${id(r.id)}/file`)}
      onDownload={async (r) => {
        const link = await payWrite<{ path: string }>(`/files/${id(r.fileId!)}/link`);
        await download(link.path, `form${r.formCode.toLowerCase()}-${r.taxYear}-q${r.quarter}.txt`);
      }}
      onFiled={(r, tokenNo, confirmation) => write(`/payroll/consultant-returns/${id(r.id)}/filed`, { tokenNo, confirmation })}
      onImport={(taxYear, quarter, file) => {
        const form = new FormData();
        form.append('legalEntityId', entityId!);
        form.append('taxYear', taxYear);
        form.append('quarter', String(quarter));
        form.append('file', file);
        return write('/payroll/consultant-certificates/import', form);
      }}
    />
  );
}
