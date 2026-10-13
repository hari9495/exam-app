'use client';

import { useEffect, useState } from 'react';
import { CountryPacksScreen, type NecSummary, type PackStatus, type PayRun, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay, usePayDownload, usePayWrite } from '../../../../../lib/yx-pay';
import { useApiWrite } from '../../../../../lib/yx-pay-5j';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Country packs (PAY-9.10 … 9.12): switching a country's pack on for a legal entity, the UAE WPS file and
// end-of-service provision, the US W-9 and 1099-NEC.
export default function YxPayCountryPacksPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const [year, setYear] = useState(() => Number(todayIndia().slice(0, 4)));
  const e = encodeURIComponent;
  const status = usePay<PackStatus>(entityId ? `/country-packs?legalEntityId=${e(entityId)}` : null);
  const us = status.data?.country === 'US' && status.data.switchedOn;
  const nec = usePay<NecSummary>(entityId && us ? `/1099-nec?legalEntityId=${e(entityId)}&year=${year}` : null);
  const runs = usePay<PayRun[]>(status.data?.country === 'AE' ? '/runs' : null);
  const write = useApiWrite();
  const payWrite = usePayWrite();
  const download = usePayDownload();
  const search = usePeopleSearch();
  return (
    <CountryPacksScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={entities.data ?? []}
      entityId={entityId}
      onEntity={setEntityId}
      status={status.data ?? null}
      nec={nec.data ?? null}
      year={year}
      onYear={setYear}
      onSwitchOn={(settings) => write('/payroll/country-packs', { legalEntityId: entityId, settings })}
      onEosb={(month) => write('/payroll/eosb/provision', { legalEntityId: entityId, month })}
      onNecFile={async () => {
        const f = await write<{ fileId: string }>('/payroll/1099-nec', { legalEntityId: entityId, year });
        const link = await payWrite<{ path: string }>(`/files/${e(f.fileId)}/link`);
        await download(link.path, `1099-nec-${year}.csv`);
      }}
      onNecCopy={(consultantId) => download(`/payroll/1099-nec/${e(consultantId)}/copy?legalEntityId=${e(entityId!)}&year=${year}`, `1099-nec-${year}.pdf`)}
      onW9={(x) => write('/payroll/w9', x)}
      onSearch={search}
      onWpsIds={(x) => write(`/payroll/entities/${e(entityId!)}/wps-ids`, x)}
      runs={(runs.data ?? []).filter((r) => r.legalEntityId === entityId && ['approved', 'paid'].includes(r.status)).map((r) => ({ id: r.id, label: `Payroll · ${r.month}` }))}
      onWpsFile={(runId) => write(`/payroll/runs/${e(runId)}/wps-file`)}
    />
  );
}
