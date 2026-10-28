'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LeaveCardScreen, LeaveReportsScreen, type HrBalances, type LedgerRow, type LeaveReport, type LeaveReportQuery } from '@yukthix/ui/time';
import { timeState, useTime, useTimeDownload, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

const id = encodeURIComponent;
const qs = (q: LeaveReportQuery) => new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();

// HR › Leave balances: the TIM-30 leave reports (everyone in leave.view scope, filters, paging, CSV export); a row opens
// that person's TIM-21 leave card (?person=), where adjusting needs leave.balance.adjust and a reason.
function Balances() {
  const sp = useScopeParams();
  const router = useRouter();
  const person = useSearchParams()?.get('person') ?? null;
  const [query, setQuery] = useState<LeaveReportQuery>({ report: 'balances', page: 1, pageSize: 50, ...(sp.entity ? { entityId: sp.entity } : {}) });
  const report = useTime<LeaveReport>(person ? null : `/hr/leave-report?${qs(query)}`);
  const balances = useTime<HrBalances>(person ? withParams('/hr/balances', sp.entity) : null);
  const read = useTimeRead();
  const write = useTimeWrite();
  const download = useTimeDownload();
  if (person)
    return (
      <LeaveCardScreen
        live={{
          state: timeState(balances),
          onRetry: () => void balances.refetch(),
          data: balances.data ? { ...balances.data, people: [...balances.data.people].sort((a, b) => Number(b.employeeId === person) - Number(a.employeeId === person)) } : null,
          onLedger: (employeeId) => read<LedgerRow[]>(`/people/${id(employeeId)}/ledger`),
          onAdjust: (employeeId, input) => write(`/people/${id(employeeId)}/adjust`, 'POST', input, true, 'Added to the ledger'),
        }}
      />
    );
  return (
    <LeaveReportsScreen
      live={{
        state: timeState(report),
        onRetry: () => void report.refetch(),
        data: report.data ?? null,
        query,
        onQuery: setQuery,
        onExport: (q) => download(`/hr/leave-report/export?${qs({ ...q, page: 1 })}`, `leave-${q.report}.csv`),
        onOpenCard: (employeeId) => router.push(`/yx/time/balances?person=${id(employeeId)}`),
      }}
    />
  );
}

export default function YxLeaveBalancesPage() {
  return (
    <Suspense>
      <Balances />
    </Suspense>
  );
}
