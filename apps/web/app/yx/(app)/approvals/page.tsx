'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@yukthix/ui';
import { ChannelLinksCard, type ApprovalHistory, type ApprovalTask, type ChannelLinkView } from '@yukthix/ui/desk';
import { ApprovalsInboxScreen } from '@yukthix/ui/frame';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { sentRow, teamRow, waitingRow, type TeamDecision } from '../../../../lib/yx-approvals';
import { useLiveDelegation } from '../../../../lib/yx-delegation';

// Approvals (PLT-04, the designed inbox; P03 shared screen, M14 SD-2.05): what waits for me and what was delegated to
// me, bulk approve, what I sent, the team's decisions, and who approves for me while I am away. No permission key: the
// API returns only the person's own tasks, requests, delegations and the decisions on requests they hold.
function Approvals() {
  const { accessToken } = useAuth();
  // ?request=<id>: a notice or email pointed at one request; it opens in the side panel.
  const focus = useSearchParams()?.get('request') ?? null;
  const token = accessToken ?? undefined;
  const qc = useQueryClient();
  const { toast } = useToast();
  const delegation = useLiveDelegation();
  const get = <T,>(path: string) => ({ queryKey: ['workflow', path], queryFn: () => apiFetch(`/workflow${path}`, {}, token) as Promise<T>, enabled: Boolean(token), retry: false });
  const tasks = useQuery(get<ApprovalTask[]>('/approvals/inbox'));
  const history = useQuery(get<ApprovalHistory>('/approvals/history'));
  const team = useQuery(get<TeamDecision[]>('/approvals/team-history'));
  // SD-2.06: linked chat apps, and (local demo only) the cards they were sent.
  const links = useQuery(get<ChannelLinkView>('/channel-links'));
  const sent = useQuery({ ...get<{ provider: string; at: string; title: string; url: string | null }[]>('/channel-links/sent'), enabled: Boolean(token && links.data?.typedLinksAllowed), refetchInterval: 15_000 });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['workflow'] });
    void qc.invalidateQueries({ queryKey: ['yx', 'workspace', 'counts'] }); // the side-menu Approvals count follows at once
  };
  const post = (path: string, body: unknown) => apiFetch(`/workflow${path}`, { method: 'POST', body: JSON.stringify(body) }, token);
  const waiting = (tasks.data ?? []).map(waitingRow);
  const openId = focus ? waiting.find((r) => tasks.data?.find((t) => t.taskId === r.id)?.requestId === focus)?.id : undefined;
  return (
    <ApprovalsInboxScreen
      key={openId ?? 'list'}
      waiting={waiting}
      sent={(history.data?.sent ?? []).map(sentRow)}
      history={(team.data ?? []).map(teamRow)}
      openId={openId}
      state={tasks.isLoading ? 'loading' : tasks.isError ? 'error' : 'ready'}
      live={{
        today: new Date(new Date().toDateString()),
        onRetry: () => void tasks.refetch(),
        onDecide: async (row, decision, reason) => {
          await post(`/approvals/tasks/${encodeURIComponent(row.id)}/decide`, { decision, ...(reason ? { reason } : {}) });
          await refresh();
        },
        onBulkApprove: async (rows) => {
          const out = (await post('/approvals/tasks/decide', { taskIds: rows.map((r) => r.id), decision: 'approve' })) as { results: { taskId: string; ok: boolean; message?: string }[] };
          await refresh();
          return out.results.filter((x) => !x.ok).map((x) => ({ id: x.taskId, message: x.message ?? 'Not approved.' }));
        },
        delegation,
        onDone: (text) => toast({ tone: 'success', title: text }),
        footer: (
          <ChannelLinksCard
            links={links.data}
            sent={sent.data ?? null}
            onAdd={async (provider, externalRef) => {
              await post('/channel-links', { provider, externalRef });
              await qc.invalidateQueries({ queryKey: ['workflow'] });
              toast({ tone: 'success', title: `${provider === 'teams' ? 'Microsoft Teams' : 'Slack'} linked. Approval cards go there too.` });
            }}
            onRemove={async (id) => {
              await apiFetch(`/workflow/channel-links/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
              await qc.invalidateQueries({ queryKey: ['workflow'] });
              toast({ tone: 'success', title: 'Unlinked. Approval cards no longer go to that app.' });
            }}
          />
        ),
      }}
    />
  );
}

export default function YxApprovalsPage() {
  return (
    <Suspense>
      <Approvals />
    </Suspense>
  );
}
