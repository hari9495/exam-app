'use client';

import { useEffect, useState } from 'react';
import { ActuarialScreen, type ActuarialView, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayDownload, usePayWrite } from '../../../../../lib/yx-pay';
import { useApiWrite } from '../../../../../lib/yx-pay-5j';

// Payroll › Actuarial valuation (PAY-9.03, PAY-38): the census for the actuary and the provision journal.
export default function YxPayActuarialPage() {
  const perms = useYxPermissions();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const e = encodeURIComponent;
  const data = usePay<ActuarialView>(entityId ? `/actuarial?legalEntityId=${e(entityId)}` : null);
  const write = useApiWrite();
  const payWrite = usePayWrite();
  const download = usePayDownload();
  return (
    <ActuarialScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      data={data.data ?? null}
      can={{ census: perms.has('payroll.special.manage'), journal: perms.has('payroll.journal.export') }}
      onCensus={(asOf, standard) => write('/payroll/actuarial/census', { legalEntityId: entityId, asOf, standard })}
      onDownload={async (fileId, name) => {
        const link = await payWrite<{ path: string }>(`/files/${e(fileId)}/link`);
        await download(link.path, name);
      }}
      onRecord={(x, report) => {
        const form = new FormData();
        form.append('legalEntityId', entityId!);
        for (const [k, v] of Object.entries(x)) if (v !== undefined) form.append(k, String(v));
        if (report) form.append('file', report);
        return write('/payroll/actuarial/valuations', form);
      }}
      onPost={(id) => write(`/payroll/actuarial/valuations/${e(id)}/post`)}
    />
  );
}
