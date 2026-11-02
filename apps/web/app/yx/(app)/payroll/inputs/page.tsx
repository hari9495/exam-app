'use client';

import { useState } from 'react';
import { OneTimePayScreen, type HoldRow, type LopRow, type OneTimeItem } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';
import { useNames } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Inputs: the designed PAY-05 one-time pay screen with PAY-04 loss of pay and PAY-06 salary holds as tabs.
export default function YxPayInputsPage() {
  const [month, setMonth] = useState(todayIndia().slice(0, 7));
  const lop = usePay<LopRow[]>(`/lop-inputs/${month}`);
  // PAY-04 Frozen: when every legal entity's month is frozen or locked, the LOP input takes late requests only.
  const stages = usePay<{ legalEntityId: string; stage: string }[]>(`/input-periods/${month}`);
  const stage = !stages.data ? null : stages.data.length && stages.data.every((x) => x.stage !== 'open') ? stages.data[0].stage : 'open';
  const oneTime = usePay<OneTimeItem[]>(`/one-time-pays?month=${month}`);
  const holds = usePay<HoldRow[]>('/holds');
  const write = usePayWrite();
  const search = usePeopleSearch();
  const nameOf = useNames();
  return (
    <OneTimePayScreen
      live={{
        state: payState(oneTime),
        onRetry: () => void Promise.all([oneTime.refetch(), lop.refetch(), holds.refetch()]),
        month,
        onMonth: setMonth,
        today: todayIndia(),
        nameOf,
        onSearch: (q) => search(q),
        lop: {
          state: payState(lop),
          rows: lop.data ?? null,
          onSave: (rows, source) => write(`/lop-inputs/${month}`, { rows, source }, 'PUT'),
          stage,
          onLateRequest: (x) => write('/input-corrections', x),
        },
        oneTime: {
          rows: oneTime.data ?? null,
          onAdd: (row) => write<{ status: string }>('/one-time-pays', row),
          onCancel: (id) => write(`/one-time-pays/${encodeURIComponent(id)}/cancel`, undefined, 'PATCH'),
        },
        holds: {
          state: payState(holds),
          rows: holds.data ?? null,
          onAdd: (row) => write('/holds', row),
          onRelease: (id, body) => write(`/holds/${encodeURIComponent(id)}/release`, body),
        },
      }}
    />
  );
}
