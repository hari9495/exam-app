'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EmployeeHit, GoLiveCheck, GoLiveReadiness, ImportBatch, LegalOption, LivePayrollSetup, ParallelRunView, PayCalendarMonth, PayGroup, PayGroupMember, PayRun, Registrations, SetupEntity, SetupLink, SetupState, SetupStep } from '@yukthix/ui/pay';
import { payState, usePay, usePayRead, usePayWrite } from './yx-pay';
import { usePeopleSearch } from './yx-pay-5b';
import { useApiWrite } from './yx-pay-5j';
import { todayIndia } from './yx-time';
import { useYxPermissions } from './yx-org';
import { useCurrentUser } from './hooks/useCurrentUser';

const LINK: Record<SetupLink, string> = { components: 'components', templates: 'templates', payslip_layout: 'payslip-layout', runs: 'runs' };

/**
 * PAY-16 · the payroll set-up wizard's live data. /yx/payroll/setup, /pay-groups, /imports and /go-live each render
 * the same designed wizard, opened at their own step. Each step's data loads only with that step's key on the entity;
 * the API checks every call again.
 */
export function usePaySetupLive(page: SetupStep): LivePayrollSetup {
  const router = useRouter();
  const perms = useYxPermissions();
  const me = useCurrentUser();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const [entityId, setEntityId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId && entities.data?.length) setEntityId(entities.data[0].id);
  }, [entities.data, entityId]);
  const keys = entities.data?.find((x) => x.id === entityId)?.keys ?? [];
  const e = entityId ? encodeURIComponent(entityId) : null;
  const setupKey = keys.includes('payroll.setup.manage');
  const statutory = keys.includes('payroll.statutory.setup');
  const setup = usePay<SetupState>(e && setupKey ? `/entities/${e}/setup` : null);
  const regs = usePay<Registrations>(e && statutory ? `/entities/${e}/statutory-registrations` : null);
  const options = usePay<LegalOption[]>(e && statutory ? `/entities/${e}/legal-options` : null);
  const groups = usePay<PayGroup[]>(setupKey ? '/pay-groups' : null);
  const readiness = usePay<GoLiveReadiness>(e ? `/go-live?entityId=${e}` : null);
  const parallel = usePay<ParallelRunView[]>(e ? `/parallel-runs?entityId=${e}` : null);
  const runs = usePay<PayRun[]>('/runs');
  const read = usePayRead();
  const write = usePayWrite();
  const upload = useApiWrite();
  const search = usePeopleSearch();
  const id = encodeURIComponent;
  return {
    page,
    state: payState(entities),
    onRetry: () => void entities.refetch(),
    entities: entities.data ?? [],
    entityId,
    onEntity: setEntityId,
    today: todayIndia(),
    onOpen: (to) => router.push(`/yx/payroll/${LINK[to]}`),
    setup: setup.data ?? null,
    registrations: regs.data ?? null,
    options: options.data ?? null,
    onSaveRegistrations: (rows) =>
      write(
        `/entities/${e}/statutory-registrations`,
        {
          registrations: rows.map((r) => ({
            statute: r.statute,
            state: r.state ?? undefined,
            status: r.status,
            registrationNo: r.registrationNo ?? undefined,
            startOn: r.startOn ?? undefined,
            appliedOn: r.appliedOn ?? undefined,
            responsiblePerson: r.responsiblePerson ?? undefined,
            responsibleDesignation: r.responsibleDesignation ?? undefined,
            version: r.version,
          })),
        },
        'PUT',
      ),
    onSetOption: (optionKey, value, validFrom) => write(`/entities/${e}/legal-options`, { optionKey, value, validFrom }, 'PUT'),
    groups: groups.data ?? (groups.isError ? [] : null),
    onSaveGroup: (gid, g) => (gid ? write(`/pay-groups/${id(gid)}`, g, 'PATCH') : write('/pay-groups', g)),
    onMembers: (gid) => read<PayGroupMember[]>(`/pay-groups/${id(gid)}/members`),
    onAddMembers: (gid, employeeIds, from) => write(`/pay-groups/${id(gid)}/members`, { employeeIds, from }),
    onSearch: (q) => search(q) as Promise<EmployeeHit[]>,
    onCalendar: (gid, year) => read<PayCalendarMonth[]>(`/pay-groups/${id(gid)}/calendar?year=${year}`),
    onStage: (legalEntityId, kind, rows) => write<ImportBatch>('/imports', { legalEntityId, kind, rows }),
    onCommit: (bid) => write(`/imports/${id(bid)}/commit`),
    onGoLiveCheck: (legalEntityId, goLiveMonth) => write<GoLiveCheck>('/imports/go-live-check', { legalEntityId, goLiveMonth }),
    readiness: readiness.data ?? null,
    runs: runs.data ?? [],
    parallel: parallel.data ?? (parallel.isError ? [] : null),
    me: me.data?.id ?? null,
    can: { upload: perms.has('payroll.run.prepare'), decide: perms.has('payroll.run.approve') },
    onUpload: (runId, file) => {
      const body = new FormData();
      body.append('file', file);
      return upload(`/payroll/runs/${id(runId)}/parallel`, body);
    },
    onDecide: (pid, decision, reason) => write(`/parallel-runs/${id(pid)}/decision`, { decision, ...(reason ? { reason } : {}) }),
  };
}
