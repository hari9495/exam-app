'use client';

import { Suspense } from 'react';
import { Spinner } from '@yukthix/ui';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DeskSetupScreen, type Banner, type Bounce, type Calendar, type CannedResponse, type ComplianceReport, type DeskDetail, type DeskSummary, type DeskTemplates, type InboundEmail, type InboundEmailDetail, type InboundVerdict, type Mailbox, type MailRule, type PortalView, type SeatCost, type SendingDomain, type SlaSetup, type TicketPage, type WebhookSecret } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';
import type { SetupChecklist } from '@yukthix/ui/desk';

// Service desk › Desk set-up (APX-D §5.8, M14 SD-1.01/1.02): desks, seats (cost shown first), groups, categories, types,
// statuses, priority matrix, saved replies, scenarios, numbering, files and business calendars; batch 2 (SD-1.10 …
// SD-1.17): resolve and reopen rules, resolution codes, templates, response targets (SLA / OLA) with monthly
// compliance, which half of a half-day holiday is open, and the paid agents of the month; batch 3 (SD-1.18 … SD-1.23):
// email (mailboxes, rules, held mail, sending domains, bounce list), outside help pages and known-issue banners.
function YxDeskSetupPageInner() {
  const initialTab = useSearchParams()?.get('tab') ?? undefined;
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const perms = useYxPermissions();
  const desks = useDesk<DeskSummary[]>('/desks');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!selected && desks.data?.length) setSelected(desks.data[0].id);
  }, [desks.data, selected]);
  const detail = useDesk<DeskDetail>(selected ? `/desks/${selected}` : null);
  const canned = useDesk<CannedResponse[]>(selected ? `/desks/${selected}/canned-responses` : null);
  const canCalendars = perms.has('desk.sla.manage');
  const calendars = useDesk<Calendar[]>(canCalendars ? '/calendars' : null);
  const [month, setMonth] = useState(() => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7));
  const sla = useDesk<SlaSetup>(selected && canCalendars ? `/desks/${selected}/sla-policies` : null);
  const canReport = perms.has('desk.report.view') || canCalendars;
  const compliance = useDesk<ComplianceReport>(selected && canReport ? `/desks/${selected}/sla-compliance?month=${month}` : null);
  const templates = useDesk<DeskTemplates>(selected ? `/desks/${selected}/templates` : null);
  const billing = useDesk<{ month: string; paidAgents: number; collaborators: unknown[] }>(perms.has('desk.desk.create') ? `/billing/agents?month=${month}` : null);
  // Batch 3 tabs, each only for people who hold its key (the API checks the desk too and answers 403).
  const canEmail = perms.has('desk.mailbox.manage');
  const canPortal = perms.has('desk.portal.manage');
  const canBanner = perms.has('desk.ticket.work');
  const [verdict, setVerdict] = useState<InboundVerdict | 'all'>('held');
  const mailboxes = useDesk<Mailbox[]>(selected && canEmail ? `/desks/${selected}/mailboxes` : null);
  const inbound = useDesk<InboundEmail[]>(selected && canEmail ? `/desks/${selected}/inbound-emails?verdict=${verdict}` : null, { keepPrevious: true });
  const domains = useDesk<SendingDomain[]>(canEmail ? '/sending-domains' : null);
  const bounces = useDesk<Bounce[]>(canEmail ? '/bounces' : null);
  const portals = useDesk<PortalView[]>(canPortal ? '/portals' : null);
  const banners = useDesk<Banner[]>(selected && canBanner ? `/desks/${selected}/banners` : null);
  const openTickets = useDesk<TicketPage>(selected && canBanner ? `/tickets?deskIds=${selected}&states=new,open,pending,on_hold&limit=100` : null);
  const write = useDeskWrite();
  // Batch 4: the set-up checklist and the 3-step wizard (Service Desk admins).
  const canStart = perms.has('desk.desk.create') || perms.has('desk.settings.manage');
  const checklist = useDesk<SetupChecklist>(canStart ? '/setup/checklist' : null);
  const base = `/desks/${selected}`;
  const version = detail.data?.desk.version ?? 0;
  return (
    <DeskSetupScreen
      initialTab={initialTab}
      state={deskState(desks)}
      onRetry={() => void desks.refetch()}
      desks={desks.data ?? []}
      canCreate={perms.has('desk.desk.create')}
      selectedId={selected}
      onSelect={setSelected}
      detail={detail.data ?? null}
      canned={canned.data ?? []}
      calendars={calendars.data ?? []}
      canCalendars={canCalendars}
      onCreateDesk={async (input) => {
        const d = await write<DeskSummary>('/desks', 'POST', input);
        setSelected(d.id);
      }}
      onUpdateDesk={async (change) => {
        await write(base, 'PATCH', { version, ...change });
      }}
      onSearchUsers={(q) => apiFetch(`/desk/users?search=${encodeURIComponent(q)}`, {}, token)}
      onSeatCost={(userId, role) => apiFetch(`/desk${base}/members/cost?userId=${encodeURIComponent(userId)}&role=${role}`, {}, token) as Promise<SeatCost>}
      onAddMember={async (input) => {
        await write(`${base}/members`, 'POST', input);
      }}
      onEndMember={async (memberId) => {
        await write(`${base}/members/${encodeURIComponent(memberId)}`, 'DELETE');
      }}
      onSaveGroup={async (id, input) => {
        await write(id ? `${base}/groups/${id}` : `${base}/groups`, id ? 'PATCH' : 'POST', input);
      }}
      onSaveCategory={async (id, input) => {
        await write(id ? `${base}/categories/${id}` : `${base}/categories`, id ? 'PATCH' : 'POST', input);
      }}
      onSaveType={async (id, input) => {
        await write(id ? `${base}/ticket-types/${id}` : `${base}/ticket-types`, id ? 'PATCH' : 'POST', id ? { name: input.name, active: input.active } : input);
      }}
      onSaveStatus={async (id, input) => {
        await write(id ? `${base}/statuses/${id}` : `${base}/statuses`, id ? 'PATCH' : 'POST', id ? { label: input.label, active: input.active } : input);
      }}
      onSaveMatrix={async (cells) => {
        await write(`${base}/priority-matrix`, 'PUT', { cells });
      }}
      onSaveCanned={async (id, input) => {
        await write(id ? `${base}/canned-responses/${id}` : `${base}/canned-responses`, id ? 'PATCH' : 'POST', input);
      }}
      onSaveScenario={async (id, input) => {
        await write(id ? `${base}/scenarios/${id}` : `${base}/scenarios`, id ? 'PATCH' : 'POST', input);
      }}
      onAddHoliday={async (calendarId, input) => {
        await write(`/calendars/${calendarId}/holidays`, 'POST', input);
      }}
      onSetHours={async (calendarId, input) => {
        await write(`/calendars/${calendarId}/hours`, 'PUT', input);
      }}
      onSetHalfDay={async (calendar, half) => {
        await write(`/calendars/${calendar.id}`, 'PATCH', { version: calendar.version, halfDayOpenHalf: half });
      }}
      billing={billing.data ? { month: billing.data.month, paidAgents: billing.data.paidAgents, collaborators: billing.data.collaborators.length } : null}
      start={
        canStart
          ? {
              checklist: checklist.data ?? null,
              onCreateDesk: async (input) => {
                const d = await write<DeskSummary>('/desks', 'POST', input);
                setSelected(d.id);
                return d;
              },
              onCreatePolicy: async (deskId, input) => {
                await write(`/desks/${encodeURIComponent(deskId)}/sla-policies`, 'POST', input);
              },
              onCreateMailbox: (deskId, address) => write<Partial<WebhookSecret>>(`/desks/${encodeURIComponent(deskId)}/mailboxes`, 'POST', { address, kind: 'hosted' }),
            }
          : undefined
      }
      sla={
        canCalendars
          ? {
              setup: sla.data ?? null,
              compliance: compliance.data ?? null,
              month,
              onMonth: setMonth,
              onCreatePolicy: async (input) => {
                await write(`${base}/sla-policies`, 'POST', input);
              },
              onAddVersion: async (policyId, input) => {
                await write(`/sla-policies/${encodeURIComponent(policyId)}/versions`, 'POST', input);
              },
              onUpdatePolicy: async (policyId, change) => {
                await write(`/sla-policies/${encodeURIComponent(policyId)}`, 'PATCH', change);
              },
              onSaveTargets: async (targets) => {
                await write(`${base}/sla-targets`, 'PUT', { targets });
              },
            }
          : undefined
      }
      email={
        canEmail
          ? {
              state: deskState(mailboxes, inbound),
              mailboxes: mailboxes.data ?? [],
              inbound: inbound.data ?? [],
              domains: domains.data ?? [],
              bounces: bounces.data ?? [],
              verdict,
              onVerdict: setVerdict,
              onCreateMailbox: (input) => write<Mailbox & Partial<WebhookSecret>>(`${base}/mailboxes`, 'POST', input),
              onUpdateMailbox: async (m, change) => {
                await write(`${base}/mailboxes/${m.id}`, 'PATCH', { version: m.version, ...change });
              },
              onRotate: (m) => write<WebhookSecret>(`${base}/mailboxes/${m.id}/rotate`, 'POST'),
              onLoadRules: (m) => apiFetch(`/desk${base}/mailboxes/${m.id}/rules`, {}, token) as Promise<MailRule[]>,
              onSaveRule: async (m, id, input) => {
                await write(id ? `${base}/mailboxes/${m.id}/rules/${id}` : `${base}/mailboxes/${m.id}/rules`, id ? 'PATCH' : 'POST', input);
              },
              onDeleteRule: async (m, id) => {
                await write(`${base}/mailboxes/${m.id}/rules/${id}`, 'DELETE');
              },
              onOpenOriginal: (id) => apiFetch(`/desk${base}/inbound-emails/${encodeURIComponent(id)}`, {}, token) as Promise<InboundEmailDetail>,
              onRelease: (id) => write(`${base}/inbound-emails/${encodeURIComponent(id)}/release`, 'POST'),
              onAddDomain: async (domain) => {
                await write('/sending-domains', 'POST', { domain });
              },
              onCheckDomain: async (id) => {
                await write(`/sending-domains/${encodeURIComponent(id)}/verify-dns`, 'POST');
              },
              onClearBounce: async (id) => {
                await write(`/bounces/${encodeURIComponent(id)}/clear`, 'POST');
              },
            }
          : undefined
      }
      portals={
        canPortal
          ? {
              state: deskState(portals),
              portals: portals.data ?? [],
              onSave: async (p, input) => {
                await write(p ? `/portals/${p.id}` : '/portals', p ? 'PATCH' : 'POST', p ? { version: p.version, ...input } : input);
              },
            }
          : undefined
      }
      banners={
        canBanner
          ? {
              state: deskState(banners),
              banners: banners.data ?? [],
              openTickets: (openTickets.data?.items ?? []).map((t) => ({ id: t.id, number: t.number, subject: t.subject })),
              onSave: async (b, input) => {
                await write(b ? `${base}/banners/${b.id}` : `${base}/banners`, b ? 'PATCH' : 'POST', input);
              },
              onEnd: async (b) => {
                await write(`${base}/banners/${b.id}/end`, 'POST');
              },
            }
          : undefined
      }
      workSetup={{
        templates: templates.data ?? null,
        onSaveCode: async (id, input) => {
          await write(id ? `${base}/resolution-codes/${id}` : `${base}/resolution-codes`, id ? 'PATCH' : 'POST', input);
        },
        onSaveTemplate: async (id, input) => {
          await write(id ? `${base}/templates/${id}` : `${base}/templates`, id ? 'PATCH' : 'POST', input);
        },
      }}
    />
  );
}

// useSearchParams needs a Suspense boundary (Next prerender).
export default function YxDeskSetupPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <YxDeskSetupPageInner />
    </Suspense>
  );
}
