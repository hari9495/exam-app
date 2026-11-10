'use client';

import { useState } from 'react';
import { ClraRegistersScreen, type ClraRegistersData, type ClraReturnsData } from '@yukthix/ui/desk';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useClra, useClraDownload, useClraWrite } from '../../../../../lib/yx-contract-labour';
import { useApiWrite } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

const enc = encodeURIComponent;
const monthsBack = (n: number) => {
  const now = todayIndia();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${now.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1 - i);
    const value = d.toISOString().slice(0, 7);
    return { value, label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) };
  });
};

// Contract labour › Registers & returns (CLB-04, CL-6, answers 629 and 630): the designed screen with `live`. Registers
// are made per establishment after the month ends; freezing and the company DSC signature are the payroll registers
// routes (with step-up). The annual return is drafted here; filing stays on the portal, recorded with its reference.
export default function YxClraRegistersPage() {
  const months = monthsBack(12);
  const [month, setMonth] = useState(months[0]!.value);
  const lastYear = Number(todayIndia().slice(0, 4)) - 1;
  const [year, setYear] = useState(lastYear);
  const q = useClra<ClraRegistersData>(`/registers?month=${month}`);
  const r = useClra<ClraReturnsData>(`/returns?year=${year}`);
  const write = useClraWrite();
  const pay = useApiWrite();
  const download = useClraDownload();
  const perms = useYxPermissions();
  return (
    <ClraRegistersScreen
      live={{
        state: loadState(q),
        onRetry: () => void q.refetch(),
        month,
        months,
        onMonth: setMonth,
        data: q.data ?? null,
        canSign: perms.has('statutory.register.sign'),
        onMake: (locationId, reason) => write('POST', '/registers', { month, locationId, ...(reason ? { reason } : {}) }),
        onDownload: (id) => download(`/registers/${enc(id)}/file`, 'register.pdf'),
        onFreeze: async (id) => (await pay(`/statutory/registers/${enc(id)}/freeze`), await q.refetch()),
        onSign: async (id, file) => {
          const form = new FormData();
          form.append('file', file);
          await pay(`/statutory/registers/${enc(id)}/sign`, form);
          await q.refetch();
        },
        returns: {
          state: r.isLoading ? 'loading' : r.isError ? 'error' : 'ready',
          data: r.data ?? null,
          year,
          years: [lastYear, lastYear - 1, lastYear - 2],
          onYear: setYear,
          onDraft: (locationId, y) => download(`/returns/${enc(locationId)}/${y}/draft.pdf`, `clra-annual-return-${y}.pdf`),
          onFiled: (locationId, y, input) => write('POST', `/returns/${enc(locationId)}/${y}/filed`, input),
        },
      }}
    />
  );
}
