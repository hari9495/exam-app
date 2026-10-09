'use client';

import { useRouter } from 'next/navigation';
import { ProbationScreen, type ProbationRow } from '@yukthix/ui/workforce';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Probation (PPL-16 / PPL-17; M01 §3.4, YX-LC-01): HR sees every open probation and confirms (a confirmation
// change someone else approves) or extends within the company maximum; the direct manager reviews (lifecycle 6c).
export default function YxProbationPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const list = usePeople<{ today: string; rows: ProbationRow[] }>('/probations');
  const write = usePeopleWrite();
  const lifeWrite = useLifeWrite();
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
      onReview={async (employeeId, review) => {
        await lifeWrite('POST', `/lifecycle/probations/${id(employeeId)}/review`, { outcome: review.outcome, comments: review.comments, ...(review.months ? { months: review.months } : {}), ...(review.rating ? { rating: review.rating } : {}) });
        await list.refetch();
      }}
    />
  );
}
