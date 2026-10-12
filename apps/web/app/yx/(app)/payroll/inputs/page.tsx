'use client';

import { useState } from 'react';
import { PayInputsScreen, type HoldRow, type LopRow, type OneTimeItem } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { usePeopleSearch } from '../../../../../lib/yx-pay-5b';
import { useNames } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Inputs (PAY-10.01, PAY-04 … PAY-06): loss of pay, one-time pay and holds for a month.
export default function YxPayInputsPage() {
  const [month, setMonth] = useState(todayIndia().slice(0, 7));
  const lop = usePay<LopRow[]>(`/lop-inputs/${month}`);
  const oneTime = usePay<OneTimeItem[]>(`/one-time-pays?month=${month}`);
  const holds = usePay<HoldRow[]>('/holds');
  const write = usePayWrite();
  const search = usePeopleSearch();
  const nameOf = useNames();
  return (
    <PayInputsScreen
      state={payState(oneTime)}
      onRetry={() => void oneTime.refetch()}
      month={month}
      onMonth={setMonth}
      nameOf={nameOf}
      lop={lop.data ?? (lop.isError ? [] : null)}
      oneTime={oneTime.data ?? null}
      holds={holds.data ?? (holds.isError ? [] : null)}
      onSearch={(q) => search(q)}
      onSaveLop={(row) => write(`/lop-inputs/${month}`, { rows: [row] }, 'PUT')}
      onAddOneTime={(row) => write<{ status: string }>('/one-time-pays', row)}
      onCancelOneTime={(id) => write(`/one-time-pays/${encodeURIComponent(id)}/cancel`, undefined, 'PATCH')}
      onAddHold={(row) => write('/holds', row)}
      onReleaseHold={(id) => write(`/holds/${encodeURIComponent(id)}/release`)}
    />
  );
}
