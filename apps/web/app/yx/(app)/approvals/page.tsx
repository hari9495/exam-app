'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@yukthix/ui';
import { ApprovalsScreen, ChannelLinksCard, type ApprovalHistory, type ApprovalTask, type ChannelLinkView, type Delegation, type PickOption } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { deskState } from '../../../../lib/yx-desk';

// Approvals (P03 shared screen, M14 SD-2.05): what waits for me, my decisions, and who approves for me while I am away.
// No permission key: the API returns only the person's own tasks, requests and delegations.
function Approvals() {
  const { accessToken } = useAuth();
  // ?request=<id>: a notice or email pointed at one request; it is scrolled into view and marked.
  const focus = useSearchParams()?.get('request') ?? null;
  const token = accessToken ?? undefined;
  const qc = useQueryClient();
  const { toast } = useToast();
  const me = useCurrentUser();
  const get = <T,>(path: string) => ({ queryKey: ['workflow', path], queryFn: () => apiFetch(`/workflow${path}`, {}, token) as Promise<T>, enabled: Boolean(token), retry: false });
  const tasks = useQuery(get<ApprovalTask[]>('/approvals/inbox'));
  const history = useQuery(get<ApprovalHistory>('/approvals/history'));
  const delegations = useQuery(get<Delegation[]>('/delegations'));
  // SD-2.06: linked chat apps, and (local demo only) the cards they were sent.
  const links = useQuery(get<ChannelLinkView>('/channel-links'));
  const sent = useQuery({ ...get<{ provider: string; at: string; title: string; url: string | null }[]>('/channel-links/sent'), enabled: Boolean(token && links.data?.typedLinksAllowed), refetchInterval: 15_000 });
  const write = async (path: string, body?: unknown) => {
    const r = await apiFetch(`/workflow${path}`, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, token);
    await qc.invalidateQueries({ queryKey: ['workflow'] });
    return r;
  };
  return (
    <>
    <ApprovalsScreen
      state={deskState(tasks)}
      onRetry={() => void tasks.refetch()}
      tasks={tasks.data ?? []}
      history={history.data ?? null}
      delegations={delegations.data ?? []}
      timeZone={me.data?.timeZone ?? undefined}
      onDecide={async (t, decision, reason) => {
        await write(`/approvals/tasks/${encodeURIComponent(t.taskId)}/decide`, { decision, ...(reason ? { reason } : {}) });
        void qc.invalidateQueries({ queryKey: ['yx', 'workspace', 'counts'] }); // the side-menu Approvals count follows at once
        // A decision is "done": a toast says what happened (founder rule).
        toast({ tone: 'success', title: decision === 'approve' ? `Approved: ${t.title}` : `Not approved: ${t.title}`, ...(t.requester ? { description: `${t.requester} is told by email and in their bell.` } : {}) });
      }}
      onDelegate={(input) => write('/delegations', input)}
      onRevoke={(id) => write(`/delegations/${encodeURIComponent(id)}/revoke`)}
      onFindPeople={(q) => apiFetch(`/workflow/people?q=${encodeURIComponent(q)}`, {}, token) as Promise<PickOption[]>}
      focusRequestId={focus}
    />
    <div className="yx-auth__page">
      <ChannelLinksCard
        links={links.data}
        sent={sent.data ?? null}
        onAdd={(provider, externalRef) => write('/channel-links', { provider, externalRef })}
        onRemove={async (id) => {
          await apiFetch(`/workflow/channel-links/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
          await qc.invalidateQueries({ queryKey: ['workflow'] });
        }}
      />
    </div>
    </>
  );
}

export default function YxApprovalsPage() {
  return (
    <Suspense>
      <Approvals />
    </Suspense>
  );
}
