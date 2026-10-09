'use client';

import { Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { BulkChangesScreen, type BulkResult, type ChangeBatch, type OrgChartData } from '@yukthix/ui/workforce';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { chartPeople, usePeople, usePeopleRead, usePeopleWrite } from '../../../../../lib/yx-people';

const id = encodeURIComponent;

// People › Bulk changes (PPL-06/07; M01 §3.3, §3.2): a CSV file or a team move, checked row by row, sent as one
// batch and approved once by someone outside it (approval is a step-up action, YX-SEC-11).
function Bulk() {
  const params = useSearchParams();
  const perms = useYxPermissions();
  const canManage = perms.has('employee.change.manage');
  const batches = usePeople<ChangeBatch[]>('/change-batches');
  const chart = usePeople<OrgChartData>(canManage ? '/org-chart' : null);
  const read = usePeopleRead();
  const write = usePeopleWrite();
  const loadBatch = useCallback((batchId: string) => read<ChangeBatch>(`/change-batches/${id(batchId)}`), [read]);
  return (
    <BulkChangesScreen
      state={loadState(batches)}
      onRetry={() => void batches.refetch()}
      batches={batches.data ?? []}
      people={chartPeople(chart.data)}
      canManage={canManage}
      canApprove={perms.has('employee.change.approve')}
      canPay={perms.has('employee.salary.manage')}
      defaultBatchId={params.get('batch')}
      onCheckFile={(input) => write<BulkResult>('POST', '/change-batches', input)}
      onCheckReassign={(input) => write<BulkResult>('POST', '/change-batches/reassign', input)}
      loadBatch={loadBatch}
      onApprove={async (batchId, confirmRebase) => void (await write('POST', `/change-batches/${id(batchId)}/approve`, { confirmRebase }))}
      onReject={async (batchId, reason) => void (await write('POST', `/change-batches/${id(batchId)}/reject`, { reason }))}
      onCancel={async (batchId, reason) => void (await write('POST', `/change-batches/${id(batchId)}/cancel`, { reason }))}
    />
  );
}

export default function YxBulkChangesPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Bulk />
    </Suspense>
  );
}
