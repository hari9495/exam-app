// HIR-20 Talent CRM: campaigns and sequences, the sequence builder, the engagement timeline and sourced profiles.
// One set of parts for the drawn stories and the live page (BUILD-STANDARD rule 1): the stories feed sample data, the
// live page feeds the API.
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { useToastIfAny } from '../../components/notify';
import { DataTable, type TableColumn } from '../../components/table';
import { Timeline, type TimelineItem } from '../../components/timeline';
import { Card } from '../../components/shell';
import { Text } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { ConsentBadges, SummaryTiles, type ConsentValue } from './hiring-kit';
import type { Channel } from './hiring-logic';
import type { SequenceStep } from './hiring-offers';
import type { Choice } from './live/types';

/* ------------------------------------------------------------------ sequence steps */

export function SequenceSteps({ steps }: { steps: SequenceStep[] }) {
  return (
    <ol className="yx-hire-seq" aria-label="Sequence steps">
      {steps.map((s, i) => (
        <li key={s.id} className="yx-hire-seq__step" data-kind={s.kind}>
          <Text size="sm" weight="semibold">
            Step {i + 1}
          </Text>
          <Text size="sm">{s.kind === 'wait' ? `Wait ${s.days} days` : `${s.channel === 'email' ? 'Email' : 'WhatsApp'}: ${s.template}`}</Text>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ campaigns */

export type CampaignStatus = 'draft' | 'running' | 'stopped' | 'done';
export interface CampaignView {
  id: string;
  name: string;
  channel: Channel;
  /** The pool it goes to. */
  audience: string;
  status: CampaignStatus;
  steps: SequenceStep[];
  stopOnReply: boolean;
  counts: { enrolled: number; replied: number; applied: number; optedOut: number };
}
export interface CampaignPerson {
  id: string;
  name: string;
  status: 'active' | 'done' | 'stopped';
  /** Why they stopped: replied, applied, opted_out, no_consent, hired, erased, campaign_stopped. */
  reason: string | null;
}
export interface EngagementView {
  name: string;
  email: ConsentValue;
  whatsapp: ConsentValue;
  items: TimelineItem[];
}

const STATUS: Record<CampaignStatus, [string, 'success' | 'neutral' | 'info' | 'warning']> = { draft: ['Draft', 'neutral'], running: ['Running', 'success'], stopped: ['Stopped', 'warning'], done: ['Finished', 'info'] };
export const STOP_TEXT: Record<string, string> = { replied: 'Replied', applied: 'Applied to a job', opted_out: 'Opted out', no_consent: 'Consent ended', hired: 'Hired', erased: 'Erased', campaign_stopped: 'Campaign stopped' };

export interface CampaignsPanelProps {
  state: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  campaigns: CampaignView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  people: { state: 'loading' | 'ready' | 'error'; rows: CampaignPerson[] };
  personId: string | null;
  onPerson: (id: string) => void;
  engagement: { state: 'loading' | 'ready' | 'error'; view: EngagementView | null };
  today: Date;
  /** candidate:manage, signed in as themselves: start, stop, mark a reply, new sequence. */
  canManage: boolean;
  onStart: (c: CampaignView) => Promise<unknown>;
  onStop: (c: CampaignView) => Promise<unknown>;
  onReplied: (c: CampaignView, personId: string) => Promise<unknown>;
  onNew: () => void;
}

export function CampaignsPanel(p: CampaignsPanelProps) {
  const toast = useToastIfAny();
  const [stopping, setStopping] = useState<CampaignView | null>(null);
  const [busy, setBusy] = useState(false);
  if (p.state === 'loading') return <Skeleton height={240} />;
  if (p.state === 'error') return <ErrorState title="Campaigns could not be loaded." onRetry={p.onRetry} />;
  if (p.campaigns.length === 0)
    return (
      <EmptyState
        title="No campaigns yet."
        description="A sequence sends your email or WhatsApp templates, step by step, to the people in a talent pool who agreed to hear from you."
        action={p.canManage ? <Button variant="primary" icon={Plus} onClick={p.onNew}>New sequence</Button> : undefined}
      />
    );
  const c = p.campaigns.find((x) => x.id === p.selectedId) ?? p.campaigns[0];
  const person = p.people.rows.find((r) => r.id === p.personId) ?? null;
  const fail = (title: string) => (e: unknown) => void toast?.toast({ tone: 'error', title, description: e instanceof Error ? e.message : 'Try again.' });
  const peopleCols: TableColumn<CampaignPerson>[] = [
    { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }) },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'active' ? 'Getting it' : r.status === 'done' ? 'All steps sent' : (STOP_TEXT[r.reason ?? ''] ?? 'Stopped')), statusTone: (v) => (v === 'Getting it' ? 'success' : v === 'All steps sent' ? 'info' : 'neutral') },
  ];
  return (
    <div className="yx-hire-stack">
      {p.campaigns.length > 1 && (
        <FormField id="crm-campaign" label="Campaign">
          <Select aria-label="Campaign" value={c.id} onChange={(v) => v && p.onSelect(v)} options={p.campaigns.map((x) => ({ value: x.id, label: x.name, description: `${STATUS[x.status][0]} · ${x.audience}` }))} />
        </FormField>
      )}
      <div className="yx-hire-cols">
        <Card
          title={`${c.name} · sequence`}
          actions={
            <>
              <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>
              {p.canManage && c.status === 'draft' && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy}
                  onClick={() => {
                    setBusy(true);
                    p.onStart(c).then(() => void toast?.toast({ tone: 'success', title: `${c.name} started`, description: 'The first step goes out in the next send window.' }), fail('Not started')).finally(() => setBusy(false));
                  }}
                >
                  Start
                </Button>
              )}
              {p.canManage && (c.status === 'running' || c.status === 'draft') && (
                <Button size="sm" onClick={() => setStopping(c)}>
                  Stop
                </Button>
              )}
            </>
          }
        >
          <div className="yx-hire-stack">
            <Text size="sm" tone="secondary">
              {c.channel === 'email' ? 'Email' : 'WhatsApp'} to {c.audience}
            </Text>
            <SequenceSteps steps={c.steps} />
            <SummaryTiles
              label="Sequence results"
              tiles={[
                { label: 'Enrolled', value: c.counts.enrolled },
                { label: 'Replied', value: c.counts.replied },
                { label: 'Applied', value: c.counts.applied },
                { label: 'Opted out', value: c.counts.optedOut },
              ]}
            />
            <DataTable
              label={`People in ${c.name}`}
              columns={peopleCols}
              rows={p.people.rows}
              getRowId={(r) => r.id}
              state={p.people.state}
              onRetry={p.onRetry}
              rowNoun={['person', 'people']}
              activeRowId={p.personId}
              onRowClick={(r) => p.onPerson(r.id)}
              empty={<EmptyState compact title={c.status === 'draft' ? 'Nobody enrolled yet.' : 'Nobody in this campaign.'} description={c.status === 'draft' ? 'Start the campaign to enrol the pool.' : undefined} />}
            />
          </div>
        </Card>
        <Card
          title={person ? `Engagement · ${person.name}` : 'Engagement'}
          actions={p.engagement.view ? <ConsentBadges email={p.engagement.view.email} whatsapp={p.engagement.view.whatsapp} /> : undefined}
        >
          {!person ? (
            <EmptyState compact title="Choose a person." description="Their messages, replies and opt-outs show here." />
          ) : p.engagement.state === 'loading' ? (
            <Skeleton height={120} />
          ) : p.engagement.state === 'error' ? (
            <ErrorState title="The engagement could not be loaded." onRetry={p.onRetry} />
          ) : (
            <div className="yx-hire-stack">
              {p.engagement.view?.items.length ? <Timeline items={p.engagement.view.items} today={p.today} aria-label="Engagement" /> : <EmptyState compact title="No messages yet." />}
              {p.canManage && c.stopOnReply && person.status === 'active' && (
                <div className="yx-hire-row">
                  <Text size="sm" tone="secondary">
                    Replied by email or phone? Record it and the sequence stops for them.
                  </Text>
                  <Button size="sm" onClick={() => p.onReplied(c, person.id).then(() => void toast?.toast({ tone: 'success', title: `${person.name} marked as replied`, description: 'No more steps go to them.' }), fail('Not recorded'))}>
                    Mark as replied
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
      {stopping && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setStopping(null)}
          title={`Stop ${stopping.name}?`}
          consequence="No more steps go to anyone in it. What was sent stays in each person's history. A stopped campaign cannot be started again."
          confirmLabel="Stop campaign"
          onConfirm={async () => {
            await p.onStop(stopping);
            toast?.toast({ tone: 'success', title: `${stopping.name} stopped` });
            setStopping(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ sequence builder */

export type DraftStep = { id: string; kind: 'message'; templateId: string | null } | { id: string; kind: 'wait'; days: number | null };
export interface SequenceDraft {
  name: string;
  channel: Channel;
  poolId: string;
  steps: ({ kind: 'message'; templateId: string } | { kind: 'wait'; days: number })[];
  stopOnReply: boolean;
  stopOnApply: boolean;
}
export interface AudienceCount {
  total: number;
  enrolled: number;
  skipped: { noConsent: number; optedOut: number; minor: number };
}
export interface SequenceBuilderProps {
  open: boolean;
  onClose: () => void;
  pools: Choice[];
  templates: { email: Choice[]; whatsapp: Choice[] };
  whatsappConnected: boolean;
  /** "9 am to 9 pm IST, at most 200 messages a day" (company settings). */
  sendRule: string;
  audience: (poolId: string, channel: Channel) => Promise<AudienceCount>;
  onSave: (d: SequenceDraft, start: boolean) => Promise<{ enrolled: number }>;
  /** Drawn states: the form as the story shows it. */
  initial?: { name?: string; channel?: Channel; poolId?: string; steps?: DraftStep[] };
}

let seq = 0;
const nid = () => `st-${++seq}`;

export function SequenceBuilderDrawer({ open, onClose, pools, templates, whatsappConnected, sendRule, audience, onSave, initial }: SequenceBuilderProps) {
  const toast = useToastIfAny();
  const [name, setName] = useState(initial?.name ?? '');
  const [channel, setChannel] = useState<Channel>(initial?.channel ?? 'email');
  const [poolId, setPoolId] = useState<string | null>(initial?.poolId ?? null);
  const [steps, setSteps] = useState<DraftStep[]>(initial?.steps ?? [{ id: nid(), kind: 'message', templateId: null }]);
  const [stopOnReply, setStopOnReply] = useState(true);
  const [stopOnApply, setStopOnApply] = useState(true);
  const [count, setCount] = useState<AudienceCount | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<null | 'draft' | 'start'>(null);
  const [startError, setStartError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setCount(null);
    if (poolId) audience(poolId, channel).then((c) => live && setCount(c), () => live && setCount(null));
    return () => {
      live = false;
    };
  }, [poolId, channel, audience]);
  const list = channel === 'email' ? templates.email : templates.whatsapp;
  const errors = {
    name: !name.trim() ? 'Enter the name.' : null,
    pool: !poolId ? 'Choose the talent pool it goes to.' : null,
    steps: steps.some((s) => (s.kind === 'message' ? !s.templateId || !list.some((t) => t.value === s.templateId) : !s.days || s.days < 1 || s.days > 60))
      ? 'Choose a template for every message, and wait 1 to 60 days.'
      : !steps.some((s) => s.kind === 'message')
        ? 'Add at least one message step.'
        : null,
  };
  const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
  const save = async (start: boolean) => {
    setTried(true);
    setStartError(null);
    const first = errors.name ? 'seq-name' : errors.pool ? 'seq-pool' : errors.steps ? 'seq-steps' : null;
    if (first) return focus(first);
    if (start && channel === 'whatsapp' && !whatsappConnected) {
      setStartError('WhatsApp is not connected. Save a draft, or send by email.');
      return focus('seq-channel');
    }
    if (start && count && count.enrolled === 0) {
      setStartError('Nobody in this pool can get it: no one has talent-pool consent and the channel opt-in.');
      return focus('seq-pool');
    }
    setBusy(start ? 'start' : 'draft');
    try {
      const r = await onSave({ name: name.trim(), channel, poolId: poolId!, steps: steps.map((s) => (s.kind === 'message' ? { kind: 'message' as const, templateId: s.templateId! } : { kind: 'wait' as const, days: s.days! })), stopOnReply, stopOnApply }, start);
      toast?.toast({ tone: 'success', title: start ? `${name.trim()} started for ${r.enrolled} people` : `${name.trim()} saved as a draft` });
      onClose();
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const setStep = (id: string, patch: Partial<DraftStep>) => setSteps((all) => all.map((s) => (s.id === id ? ({ ...s, ...patch } as DraftStep) : s)));
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="New nurture sequence"
      subtitle={poolId ? `Audience: ${pools.find((x) => x.value === poolId)?.label ?? ''}` : 'Choose the talent pool it goes to'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button loading={busy === 'draft'} onClick={() => void save(false)}>
            Save draft
          </Button>
          <Button variant="primary" loading={busy === 'start'} onClick={() => void save(true)}>
            Start for {count?.enrolled ?? 0} people
          </Button>
        </>
      }
    >
      <div className="yx-hire-sheet">
        <div className="yx-hire-sheet__form">
          {startError && <InlineAlert tone="danger">{startError}</InlineAlert>}
          <FormField id="seq-name" label="Name" required error={tried ? errors.name : null}>
            <TextField value={name} onChange={setName} maxLength={120} placeholder="For example: Java 2027 nurture" />
          </FormField>
          <FormField id="seq-pool" label="Audience" required error={tried ? errors.pool : null} helper="A talent pool: only people who agreed to be kept for other roles">
            <Select aria-label="Audience" value={poolId} onChange={setPoolId} options={pools} placeholder="Choose a talent pool" emptyText="No talent pools yet. Create one first." />
          </FormField>
          <FormField id="seq-channel" label="Channel" required>
            <RadioGroup
              aria-label="Channel"
              orientation="horizontal"
              value={channel}
              onChange={(v) => {
                setChannel(v as Channel);
                setSteps((all) => all.map((s) => (s.kind === 'message' ? { ...s, templateId: null } : s)));
              }}
              options={[
                { value: 'email', label: 'Email' },
                { value: 'whatsapp', label: whatsappConnected ? 'WhatsApp (approved templates)' : 'WhatsApp (not connected)' },
              ]}
            />
          </FormField>
          {channel === 'whatsapp' && !whatsappConnected && (
            <InlineAlert tone="warning" title="WhatsApp is not connected">
              Your company has no WhatsApp provider set up, so a WhatsApp sequence can be saved as a draft but not started.
            </InlineAlert>
          )}
          <FormField id="seq-steps" label="Steps" required error={tried ? errors.steps : null} helper={`Messages use your company's ${channel === 'email' ? 'email' : 'WhatsApp'} templates`}>
            <ol className="yx-hire-seq" aria-label="Sequence steps">
              {steps.map((s, i) => (
                <li key={s.id} className="yx-hire-seq__step yx-hire-row" data-kind={s.kind}>
                  <Text size="sm" weight="semibold">
                    Step {i + 1}
                  </Text>
                  {s.kind === 'message' ? (
                    <Select aria-label={`Step ${i + 1} template`} size="sm" value={s.templateId} onChange={(v) => setStep(s.id, { templateId: v })} options={list} placeholder="Choose a template" emptyText={`No ${channel === 'email' ? 'email' : 'WhatsApp'} templates yet.`} />
                  ) : (
                    <span className="yx-hire-row">
                      <Text size="sm">Wait</Text>
                      <NumberField aria-label={`Step ${i + 1} days`} value={s.days} onChange={(v) => setStep(s.id, { days: v })} min={1} max={60} />
                      <Text size="sm">days</Text>
                    </span>
                  )}
                  {steps.length > 1 && <IconButton size="sm" icon={Trash2} label={`Remove step ${i + 1}`} onClick={() => setSteps((all) => all.filter((x) => x.id !== s.id))} />}
                </li>
              ))}
              {steps.length < 10 && (
                <li className="yx-hire-row">
                  <Button size="sm" icon={Plus} onClick={() => setSteps((all) => [...all, { id: nid(), kind: 'message', templateId: null }])}>
                    Add message
                  </Button>
                  <Button size="sm" icon={Plus} onClick={() => setSteps((all) => [...all, { id: nid(), kind: 'wait', days: 7 }])}>
                    Add wait
                  </Button>
                </li>
              )}
            </ol>
          </FormField>
          <FormField label="Stop when the candidate" helper="Always stops on opt-out, consent withdrawn, hire and erasure">
            <div className="yx-hire-stack">
              <Checkbox label="Replies" checked={stopOnReply} onChange={setStopOnReply} />
              <Checkbox label="Applies to a job" checked={stopOnApply} onChange={setStopOnApply} />
            </div>
          </FormField>
        </div>
        <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="Audience">
          <Text weight="semibold">Who gets it</Text>
          {!poolId ? (
            <Text tone="secondary">Choose the talent pool.</Text>
          ) : !count ? (
            <Skeleton height={80} />
          ) : (
            <>
              <Text>
                {count.enrolled} of {count.total} enrolled
              </Text>
              <ul className="yx-hire-plainlist">
                <li>
                  {count.skipped.noConsent} without talent-pool consent or {channel === 'email' ? 'email' : 'WhatsApp'} opt-in
                </li>
                <li>{count.skipped.optedOut} opted out</li>
                <li>{count.skipped.minor} under 18, never enrolled</li>
              </ul>
            </>
          )}
          <Text size="sm" tone="secondary">
            Sent {sendRule}. Each step goes to a person once. Sourced profiles waiting for consent are never in a pool.
          </Text>
        </aside>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ sourced profiles */

export interface SourcedRow {
  id: string;
  name: string;
  headline: string | null;
  site: string;
  note: string;
  status: 'pending' | 'given';
  /** Days until it is erased without consent (null once given). */
  daysLeft: number | null;
  capturedBy: string | null;
  capturedAt: Date;
  candidateId: string | null;
}
export interface SourcedInput {
  name: string;
  email: string;
  headline: string | null;
  site: string;
  sourceNote: string;
}
export const SOURCED_SITES = ['LinkedIn', 'Naukri', 'GitHub', 'Referral', 'Event', 'Other'] as const;

export interface SourcedPanelProps {
  state: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  rows: SourcedRow[];
  keepDays: number;
  canManage: boolean;
  onAdd: (input: SourcedInput) => Promise<unknown>;
  onResend: (row: SourcedRow) => Promise<unknown>;
  onErase: (row: SourcedRow) => Promise<unknown>;
  onOpenCandidate: (candidateId: string) => void;
  /** Drawn state: the add dialog open. */
  addOpen?: boolean;
}

export function SourcedPanel(p: SourcedPanelProps) {
  const toast = useToastIfAny();
  const [adding, setAdding] = useState(p.addOpen ?? false);
  const [erasing, setErasing] = useState<SourcedRow | null>(null);
  const fail = (title: string) => (e: unknown) => void toast?.toast({ tone: 'error', title, description: e instanceof Error ? e.message : 'Try again.' });
  return (
    <div className="yx-hire-stack">
      <InlineAlert
        tone="info"
        actions={p.canManage ? <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add sourced profile</Button> : undefined}
      >
        A person you found outside YukthiX, with a note of where and why you may contact them. Only the consent email goes to them: until they agree they are not in search, pools or campaigns, and no AI scores them. With no consent in {p.keepDays} days they are erased.
      </InlineAlert>
      {p.state === 'loading' ? (
        <Skeleton height={160} />
      ) : p.state === 'error' ? (
        <ErrorState title="Sourced profiles could not be loaded." onRetry={p.onRetry} />
      ) : p.rows.length === 0 ? (
        <EmptyState title="No sourced profiles." description="Add a person you found on a job site, at an event or through a contact; they get one email asking for consent." />
      ) : (
        <ul className="yx-hire-list">
          {p.rows.map((c) => (
            <li key={c.id} className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <PersonLabel name={c.name} secondary={[c.headline, c.site].filter(Boolean).join(' · ')} />
                <Text size="sm" tone="secondary">
                  Added by {c.capturedBy ?? 'a recruiter'} on {formatDate(c.capturedAt)} · {c.note}
                </Text>
              </div>
              <Badge tone={c.status === 'given' ? 'success' : (c.daysLeft ?? 0) <= 5 ? 'warning' : 'neutral'}>{c.status === 'given' ? 'Consent given' : `Pending consent · erased in ${c.daysLeft} days`}</Badge>
              <div className="yx-hire-list__actions">
                {c.status === 'given' && c.candidateId ? (
                  <Button size="sm" onClick={() => p.onOpenCandidate(c.candidateId!)}>
                    Open candidate
                  </Button>
                ) : p.canManage ? (
                  <>
                    <Button size="sm" onClick={() => p.onResend(c).then(() => void toast?.toast({ tone: 'success', title: `Consent email sent again to ${c.name}` }), fail('Not sent'))}>
                      Send again
                    </Button>
                    <Button size="sm" onClick={() => setErasing(c)}>
                      Erase now
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddSourcedDialog keepDays={p.keepDays} onClose={() => setAdding(false)} onAdd={p.onAdd} />}
      {erasing && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setErasing(null)}
          title={`Erase ${erasing.name}?`}
          consequence="Their details are deleted now and the consent link stops working. This cannot be undone."
          confirmLabel="Erase"
          onConfirm={async () => {
            await p.onErase(erasing);
            toast?.toast({ tone: 'success', title: `${erasing.name} erased` });
            setErasing(null);
          }}
        />
      )}
    </div>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AddSourcedDialog({ keepDays, onClose, onAdd }: { keepDays: number; onClose: () => void; onAdd: (input: SourcedInput) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [v, setV] = useState({ name: '', email: '', headline: '', site: 'LinkedIn', note: '' });
  const [tried, setTried] = useState(false);
  const errors = {
    name: !v.name.trim() ? 'Enter the name.' : null,
    email: !EMAIL.test(v.email.trim()) ? 'Enter a valid email address.' : null,
    note: v.note.trim().length < 10 ? 'Say where you found them and why you may contact them (at least 10 characters).' : null,
  };
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a sourced profile"
      consequence={`They get one email with your talent-pool notice, asking to keep their details. Nothing else reaches them until they agree; with no answer in ${keepDays} days they are erased.`}
      confirmLabel="Add and send consent email"
      onConfirm={async () => {
        setTried(true);
        const first = errors.name ? 'src-name' : errors.email ? 'src-email' : errors.note ? 'src-note' : null;
        if (first) {
          setTimeout(() => document.getElementById(first)?.focus(), 0);
          return false;
        }
        await onAdd({ name: v.name.trim(), email: v.email.trim(), headline: v.headline.trim() || null, site: v.site, sourceNote: v.note.trim() });
        toast?.toast({ tone: 'success', title: `${v.name.trim()} added`, description: 'The consent email is on its way.' });
        onClose();
      }}
    >
      <FormField id="src-name" label="Name" required error={tried ? errors.name : null}>
        <TextField value={v.name} onChange={(name) => setV({ ...v, name })} maxLength={200} />
      </FormField>
      <FormField id="src-email" label="Email" required error={tried ? errors.email : null}>
        <TextField type="email" value={v.email} onChange={(email) => setV({ ...v, email })} maxLength={320} />
      </FormField>
      <FormField id="src-site" label="Found on" required>
        <Select aria-label="Found on" value={v.site} onChange={(site) => site && setV({ ...v, site })} options={SOURCED_SITES.map((s) => ({ value: s, label: s }))} />
      </FormField>
      <FormField id="src-headline" label="Headline" optional>
        <TextField value={v.headline} onChange={(headline) => setV({ ...v, headline })} maxLength={200} placeholder="For example: Data Engineer, Spark and Airflow" />
      </FormField>
      <FormField id="src-note" label="Lawful source" required error={tried ? errors.note : null} helper="Where the details were found and why contacting them is allowed">
        <TextArea value={v.note} onChange={(note) => setV({ ...v, note })} maxLength={500} rows={3} placeholder="For example: public LinkedIn profile, open to work; met at the Pune campus fair" />
      </FormField>
    </ConfirmDialog>
  );
}

/** Rows for the drawn sourced list. */
export const sourcedRowsOf = (captures: { id: string; name: string; site: string; headline: string; capturedBy: string; capturedAt: Date; consent: 'Pending' | 'Given' }[], today: Date, keepDays = 30): SourcedRow[] =>
  captures.map((c) => ({
    id: c.id,
    name: c.name,
    headline: c.headline,
    site: c.site,
    note: c.site === 'Naukri' ? 'Naukri résumé search, looking for a change' : 'Public profile, open to work',
    status: c.consent === 'Given' ? 'given' : 'pending',
    daysLeft: c.consent === 'Given' ? null : Math.max(0, keepDays - Math.round((today.getTime() - c.capturedAt.getTime()) / 86_400_000)),
    capturedBy: c.capturedBy,
    capturedAt: c.capturedAt,
    candidateId: c.consent === 'Given' ? c.id : null,
  }));

