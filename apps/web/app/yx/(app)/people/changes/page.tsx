'use client';

import { JobChangesScreen, type ChangeRecord, type Impact, type PersonOption } from '@yukthix/ui/history';
import { loadState, todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { useChangeOptions, usePeople, usePeopleWrite, useRaiseChange } from '../../../../../lib/yx-people';

const id = encodeURIComponent;

// People › Job changes (P06 §7, PPL-05). Approving is a step-up action (apiFetch asks the person to confirm
// it's them, then resends); the API refuses anyone approving their own change (YX-SEC-11).
export default function YxJobChangesPage() {
  const perms = useYxPermissions();
  const rows = usePeople<ChangeRecord[]>('/changes');
  const canManage = perms.has('employee.change.manage');
  const people = usePeople<PersonOption[]>(canManage ? '/employees' : null);
  const options = useChangeOptions(people.data ?? [], perms.has('employee.salary.manage'), canManage);
  const write = usePeopleWrite();
  const raise = useRaiseChange();
  return (
    <JobChangesScreen
      state={loadState(rows)}
      onRetry={() => void rows.refetch()}
      today={todayIst()}
      rows={rows.data ?? []}
      canApprove={perms.has('employee.change.approve')}
      canManage={canManage}
      personHref={(employeeId) => `/yx/people/history?person=${id(employeeId)}`}
      onPreview={(changeId) => write<Impact>('GET', `/changes/${id(changeId)}/preview`)}
      onApprove={async (changeId, confirmRebase) => void (await write('POST', `/changes/${id(changeId)}/approve`, { confirmRebase }))}
      onReject={async (changeId, reason) => void (await write('POST', `/changes/${id(changeId)}/reject`, { reason }))}
      onCancel={async (changeId, reason) => void (await write('POST', `/changes/${id(changeId)}/cancel`, { reason, confirmRebase: true }))}
      onReschedule={async (changeId, effectiveDate) => void (await write('PUT', `/changes/${id(changeId)}`, { effectiveDate }))}
      newChange={canManage ? { options, ...raise } : undefined}
    />
  );
}
