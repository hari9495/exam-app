'use client';

import { useRouter } from 'next/navigation';
import { ProbationScreen, type ProbationRow } from '@yukthix/ui/workforce';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';

const id = encodeURIComponent;

// People › Probation (PPL-16; M01 §3.4, YX-LC-01): HR sees every open probation and confirms (a confirmation
// change someone else approves) or extends within the company maximum; managers see their team's.
export default function YxProbationPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const list = usePeople<{ today: string; rows: ProbationRow[] }>('/probations');
  const write = usePeopleWrite();
  return (
    <ProbationScreen
      state={loadState(list)}
      onRetry={() => void list.refetch()}
      rows={list.data?.rows ?? []}
      today={list.data?.today ?? ''}
      canManage={perms.has('employee.change.manage')}
      onConfirm={async (employeeId, effectiveDate, reason) => void (await write('POST', '/changes', { employeeId, changeType: 'confirmation', effectiveDate, payload: { status: 'confirmed' }, reason }))}
      onExtend={async (employeeId, months, reason) => void (await write('POST', `/employees/${id(employeeId)}/probation/extend`, { months, reason }))}
      onOpenHistory={(employeeId) => router.push(`/yx/people/history?person=${id(employeeId)}`)}
      changesHref="/yx/people/changes"
    />
  );
}
