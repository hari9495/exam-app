'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TimesheetApprovalsScreen, type LiveApprovalsData, type NotSentPerson } from '@yukthix/ui/hiring';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState } from '../../../../../lib/yx-org';

// Projects › Timesheet approvals (PRJ-02), Projects P-2 (answers 1406, 1407, 1442): the lines waiting for me, by
// project and week. The API lets each person decide only the lines they approve.
export default function YxTimesheetApprovalsPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const data = useQuery<LiveApprovalsData>({ queryKey: ['projects', '/line-approvals'], queryFn: () => apiFetch('/time/line-approvals', {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  // Batch D answer 2535: people on my projects with weeks not sent (empty unless I manage a project).
  const notSent = useQuery<{ people: NotSentPerson[] }>({ queryKey: ['projects', '/line-approvals/not-sent'], queryFn: () => apiFetch('/time/line-approvals/not-sent', {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  const post = async (path: string, body: unknown) => {
    try {
      await apiFetch(`/time/line-approvals/${path}`, { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined);
    } finally {
      // The menu's count and the list follow (both under ['projects']).
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  };
  const state = loadState(data);
  return (
    <TimesheetApprovalsScreen
      live={{
        state: state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onDecide: (decisions) => post('decide', { decisions }),
        onBulk: (items) => post('bulk', { items }),
        notSent: { state: notSent.isError ? 'error' : notSent.data ? 'ready' : 'loading', data: notSent.data ?? null, onRetry: () => void notSent.refetch(), onRemind: (employeeId) => post(`not-sent/${encodeURIComponent(employeeId)}/remind`, {}) },
      }}
    />
  );
}
