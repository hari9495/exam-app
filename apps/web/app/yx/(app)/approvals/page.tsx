'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApprovalsScreen, ChannelLinksCard, type ApprovalHistory, type ApprovalTask, type ChannelLinkView, type Delegation, type PickOption } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { deskState } from '../../../../lib/yx-desk';

// Approvals (P03 shared screen, M14 SD-2.05): what waits for me, my decisions, and who approves for me while I am away.
// No permission key: the API returns only the person's own tasks, requests and delegations.
export default function YxApprovalsPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const qc = useQueryClient();
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
      onDecide={(t, decision, reason) => write(`/approvals/tasks/${encodeURIComponent(t.taskId)}/decide`, { decision, ...(reason ? { reason } : {}) })}
      onDelegate={(input) => write('/delegations', input)}
      onRevoke={(id) => write(`/delegations/${encodeURIComponent(id)}/revoke`)}
      onFindPeople={(q) => apiFetch(`/workflow/people?q=${encodeURIComponent(q)}`, {}, token) as Promise<PickOption[]>}
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
