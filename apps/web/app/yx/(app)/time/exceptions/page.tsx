'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { ExceptionsScreen, type ExceptionsList, type ExceptionsQuery } from '@yukthix/ui/time';
import { timeState, useOtherWrite, useTime, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Team / HR › Attendance exceptions (TIM-04): the month's days that need a decision, one page at a time (the server
// pages and filters them). HR (leave.approve over the person) resolves them as present or absent with a reason; a
// waiting fix is approved or rejected as the viewer's task in the shared approvals engine. ?search= opens it for one person.
function YxExceptionsInner() {
  const params = useSearchParams();
  const defaultSearch = params.get('search') ?? '';
  const { month, setMonth, entity } = useScopeParams();
  const [q, setQ] = useState<ExceptionsQuery>({ status: ['Open', 'Request pending'], kind: [], search: defaultSearch, page: 1, pageSize: 50 });
  const query = [
    q.status.length ? `status=${encodeURIComponent(q.status.join(','))}` : '',
    q.kind.length ? `kind=${encodeURIComponent(q.kind.join(','))}` : '',
    q.search ? `search=${encodeURIComponent(q.search)}` : '',
    `page=${q.page}`,
    `pageSize=${q.pageSize}`,
  ];
  const list = useTime<ExceptionsList>(withParams(`/exceptions?month=${month}`, entity, ...query));
  const write = useTimeWrite();
  const other = useOtherWrite();
  return (
    <ExceptionsScreen
      live={{
        state: timeState(list),
        onRetry: () => void list.refetch(),
        data: list.data ?? null,
        month,
        onMonth: (m) => {
          setQ({ ...q, page: 1 });
          setMonth(m);
        },
        onQuery: setQ,
        onResolve: (input) => write('/exceptions/resolve', 'POST', input, true, input.days.length === 1 ? 'Exception resolved' : `${input.days.length} exceptions resolved`),
        onDecideTask: (taskId, decision, reason) => other(`/workflow/approvals/tasks/${encodeURIComponent(taskId)}/decide`, { decision, ...(reason ? { reason } : {}) }, decision === 'approve' ? 'Request approved' : 'Request rejected'),
        defaultSearch: defaultSearch || undefined,
        musterHref: '/yx/time/muster',
      }}
    />
  );
}

export default function YxExceptionsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxExceptionsInner />
    </Suspense>
  );
}
