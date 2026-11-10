'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TalentCrmScreen, type AudienceCount, type CampaignView, type LiveCrm, type LivePool, type LivePoolMember, type LivePostingJob, type LiveTalentCrm, type SourcedRow } from '@yukthix/ui/hiring';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { useApiWrite, useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';

const enc = encodeURIComponent;
const listState = (q: { isError: boolean; data?: unknown }): 'error' | 'ready' | 'loading' => (q.isError ? 'error' : q.data ? 'ready' : 'loading');

type Step = { kind: 'message'; templateId: string } | { kind: 'wait'; days: number };
interface CampaignsApi {
  campaigns: { id: string; name: string; channel: 'email' | 'whatsapp'; poolName: string | null; steps: Step[]; stopOnReply: boolean; status: CampaignView['status']; counts: CampaignView['counts'] }[];
  templates: { email: { id: string; name: string }[]; whatsapp: { id: string; name: string }[] };
  whatsappConnected: boolean;
  window: string;
  dailyCap: number;
}
interface EngagementApi {
  name: string;
  consent: { email: 'opted-in' | 'opted-out' | 'none'; whatsapp: 'opted-in' | 'opted-out' | 'none' };
  items: { id: string; at: string; kind: 'enrolled' | 'sent' | 'failed' | 'stopped'; campaign: string; step: number | null; channel: string | null; reason: string | null }[];
}
interface SourcedApi {
  keepDays: number;
  profiles: { id: string; name: string; headline: string | null; site: string; sourceNote: string; status: 'pending' | 'given' | 'declined'; daysLeft: number | null; capturedBy: string | null; createdAt: string; candidateId: string | null }[];
}

const WINDOW: Record<string, string> = { '09-21': 'from 9 am to 9 pm IST', '10-18': 'from 10 am to 6 pm IST', '08-20': 'from 8 am to 8 pm IST', '00-24': 'at any time' };
const STOPPED: Record<string, string> = { replied: 'replied', applied: 'applied to a job', opted_out: 'opted out', no_consent: 'consent ended', hired: 'was hired', erased: 'was erased', campaign_stopped: 'the campaign was stopped' };

// Hiring › Talent CRM (HIR-20): the designed TalentCrmScreen with `live`. Pools and hotlists, postings, and with the
// candidate manage key the campaigns (sequence builder, engagement timeline) and sourced profiles. The API refuses
// writes while acting for someone else, and another company's records are not found.
export default function YxHiringPoolsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const manage = perms.has('candidate:manage');
  const lists = useHiring<LivePool[]>('/pools');
  const members = useHiring<{ members: LivePoolMember[] }>(selected ? `/pools/${enc(selected)}/members` : null);
  const postings = useHiring<LivePostingJob[]>('/postings', perms.has('pipeline:manage') || perms.has('results:view'));
  const camps = useHiring<CampaignsApi>('/campaigns', manage);
  const sourced = useHiring<SourcedApi>('/sourced', manage);
  const shownCampaign = campaignId ?? camps.data?.campaigns[0]?.id ?? null;
  const people = useHiring<{ candidateId: string; name: string; status: 'active' | 'done' | 'stopped'; stopReason: string | null }[]>(manage && shownCampaign ? `/campaigns/${enc(shownCampaign)}/members` : null);
  const engagement = useHiring<EngagementApi>(manage && personId ? `/candidates/${enc(personId)}/engagement` : null);
  const write = useHiringWrite();
  const apiWrite = useApiWrite();
  const acting = impersonating || actingSuperAdmin;
  const status = (lists.error as { status?: number } | null)?.status;
  const audience = useCallback((poolId: string, channel: 'email' | 'whatsapp') => write<AudienceCount>('POST', '/campaigns/audience', { poolId, channel }), [write]);

  const crm = useMemo<LiveCrm | undefined>(() => {
    if (!manage) return undefined;
    const d = camps.data;
    const tName = (id: string) => [...(d?.templates.email ?? []), ...(d?.templates.whatsapp ?? [])].find((t) => t.id === id)?.name ?? 'Template removed';
    const campaigns: CampaignView[] = (d?.campaigns ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      audience: c.poolName ?? 'a deleted pool',
      status: c.status,
      stopOnReply: c.stopOnReply,
      counts: c.counts,
      steps: c.steps.map((s, i) => (s.kind === 'wait' ? { id: `s${i}`, kind: 'wait' as const, days: s.days } : { id: `s${i}`, kind: 'message' as const, channel: c.channel, template: tName(s.templateId) })),
    }));
    const rows: SourcedRow[] = (sourced.data?.profiles ?? [])
      .filter((r) => r.status !== 'declined')
      .map((r) => ({ id: r.id, name: r.name, headline: r.headline, site: r.site, note: r.sourceNote, status: r.status === 'given' ? 'given' : 'pending', daysLeft: r.daysLeft, capturedBy: r.capturedBy, capturedAt: new Date(r.createdAt), candidateId: r.candidateId }));
    const e = engagement.data;
    return {
      today: new Date(),
      campaigns: {
        state: listState(camps),
        onRetry: () => void Promise.all([camps.refetch(), people.refetch(), engagement.refetch()]),
        campaigns,
        selectedId: shownCampaign,
        onSelect: (id) => {
          setCampaignId(id);
          setPersonId(null);
        },
        people: { state: listState(people), rows: (people.data ?? []).map((m) => ({ id: m.candidateId, name: m.name, status: m.status, reason: m.stopReason })) },
        personId,
        onPerson: setPersonId,
        engagement: {
          state: listState(engagement),
          view: e
            ? {
                name: e.name,
                email: e.consent.email,
                whatsapp: e.consent.whatsapp,
                items: e.items.map((i) => ({
                  id: i.id,
                  at: new Date(i.at),
                  actor: { name: i.kind === 'stopped' && i.reason === 'replied' ? 'Hiring team' : 'Automatic' },
                  action:
                    i.kind === 'enrolled'
                      ? `enrolled in ${i.campaign}`
                      : i.kind === 'stopped'
                        ? `${i.campaign} stopped: ${STOPPED[i.reason ?? ''] ?? 'stopped'}`
                        : `${i.kind === 'sent' ? 'sent' : 'could not send'} ${i.channel === 'whatsapp' ? 'WhatsApp' : 'email'} step ${i.step} of ${i.campaign}`,
                })),
              }
            : null,
        },
        onStart: (c) => write('POST', `/campaigns/${enc(c.id)}/start`),
        onStop: (c) => write('POST', `/campaigns/${enc(c.id)}/stop`),
        onReplied: (c, id) => write('POST', `/campaigns/${enc(c.id)}/members/${enc(id)}/replied`),
      },
      builder: {
        pools: (lists.data ?? []).filter((p) => p.kind === 'pool').map((p) => ({ value: p.id, label: p.name })),
        templates: { email: (d?.templates.email ?? []).map((t) => ({ value: t.id, label: t.name })), whatsapp: (d?.templates.whatsapp ?? []).map((t) => ({ value: t.id, label: t.name })) },
        whatsappConnected: Boolean(d?.whatsappConnected),
        sendRule: `${WINDOW[d?.window ?? '09-21'] ?? 'in the send window'}, at most ${d?.dailyCap ?? 200} messages a day`,
        audience,
        onSave: async (draft, start) => {
          const r = await write<{ id: string; enrolled: number }>('POST', '/campaigns', { ...draft, start });
          setCampaignId(r.id);
          return { enrolled: r.enrolled };
        },
      },
      sourced: {
        state: listState(sourced),
        onRetry: () => void sourced.refetch(),
        rows,
        keepDays: sourced.data?.keepDays ?? 30,
        onAdd: (input) => write('POST', '/sourced', input),
        onResend: (r) => write('POST', `/sourced/${enc(r.id)}/resend`),
        onErase: (r) => write('DELETE', `/sourced/${enc(r.id)}`),
        onOpenCandidate: (id) => router.push(`/yx/hiring/candidates/${enc(id)}`),
      },
    };
  }, [manage, camps, sourced, people, engagement, lists.data, shownCampaign, personId, write, audience, router]);

  const live: LiveTalentCrm = {
    state: lists.isError ? (status === 403 ? 'denied' : 'error') : lists.data ? 'ready' : 'loading',
    onRetry: () => void Promise.all([lists.refetch(), postings.refetch()]),
    pools: lists.data ?? [],
    canManage: manage && !acting,
    selectedId: selected,
    onSelect: setSelected,
    members: { state: listState(members), rows: members.data?.members ?? [] },
    onCreate: (input) => write('POST', '/pools', input),
    onArchive: async (pool) => {
      await write('DELETE', `/pools/${enc(pool.id)}`);
      if (selected === pool.id) setSelected(null);
    },
    onRemove: (pool, candidateId) => write('DELETE', `/pools/${enc(pool.id)}/members/${enc(candidateId)}`),
    onOpenCandidate: (id) => router.push(`/yx/hiring/candidates/${enc(id)}`),
    postings: { state: listState(postings), jobs: postings.data ?? [] },
    canPost: perms.has('pipeline:manage') && !acting,
    onPosting: (job, p, action) => {
      const next = new Set(job.postings.filter((x) => x.status !== 'not posted' && x.status !== 'closed').map((x) => x.boardId));
      if (action === 'close') next.delete(p.boardId);
      else next.add(p.boardId);
      return apiWrite('PATCH', `/jobs/${enc(job.jobId)}`, { jobBoardIds: [...next] });
    },
    crm,
  };
  return <TalentCrmScreen live={live} />;
}
