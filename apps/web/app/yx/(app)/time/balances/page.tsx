'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LeaveCardScreen, LeaveReportsScreen, type HrBalances, type LedgerRow, type LeaveReport, type LeaveReportQuery } from '@yukthix/ui/time';
import { timeState, useTime, useTimeDownload, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';
import { useYxPermissions } from '../../../../../lib/yx-org';

const id = encodeURIComponent;
const qs = (q: LeaveReportQuery) => new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();

// HR › Leave balances: the TIM-30 leave reports (everyone in leave.view scope, filters, paging, CSV export); a row opens
// that person's TIM-21 leave card (?person=), where adjusting needs leave.balance.adjust and a reason. Founder answer A:
// someone with leave.liability.view but not leave.view (Payroll) gets the leave liability report only, no leave cards.
// Batch A D10 (answer 2314): ?view=grid is everyone's balances by type; leave.balance.adjust corrects a cell with a reason.
function Balances() {
  const perms = useYxPermissions();
  return perms.isLoading ? null : <Reports liabilityOnly={!perms.has('leave.view') && perms.has('leave.liability.view')} canCorrect={perms.has('leave.balance.adjust')} />;
}

function Reports({ liabilityOnly, canCorrect }: { liabilityOnly: boolean; canCorrect: boolean }) {
  const sp = useScopeParams();
  const router = useRouter();
  const params = useSearchParams();
  const asked = params?.get('person') ?? null;
  const grid = !liabilityOnly && canCorrect && params?.get('view') === 'grid';
  const person = liabilityOnly ? null : asked ?? (grid ? '' : null);
  const [query, setQuery] = useState<LeaveReportQuery>({ report: liabilityOnly ? 'liability' : 'balances', page: 1, pageSize: 50, ...(sp.entity ? { entityId: sp.entity } : {}) });
  const report = useTime<LeaveReport>(person !== null ? null : `/hr/leave-report?${qs(query)}`);
  const balances = useTime<HrBalances>(person !== null ? withParams('/hr/balances', sp.entity) : null);
  const read = useTimeRead();
  const write = useTimeWrite();
  const download = useTimeDownload();
  if (person !== null)
    return (
      <LeaveCardScreen
        live={{
          state: timeState(balances),
          onRetry: () => void balances.refetch(),
          data: balances.data ? { ...balances.data, people: [...balances.data.people].sort((a, b) => Number(b.employeeId === person) - Number(a.employeeId === person)) } : null,
          onLedger: (employeeId) => read<LedgerRow[]>(`/people/${id(employeeId)}/ledger`),
          onAdjust: (employeeId, input) => write(`/people/${id(employeeId)}/adjust`, 'POST', input, true, 'Added to the ledger'),
          // The dialog says "done" with its own toast (it names the person and the new balance).
          ...(canCorrect ? { onCorrect: (x) => write('/hr/balances/correct', 'POST', x, true), view: grid ? ('grid' as const) : ('card' as const), onView: (v) => router.push(v === 'grid' ? '/yx/time/balances?view=grid' : `/yx/time/balances?person=${id(asked ?? balances.data?.people[0]?.employeeId ?? '')}`) } : {}),
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
        ...(liabilityOnly ? { reports: ['liability' as const] } : { onOpenCard: (employeeId: string) => router.push(`/yx/time/balances?person=${id(employeeId)}`), ...(canCorrect ? { onOpenGrid: () => router.push('/yx/time/balances?view=grid') } : {}) }),
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
