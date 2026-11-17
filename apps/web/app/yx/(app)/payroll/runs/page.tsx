'use client';

import { useRouter } from 'next/navigation';
import { PayrollHomeScreen, groupRuns, type HomeDues, type PayCalendarMonth, type PayGroupRef, type PayRun, type RunReadiness, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePays, usePayWrite } from '../../../../../lib/yx-pay';
import { useApi } from '../../../../../lib/yx-pay-5j';
import { todayIndia } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Payroll › Payroll home (PAY-01, founder decision 1): this month's run, what blocks it and its dates, the last totals,
// and every run under it by pay frequency (PAY-29). New runs (monthly or off-cycle) start here.
export default function YxPayrollHomePage() {
  const sp = useScopeParams();
  const router = useRouter();
  const perms = useYxPermissions();
  const runs = usePay<PayRun[]>(withParams('/runs', sp.entity));
  // Pay groups and entities need payroll.setup.manage: without it the page still works (no group names, no New run).
  const groups = usePay<PayGroupRef[]>('/pay-groups');
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const cur = runs.data?.find((r) => r.month === sp.month && r.runType === 'regular' && r.status !== 'void');
  const readiness = usePay<RunReadiness>(cur ? `/runs/${encodeURIComponent(cur.id)}/readiness` : null);
  const calendar = usePay<PayCalendarMonth[]>(cur && groups.data ? `/pay-groups/${encodeURIComponent(cur.payGroupId)}/calendar?year=${sp.month.slice(0, 4)}` : null);
  const month = calendar.data?.find((m) => m.month === sp.month);
  // Several pay groups: the checks of every group's run this month (one stage row each).
  const groupRunIds = groupRuns(runs.data ?? [], groups.data ?? null, sp.month).flatMap((g) => (g.run ? [g.run.id] : []));
  const readinessPaths = groupRunIds.length > 1 ? groupRunIds.map((id) => `/runs/${encodeURIComponent(id)}/readiness`) : [];
  const readinessByPath = usePays<RunReadiness>(readinessPaths);
  // PF, ESI, PT and TDS due this month: only with statutory.filing.view (the server checks it and the entities again).
  const canDues = perms.has('statutory.filing.view');
  // Answer 2283: late corrections of people who have left, waiting for their F&F.
  const waitingFnf = usePay<{ id: string; name: string; on: string; month: string; fnfId: string | null }[]>(perms.has('payroll.run.view') ? '/corrections/waiting-fnf' : null);
  const dues = useApi<HomeDues[]>(canDues ? `/statutory/home-dues?month=${sp.month}${sp.entity ? `&${sp.entity}` : ''}` : null);
  // Groups are named with their legal entity: two entities may each have a "Monthly staff".
  const named = groups.data?.map((g) => ({ ...g, name: `${g.name} · ${entities.data?.find((e) => e.id === g.legalEntityId)?.shortName ?? ''}` })) ?? null;
  const write = usePayWrite();
  return (
    <PayrollHomeScreen
      live={{
        state: payState(runs),
        onRetry: () => void runs.refetch(),
        runs: runs.data ?? null,
        groups: groups.isError ? null : (named ?? null),
        month: sp.month,
        today: todayIndia(),
        readiness: readiness.data ?? null,
        readinessByRun: Object.fromEntries(Object.values(readinessByPath).map((r) => [r.run.id, r])),
        dues: !canDues || dues.isError ? undefined : (dues.data ?? null),
        waitingForFnf: waitingFnf.data ?? null,
        fnfHref: () => '/yx/payroll/fnf',
        // Answer 2300: settled first: one click adds it to an off-cycle correction run.
        ...(perms.has('payroll.offcycle.prepare') ? { onAddToOffcycle: (id: string) => write<{ runId: string }>(`/corrections/${encodeURIComponent(id)}/offcycle`, {}) } : {}),
        calendar: month ? { cutOff: month.cutOff, payDate: month.payDate } : null,
        canPrepare: perms.has('payroll.run.prepare'),
        canOffcycle: perms.has('payroll.offcycle.prepare'),
        canApprove: perms.has('payroll.run.approve'),
        setupHref: '/yx/payroll/setup',
        statutoryHref: '/yx/payroll/statutory',
        runHref: (id) => `/yx/payroll/runs/${encodeURIComponent(id)}`,
        onCreate: (payGroupId, m, offcycleKind, subPeriod) => write<{ id: string }>('/runs', { payGroupId, month: m, ...(offcycleKind ? { offcycleKind } : {}), ...(subPeriod ? { subPeriod } : {}) }),
        onOpen: (id) => router.push(`/yx/payroll/runs/${encodeURIComponent(id)}`),
        onNewOffcycle: () => router.push('/yx/payroll/runs/off-cycle'),
      }}
    />
  );
}
