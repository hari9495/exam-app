'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  EscalateDialog,
  RequestPanel,
  ResolveDialog,
  TicketKbCard,
  TicketScreen,
  TicketWorkRail,
  type ArticleOption,
  type TicketArticleLink,
  type CannedResponse,
  type DeskDetail,
  type DeskSummary,
  type DeskTemplates,
  type Person,
  type Presence,
  type RequesterContext,
  type TicketBrief,
  type TicketDetail,
  type TicketPage,
  type TicketWork,
  type TimelineEntry,
  type TicketRequestView,
  type PickOption,
} from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useCurrentUser } from '../../../../../../lib/hooks/useCurrentUser';
import { deskState, useDesk, useDeskFile, useDeskUpload, useDeskWrite } from '../../../../../../lib/yx-desk';

// Service desk › Tickets › one ticket (HLP-03, M14 SD-1.08 … SD-1.17): reply, note, assign, files, time, the requester's
// other tickets, who else is on it (YX-SD-07, every 15 seconds), and batch 2: response targets with their timeline,
// tasks, related tickets (link, merge, split, parent, tracker), side conversations, reminders, snooze, hidden personal
// data, resolve with a code and support levels.
export default function YxDeskTicketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const me = useCurrentUser();
  const path = `/tickets/${encodeURIComponent(id)}`;
  const ticket = useDesk<TicketDetail>(path, { refetchInterval: 20_000 });
  const deskId = ticket.data?.deskId ?? null;
  const detail = useDesk<DeskDetail>(deskId ? `/desks/${deskId}` : null);
  const canned = useDesk<CannedResponse[]>(deskId ? `/desks/${deskId}/canned-responses` : null);
  const timeline = useDesk<TimelineEntry[]>(`${path}/timeline`);
  const context = useDesk<RequesterContext>(`${path}/context`);
  const work = useDesk<TicketWork>(`${path}/work`, { refetchInterval: 30_000 });
  const desks = useDesk<DeskSummary[]>('/desks');
  const codes = useDesk<DeskTemplates>(deskId ? `/desks/${deskId}/templates` : null);
  // Batch 4 (US-G-023, US-B-106): articles used on this ticket, and the spaces the agent may write in.
  const kbLinks = useDesk<TicketArticleLink[]>(`${path}/kb-links`);
  const kbSpaces = useDesk<{ id: string; name: string; canAuthor: boolean }[]>('/kb/spaces');
  // 3b-2: ordered items with their approvals and tasks, and ad-hoc approvals on this ticket.
  const request = useDesk<TicketRequestView>(`${path}/request`);
  const write = useDeskWrite();
  const upload = useDeskUpload();
  const openFile = useDeskFile();
  const [others, setOthers] = useState<Presence[]>([]);
  const [resolving, setResolving] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const typing = useRef(false);

  const beat = useCallback(() => {
    if (!token) return;
    void (apiFetch(`/desk${path}/presence`, { method: 'POST', body: JSON.stringify({ typing: typing.current }) }, token) as Promise<Presence[]>).then(setOthers).catch(() => setOthers([]));
  }, [path, token]);
  useEffect(() => {
    beat();
    const h = setInterval(beat, 15_000);
    return () => clearInterval(h);
  }, [beat]);

  const t = ticket.data;
  const version = t?.version ?? 0;
  const d = detail.data;
  const deskRules = desks.data?.find((x) => x.id === deskId);
  const open = (other: string) => router.push(`/yx/desk/tickets/${encodeURIComponent(other)}`);
  return (
    <>
      <TicketScreen
        state={deskState(ticket)}
        onRetry={() => void ticket.refetch()}
        ticket={t ?? null}
        detail={d ?? null}
        canned={canned.data ?? []}
        timeline={timeline.data ?? []}
        context={context.data ?? null}
        others={others}
        meName={me.data?.name || me.data?.email || 'Me'}
        meId={me.data?.id ?? ''}
        onBack={() => router.push('/yx/desk/tickets')}
        onUpdate={async (change) => {
          await write(path, 'PATCH', { version, ...change });
        }}
        onAssign={async (userId) => {
          await write(`${path}/assign`, 'POST', { userId });
        }}
        onPost={async (m) => {
          await write(`${path}/messages`, 'POST', m);
        }}
        onUpload={(file) => upload(`${path}/attachments`, file)}
        onOpenFile={(attachmentId) => openFile(`${path}/attachments/${encodeURIComponent(attachmentId)}/link`)}
        onAddTime={async (minutes, note) => {
          await write(`${path}/time-entries`, 'POST', { minutes, ...(note ? { note } : {}) });
        }}
        onRunScenario={async (scenarioId) => {
          await write(`${path}/scenarios/${encodeURIComponent(scenarioId)}`, 'POST', { version });
        }}
        onConvert={async (typeId, reason) => {
          await write(`${path}/convert`, 'POST', { typeId, reason });
        }}
        onAddCollaborator={async (userId) => {
          await write(`${path}/collaborators`, 'POST', { userId });
        }}
        onRemoveCollaborator={async (userId) => {
          await write(`${path}/collaborators/${encodeURIComponent(userId)}`, 'DELETE');
        }}
        onAddWatcher={async (personId) => {
          await write(`${path}/watchers`, 'POST', { personId });
        }}
        onRemoveWatcher={async (watcherId) => {
          await write(`${path}/watchers/${encodeURIComponent(watcherId)}`, 'DELETE');
        }}
        onSearchPeople={(q) => apiFetch(`/desk/people?search=${encodeURIComponent(q)}`, {}, token) as Promise<Person[]>}
        onTyping={(now) => {
          if (now !== typing.current) {
            typing.current = now;
            beat();
          }
        }}
        onOpenTicket={open}
        onFindArticle={(q) => apiFetch(`/desk${path}/kb?q=${encodeURIComponent(q)}`, {}, token) as Promise<ArticleOption[]>}
        onArticleInserted={(articleId) => void write(`${path}/kb-links`, 'POST', { articleId, kind: 'linked' }).catch(() => undefined)}
        onResolveClick={() => setResolving(true)}
        onEscalateClick={() => setEscalating(true)}
        rail={
          t && d ? (
            <>
            {request.data && (
              <RequestPanel
                view={request.data}
                canAsk={Boolean(t.canWork)}
                onAsk={(input) => write(`${path}/approvals`, 'POST', input)}
                onFindPeople={(q) => apiFetch(`/workflow/people?q=${encodeURIComponent(q)}`, {}, token) as Promise<PickOption[]>}
              />
            )}
            <TicketKbCard
              links={kbLinks.data ?? []}
              solved={['solved', 'closed'].includes(t.systemState)}
              canWork={Boolean(t.canWork)}
              spaces={(kbSpaces.data ?? []).filter((s) => s.canAuthor)}
              onSolvedBy={(articleId) => write(`${path}/kb-links`, 'POST', { articleId, kind: 'solved' })}
              onFlag={(articleId, reason) => write(`/kb/articles/${encodeURIComponent(articleId)}/flag`, 'POST', { reason })}
              onMakeArticle={(spaceId) => write<{ id: string }>(`${path}/kb-article`, 'POST', { spaceId })}
              onOpenArticle={(articleId) => router.push(`/yx/desk/knowledge?article=${encodeURIComponent(articleId)}`)}
            />
            <TicketWorkRail
              ticket={t}
              detail={d}
              work={work.data ?? null}
              desks={desks.data ?? []}
              meId={me.data?.id ?? ''}
              onFindTicket={async (q) => ((await apiFetch(`/desk/tickets?search=${encodeURIComponent(q)}&limit=10`, {}, token)) as TicketPage).items as unknown as TicketBrief[]}
              onOpenTicket={open}
              onLink={async (ticketId, kind) => {
                await write(`${path}/links`, 'POST', { ticketId, kind });
              }}
              onUnlink={async (linkId) => {
                await write(`${path}/links/${encodeURIComponent(linkId)}`, 'DELETE');
              }}
              onMerge={async (intoTicketId) => {
                await write(`${path}/merge`, 'POST', { intoTicketId, version });
                open(intoTicketId);
              }}
              onSplit={(input) => write<{ id: string }>(`${path}/split`, 'POST', input)}
              onSetParent={async (parentId) => {
                await write(`${path}/parent`, 'PUT', { parentId });
              }}
              onSetTracker={async (tracker) => {
                await write(`${path}/tracker`, 'PUT', { tracker });
              }}
              onStartSide={async (input) => {
                await write(`${path}/side-conversations`, 'POST', input);
              }}
              onSideMessage={async (sideId, bodyHtml) => {
                await write(`${path}/side-conversations/${encodeURIComponent(sideId)}/messages`, 'POST', { bodyHtml });
              }}
              onCloseSide={async (sideId) => {
                await write(`${path}/side-conversations/${encodeURIComponent(sideId)}/close`, 'POST');
              }}
              onAddTask={async (input) => {
                await write(`${path}/tasks`, 'POST', input);
              }}
              onUpdateTask={async (task, change) => {
                await write(`/tasks/${encodeURIComponent(task.id)}`, 'PATCH', { version: task.version, ...change });
              }}
              onBreachReason={async (timerId, reason) => {
                await write(`${path}/sla/${encodeURIComponent(timerId)}/breach-reason`, 'POST', { reason });
              }}
              onExclude={async (timerId, reason) => {
                await write(`${path}/sla/${encodeURIComponent(timerId)}/exclusion`, 'POST', { reason });
              }}
              onRemind={async (remindAt, note) => {
                await write('/me/reminders', 'POST', { remindAt, ticketId: id, ...(note ? { note } : {}) });
              }}
              onSnooze={async (until) => {
                await write(`${path}/snooze`, 'POST', { until });
              }}
              onDoneReminder={async (reminderId) => {
                await write(`/me/reminders/${encodeURIComponent(reminderId)}/done`, 'POST');
              }}
              onUnmask={async (valueId) => ((await write<{ value: string }>(`${path}/unmask/${encodeURIComponent(valueId)}`, 'POST')).value)}
            />
            </>
          ) : null
        }
      />
      {t && d && resolving && (
        <ResolveDialog
          open={resolving}
          onOpenChange={setResolving}
          ticket={t}
          codes={codes.data?.resolutionCodes ?? []}
          required={Boolean(deskRules?.resolutionRequired)}
          linked={work.data?.links.filter((l) => l.kind === 'tracked_by' && l.direction === 'in').length ?? 0}
          onResolve={async (input) => {
            await write(`${path}/resolve`, 'POST', { version, ...input });
          }}
        />
      )}
      {t && d && escalating && (
        <EscalateDialog
          open={escalating}
          onOpenChange={setEscalating}
          ticket={t}
          detail={d}
          onEscalate={async (input) => {
            await write(`${path}/escalate`, 'POST', input);
          }}
        />
      )}
    </>
  );
}
