import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileSignature, Link2, Plus, Share2, Truck } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { MultiSelect, Select } from '../../components/select';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { when } from './desk-kit';
import type { ActionLinkView, BranchView, ChannelLinkView, ChatPrompt, ChatQueue, DocTemplate, DocumentsView, HrSummary, JourneySetup, LifecycleSetup, LifecycleTransition, LifecycleView, RecurringView, RequestDocument, SequenceDef, SequenceRunView, TicketShare } from './esm2-types';

// Service Desk 3b-2 batch 2 screens (plain simple English; single choices use the joined Segment; nothing is checked
// while typing, only when saving): the ticket rail (HR summary, move and share, documents, follow-up messages), the
// person's documents to sign, the approval link page, linked chat apps, and the desk set-up tabs (lifecycles,
// schedules and sequences, live chat queues, desk organisation and joiner / leaver journeys).

const Rows = ({ rows }: { rows: [string, string | null | undefined][] }) => (
  <dl className="yx-esm-summary">
    {rows
      .filter(([, v]) => v)
      .map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
  </dl>
);
const Problem = ({ error }: { error: string | null }) => (error ? <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert> : null);

// ---------------------------------------------------------------------------------------------- ticket rail

export interface TicketEsmRailProps {
  canWork: boolean;
  canMove: boolean;
  hr: HrSummary | null | undefined;
  desks: { id: string; name: string }[];
  currentDeskId: string;
  shares: TicketShare[];
  categories: (deskId: string) => { id: string; name: string; sensitive: boolean }[];
  sensitive: boolean;
  onMove: (input: { deskId: string; categoryId?: string; reason: string }) => Promise<unknown>;
  onShare: (deskId: string, level: 'view' | 'comment') => Promise<unknown>;
  onUnshare: (deskId: string) => Promise<unknown>;
  documents: DocumentsView | null | undefined;
  onMakeDocument: (templateId: string) => Promise<unknown>;
  onWithdrawDocument: (doc: RequestDocument) => Promise<unknown>;
  sequences: SequenceDef[];
  runs: SequenceRunView[];
  onStartSequence: (sequenceId: string) => Promise<unknown>;
  onStopSequence: (run: SequenceRunView) => Promise<unknown>;
}

export function TicketEsmRail(p: TicketEsmRailProps) {
  return (
    <>
      {p.hr && <HrSummaryCard hr={p.hr} />}
      {p.canMove && <MoveShareCard {...p} />}
      {p.documents && <DocumentsCard {...p} documents={p.documents} />}
      {p.canWork && <SequencesCard {...p} />}
    </>
  );
}

export function HrSummaryCard({ hr }: { hr: HrSummary }) {
  return (
    <Card title="Employee summary">
      {hr.source === 'none' ? (
        <p className="yx-chat__meta">No HR record for this person.</p>
      ) : (
        <div className="yx-ops-stack" data-gap="sm">
          <Rows rows={[['Name', hr.name], ['Designation', hr.designation], [hr.source === 'people_list' ? 'Team' : 'Department', hr.department], ['Location', hr.location], ['Manager', hr.manager], ['Employee code', hr.internal?.employeeCode], ['Joined', hr.internal ? `${hr.internal.joinedOn} (${hr.internal.tenure})` : null], ['Grade', hr.internal?.grade], ['Employment', hr.internal?.employmentType]]} />
          {!hr.internal && hr.source === 'hr' && <p className="yx-chat__meta">Code, joining date and grade show only to people whose HR access covers this person.</p>}
        </div>
      )}
    </Card>
  );
}

function MoveShareCard(p: TicketEsmRailProps) {
  const [mode, setMode] = useState<'move' | 'share'>('share');
  const [deskId, setDeskId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [level, setLevel] = useState<'view' | 'comment'>('view');
  const { busy, error, run } = useRun();
  const others = p.desks.filter((d) => d.id !== p.currentDeskId);
  const cats = deskId ? p.categories(deskId).filter((c) => !p.sensitive || c.sensitive) : [];
  return (
    <Card title="Another desk">
      <div className="yx-ops-stack" data-gap="sm">
        {p.shares.length > 0 && (
          <ul className="yx-esm-runs">
            {p.shares.map((s) => (
              <li key={s.deskId} className="yx-ops-row" data-between>
                <span>
                  Shared with {s.desk} ({s.level === 'view' ? 'can view' : 'can add notes'})
                </span>
                <Button size="sm" loading={busy === s.deskId} onClick={() => void run(s.deskId, () => p.onUnshare(s.deskId))}>
                  Stop sharing
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Segment label="What to do" value={mode} onChange={setMode} options={[{ value: 'share', label: 'Share' }, { value: 'move', label: 'Move' }]} />
        <FormField label="Desk" required>
          <Select value={deskId} onChange={setDeskId} options={others.map((d) => ({ value: d.id, label: d.name }))} />
        </FormField>
        {mode === 'share' ? (
          <>
            <Segment label="They can" value={level} onChange={setLevel} options={[{ value: 'view', label: 'View' }, { value: 'comment', label: 'Add notes' }]} />
            {p.sensitive && <p className="yx-chat__meta">A sensitive or private ticket is never shared. Move it instead.</p>}
          </>
        ) : (
          <>
            <FormField label="Category there" required={p.sensitive} optional={!p.sensitive} helper={p.sensitive ? 'This ticket is sensitive: it goes only into a sensitive category.' : undefined}>
              <Select value={categoryId} onChange={setCategoryId} options={cats.map((c) => ({ value: c.id, label: c.name }))} />
            </FormField>
            <FormField label="Why" required>
              <TextField value={reason} onChange={setReason} maxLength={500} />
            </FormField>
          </>
        )}
        <Problem error={error} />
        <div className="yx-ops-row">
          {mode === 'share' ? (
            <Button icon={Share2} disabled={!deskId} loading={busy === 'share'} onClick={() => void run('share', () => p.onShare(deskId!, level))}>
              Share
            </Button>
          ) : (
            <Button icon={Truck} disabled={!deskId || reason.trim().length < 3} loading={busy === 'move'} onClick={() => void run('move', () => p.onMove({ deskId: deskId!, ...(categoryId ? { categoryId } : {}), reason: reason.trim() }))}>
              Move ticket
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

const DOC_STATE: Record<RequestDocument['status'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' | 'info' }> = {
  issued: { label: 'Sent', tone: 'info' },
  pending: { label: 'Waiting for a signature', tone: 'warning' },
  signed: { label: 'Signed', tone: 'success' },
  declined: { label: 'Not signed', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

function DocumentsCard(p: TicketEsmRailProps & { documents: DocumentsView }) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  return (
    <Card title="Documents">
      <div className="yx-ops-stack" data-gap="sm">
        {p.documents.documents.length === 0 ? (
          <span className="yx-chat__meta">No documents yet.</span>
        ) : (
          <ul className="yx-esm-runs">
            {p.documents.documents.map((d) => (
              <li key={d.id} className="yx-ops-stack" data-gap="sm">
                <span className="yx-ops-row" data-between>
                  <strong>{d.title}</strong>
                  <Badge tone={DOC_STATE[d.status].tone}>{DOC_STATE[d.status].label}</Badge>
                </span>
                {d.signedAt && <span className="yx-chat__meta">Signed {when(d.signedAt)}. The signed copy is in the files.</span>}
                {d.status === 'pending' && p.canWork && (
                  <Button size="sm" loading={busy === d.id} onClick={() => void run(d.id, () => p.onWithdrawDocument(d))}>
                    Withdraw
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {p.canWork && p.documents.templates.length > 0 && (
          <>
            <FormField label="Make a document">
              <Select value={templateId} onChange={setTemplateId} options={p.documents.templates.map((t) => ({ value: t.id, label: t.name, description: t.needsSignature ? 'Needs a signature' : 'For information' }))} />
            </FormField>
            <Problem error={error} />
            <div className="yx-ops-row">
              <Button icon={FileSignature} disabled={!templateId} loading={busy === 'make'} onClick={() => void run('make', () => p.onMakeDocument(templateId!))}>
                Make and send
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function SequencesCard(p: TicketEsmRailProps) {
  const [sequenceId, setSequenceId] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  if (!p.sequences.length && !p.runs.length) return null;
  return (
    <Card title="Follow-up messages">
      <div className="yx-ops-stack" data-gap="sm">
        {p.runs.map((r) => (
          <div key={r.id} className="yx-ops-row" data-between>
            <span>
              {r.sequence}: {r.state === 'running' ? `next ${when(r.nextAt)}` : r.state === 'done' ? 'all sent' : `stopped (${r.stopReason})`}
            </span>
            {r.state === 'running' && (
              <Button size="sm" loading={busy === r.id} onClick={() => void run(r.id, () => p.onStopSequence(r))}>
                Stop
              </Button>
            )}
          </div>
        ))}
        {p.sequences.length > 0 && (
          <>
            <FormField label="Start a sequence" helper="It stops by itself when the requester replies or the ticket is resolved.">
              <Select value={sequenceId} onChange={setSequenceId} options={p.sequences.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name, description: `${s.steps.length} message${s.steps.length > 1 ? 's' : ''}` }))} />
            </FormField>
            <Problem error={error} />
            <div className="yx-ops-row">
              <Button disabled={!sequenceId} loading={busy === 'start'} onClick={() => void run('start', () => p.onStartSequence(sequenceId!))}>
                Start
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- the requester signs

/**
 * The person's documents to sign. Founder decision 9 Oct 2026: signing also needs a one-time code, sent to the person's
 * sign-in email when they ask for it (P05). Nothing is checked while typing; the buttons say what is still missing.
 */
export function MyDocumentsCard({
  documents,
  onSendCode,
  onSign,
  onDecline,
}: {
  documents: RequestDocument[];
  onSendCode: (doc: RequestDocument) => Promise<{ to: string; minutes: number }>;
  onSign: (doc: RequestDocument, typedName: string, code: string) => Promise<unknown>;
  onDecline: (doc: RequestDocument, reason: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ to: string; minutes: number } | null>(null);
  const [mode, setMode] = useState<'sign' | 'decline'>('sign');
  const { busy, error, run } = useRun();
  if (!documents.length) return null;
  const close = () => {
    setOpen(null);
    setSent(null);
    setCode('');
  };
  return (
    <Card title="Documents">
      <ul className="yx-esm-runs">
        {documents.map((d) => (
          <li key={d.id} className="yx-ops-stack" data-gap="sm">
            <span className="yx-ops-row" data-between>
              <strong>{d.title}</strong>
              <Badge tone={DOC_STATE[d.status].tone}>{d.needsMe ? 'Waiting for your signature' : DOC_STATE[d.status].label}</Badge>
            </span>
            {d.needsMe && open !== d.id && (
              <div className="yx-ops-row">
                <Button variant="primary" icon={FileSignature} onClick={() => setOpen(d.id)}>
                  Read and sign
                </Button>
              </div>
            )}
            {open === d.id && (
              <div className="yx-ops-stack" data-gap="sm">
                <pre className="yx-doc-text">{d.text}</pre>
                <Segment label="Your answer" value={mode} onChange={setMode} options={[{ value: 'sign', label: 'Sign' }, { value: 'decline', label: 'Do not sign' }]} />
                {mode === 'sign' ? (
                  <>
                    <FormField label="Type your full name" required helper="As it appears on the document.">
                      <TextField value={name} onChange={setName} maxLength={150} />
                    </FormField>
                    <Checkbox checked={agree} onChange={setAgree} label="I have read this document and I sign it." />
                    {sent ? (
                      <>
                        <InlineAlert tone="info">{`We sent a 6-digit code to ${sent.to}. It works for ${sent.minutes} minutes.`}</InlineAlert>
                        <FormField label="6-digit code" required helper="From the email we just sent you.">
                          <TextField value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} maxLength={6} />
                        </FormField>
                      </>
                    ) : (
                      <p className="yx-chat__meta">To sign, we first send a one-time code to your email.</p>
                    )}
                  </>
                ) : (
                  <FormField label="Why not?" required>
                    <TextField value={reason} onChange={setReason} maxLength={500} />
                  </FormField>
                )}
                <Problem error={error} />
                <div className="yx-ops-row">
                  {mode === 'sign' && !sent ? (
                    <Button variant="primary" disabled={!agree || !name.trim()} loading={busy === `code-${d.id}`} onClick={() => void run(`code-${d.id}`, async () => setSent(await onSendCode(d)))}>
                      Send me a code
                    </Button>
                  ) : (
                    <Button
                      variant={mode === 'sign' ? 'primary' : 'danger'}
                      disabled={mode === 'sign' ? !agree || !name.trim() || code.length !== 6 : !reason.trim()}
                      loading={busy === d.id}
                      onClick={() =>
                        void run(d.id, async () => {
                          await (mode === 'sign' ? onSign(d, name.trim(), code) : onDecline(d, reason.trim()));
                          close();
                        })
                      }
                    >
                      {mode === 'sign' ? 'Sign' : 'Send my answer'}
                    </Button>
                  )}
                  {mode === 'sign' && sent && (
                    <Button loading={busy === `code-${d.id}`} onClick={() => void run(`code-${d.id}`, async () => setSent(await onSendCode(d)))}>
                      Send a new code
                    </Button>
                  )}
                  <Button onClick={close}>Cancel</Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- approval link and linked apps

export function ActionLinkScreen({ view, error, onDecide, done, onSignIn }: { view: ActionLinkView | null; error: string | null; done: string | null; onDecide: (decision: 'approve' | 'reject', reason: string) => Promise<unknown>; onSignIn: () => void }) {
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const { busy, error: failed, run } = useRun();
  return (
    <main className="yx-auth__page yx-desk yx-act">
      <Card title={view?.title ?? 'Approval'}>
        <div className="yx-ops-stack">
          {error && <InlineAlert tone="warning">{error}</InlineAlert>}
          {done && (
            <InlineAlert tone="success" title="Done">
              {done}
            </InlineAlert>
          )}
          {view && !done && view.state === 'sign_in' && (
            <>
              <p>Sign in to YukthiX to see and decide this approval.</p>
              <div className="yx-ops-row">
                <Button variant="primary" onClick={onSignIn}>
                  Sign in
                </Button>
              </div>
            </>
          )}
          {view && !done && view.state === 'closed' && <InlineAlert tone="info">This approval is already closed.</InlineAlert>}
          {view && !done && view.state === 'open' && (
            <>
              <Rows rows={view.summary.map((s) => [s.label, s.value])} />
              <p className="yx-chat__meta">This link works once, until {when(view.expiresAt)}.</p>
              {rejecting && (
                <FormField label="Why are you not approving it?" required>
                  <TextArea rows={2} value={reason} onChange={setReason} maxLength={1000} />
                </FormField>
              )}
              <Problem error={failed} />
              <div className="yx-ops-row">
                {!rejecting ? (
                  <>
                    <Button variant="approve" icon={CheckCircle2} loading={busy === 'approve'} onClick={() => void run('approve', () => onDecide('approve', ''))}>
                      Approve
                    </Button>
                    <Button onClick={() => setRejecting(true)}>Not approve</Button>
                  </>
                ) : (
                  <>
                    <Button variant="danger" disabled={!reason.trim()} loading={busy === 'reject'} onClick={() => void run('reject', () => onDecide('reject', reason.trim()))}>
                      Send: not approved
                    </Button>
                    <Button onClick={() => setRejecting(false)}>Back</Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}

const PROVIDER = { teams: 'Microsoft Teams', slack: 'Slack', push: 'Phone (push)' } as const;

/** US-E-282: where approval cards go. Teams and Slack link from their apps in production; the demo lets you type an id. */
export function ChannelLinksCard({ links, sent, onAdd, onRemove }: { links: ChannelLinkView | null | undefined; sent?: { provider: string; at: string; title: string; url: string | null }[] | null; onAdd: (provider: 'teams' | 'slack', externalRef: string) => Promise<unknown>; onRemove: (id: string) => Promise<unknown> }) {
  const [provider, setProvider] = useState<'teams' | 'slack'>('teams');
  const [ref, setRef] = useState('');
  const { busy, error, run } = useRun();
  if (!links) return null;
  return (
    <Card title="Approve from chat apps">
      <div className="yx-ops-stack" data-gap="sm">
        {links.links.length === 0 ? (
          <span className="yx-chat__meta">No apps linked. Approvals reach you here and by email.</span>
        ) : (
          <ul className="yx-esm-runs">
            {links.links.map((l) => (
              <li key={l.id} className="yx-ops-row" data-between>
                <span>{PROVIDER[l.provider]}</span>
                <Button size="sm" loading={busy === l.id} onClick={() => void run(l.id, () => onRemove(l.id))}>
                  Unlink
                </Button>
              </li>
            ))}
          </ul>
        )}
        {links.typedLinksAllowed && (
          <>
            <Segment label="App" value={provider} onChange={setProvider} options={[{ value: 'teams', label: 'Teams' }, { value: 'slack', label: 'Slack' }]} />
            <FormField label="Your account in that app" helper="Demo only. In production you link from the YukthiX app inside Teams or Slack.">
              <TextField value={ref} onChange={setRef} maxLength={200} />
            </FormField>
            <Problem error={error} />
            <div className="yx-ops-row">
              <Button icon={Link2} disabled={ref.trim().length < 3} loading={busy === 'add'} onClick={() => void run('add', async () => {
                await onAdd(provider, ref.trim());
                setRef('');
              })}>
                Link
              </Button>
            </div>
          </>
        )}
        {sent && sent.length > 0 && (
          <>
            <strong>Cards sent to your linked apps (demo)</strong>
            <ul className="yx-esm-runs">
              {sent.map((c, i) => (
                <li key={i} className="yx-ops-row" data-between>
                  <span>
                    {PROVIDER[c.provider as keyof typeof PROVIDER] ?? c.provider}: {c.title} · {when(c.at)}
                  </span>
                  {c.url && (
                    <a className="yx-link" href={c.url}>
                      Open to decide
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- set-up: lifecycles (SD-2.11)

export interface LifecycleAdminProps {
  setup: LifecycleSetup | null | undefined;
  onCreate: (input: { ticketTypeId: string; name: string }) => Promise<unknown>;
  onSave: (lc: LifecycleView, draft: LifecycleView['draft']) => Promise<unknown>;
  onCheck: (lc: LifecycleView) => Promise<{ ok: boolean; problem: string | null }>;
  onPublish: (lc: LifecycleView) => Promise<unknown>;
  onRetire: (lc: LifecycleView) => Promise<unknown>;
}

/** The designer: statuses as rows and columns; a ticked cell is an allowed move, with what it needs and who makes it. */
export function LifecycleAdmin(p: LifecycleAdminProps) {
  const [typeId, setTypeId] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const [check, setCheck] = useState<{ ok: boolean; problem: string | null } | null>(null);
  const setup = p.setup;
  const lc = setup?.lifecycles.find((l) => l.ticketTypeId === typeId) ?? null;
  const [draft, setDraft] = useState<LifecycleView['draft']>({});
  const [focus, setFocus] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    setDraft(lc?.draft ?? {});
    setCheck(null);
  }, [lc?.id, lc?.version]);
  useEffect(() => {
    if (!typeId && setup?.types.length) setTypeId(setup.types[0].id);
  }, [setup, typeId]);
  if (!setup) return null;
  const statuses = setup.statuses.filter((s) => !s.ticketTypeId || s.ticketTypeId === typeId);
  const used = draft.statusIds ?? [];
  const moves = draft.transitions ?? [];
  const move = (from: string, to: string) => moves.find((m) => m.from === from && m.to === to);
  const setMove = (from: string, to: string, change: Partial<LifecycleTransition> | null) =>
    setDraft({ ...draft, transitions: change === null ? moves.filter((m) => !(m.from === from && m.to === to)) : move(from, to) ? moves.map((m) => (m.from === from && m.to === to ? { ...m, ...change } : m)) : [...moves, { from, to, require: [], who: 'agent', ...change }] });
  const label = (id: string) => statuses.find((s) => s.id === id)?.label ?? '';
  const f = focus ? move(focus.from, focus.to) : null;
  return (
    <div className="yx-ops-stack">
      <Card title="Ticket lifecycles" actions={<Select aria-label="Ticket type" value={typeId} onChange={setTypeId} options={setup.types.map((t) => ({ value: t.id, label: t.name }))} />}>
        <div className="yx-ops-stack">
          <p className="yx-chat__meta">A lifecycle sets which status a ticket of this type may move to next, what must be filled first and who may do it. Tickets keep the version they started with.</p>
          <Problem error={error} />
          {!lc ? (
            <div className="yx-ops-row">
              <Button icon={Plus} loading={busy === 'new'} onClick={() => void run('new', () => p.onCreate({ ticketTypeId: typeId!, name: `${setup.types.find((t) => t.id === typeId)?.name ?? 'Ticket'} lifecycle` }))}>
                Design a lifecycle for this type
              </Button>
            </div>
          ) : (
            <>
              <div className="yx-ops-row">
                <Badge tone={lc.state === 'active' ? 'success' : 'neutral'}>{lc.state === 'active' ? `In use: version ${lc.currentVersion}` : lc.state === 'retired' ? 'Not in use' : 'Draft'}</Badge>
              </div>
              <FormField label="Statuses it uses">
                <MultiSelect value={used} onChange={(v) => setDraft({ ...draft, statusIds: v, transitions: moves.filter((m) => v.includes(m.from) && v.includes(m.to)) })} options={statuses.map((s) => ({ value: s.id, label: s.label }))} />
              </FormField>
              <FormField label="A new ticket starts in">
                <Select value={draft.startStatusId ?? null} onChange={(v) => setDraft({ ...draft, startStatusId: v ?? undefined })} options={statuses.filter((s) => used.includes(s.id) && s.systemState === 'new').map((s) => ({ value: s.id, label: s.label }))} />
              </FormField>
              {used.length > 1 && (
                <div className="yx-lc-grid" role="table" aria-label="Allowed moves">
                  <div role="row" className="yx-lc-grid__row">
                    <span role="columnheader">From \ to</span>
                    {used.map((to) => (
                      <span role="columnheader" key={to}>
                        {label(to)}
                      </span>
                    ))}
                  </div>
                  {used.map((from) => (
                    <div role="row" className="yx-lc-grid__row" key={from}>
                      <span role="rowheader">{label(from)}</span>
                      {used.map((to) => (
                        <span role="cell" key={to}>
                          {from !== to && (
                            <Checkbox
                              aria-label={`${label(from)} to ${label(to)}`}
                              checked={Boolean(move(from, to))}
                              onChange={(on) => {
                                setMove(from, to, on ? {} : null);
                                setFocus(on ? { from, to } : null);
                              }}
                            />
                          )}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {focus && f && (
                <div className="yx-esm-field-editor">
                  <strong>
                    {label(focus.from)} → {label(focus.to)}
                  </strong>
                  <FormField label="Fill in first" optional>
                    <MultiSelect value={f.require ?? []} onChange={(v) => setMove(focus.from, focus.to, { require: v })} options={setup.requirable.map((r) => ({ value: r.key, label: r.label }))} />
                  </FormField>
                  <Segment label="Who may make this move" value={f.who ?? 'agent'} onChange={(v) => setMove(focus.from, focus.to, { who: v })} options={[{ value: 'agent', label: 'Any agent' }, { value: 'lead', label: 'Team leads only' }]} />
                </div>
              )}
              {moves.length > 0 && (
                <ul className="yx-esm-runs" aria-label="Moves">
                  {moves.map((m) => (
                    <li key={`${m.from}>${m.to}`} className="yx-ops-row" data-between>
                      <button type="button" className="yx-chat__pick" onClick={() => setFocus({ from: m.from, to: m.to })}>
                        {label(m.from)} → {label(m.to)}
                        {m.require?.length ? ` · needs ${m.require.map((r) => setup.requirable.find((x) => x.key === r)?.label).join(', ')}` : ''}
                        {m.who === 'lead' ? ' · leads only' : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {check && (check.ok ? <InlineAlert tone="success">This lifecycle is ready to use.</InlineAlert> : <InlineAlert tone="warning">{check.problem}</InlineAlert>)}
              <div className="yx-ops-row">
                <Button loading={busy === 'save'} onClick={() => void run('save', () => p.onSave(lc, draft))}>
                  Save draft
                </Button>
                <Button loading={busy === 'check'} onClick={() => void run('check', async () => setCheck(await p.onCheck(lc)))}>
                  Check
                </Button>
                <Button variant="primary" loading={busy === 'publish'} onClick={() => void run('publish', () => p.onPublish(lc))}>
                  Publish
                </Button>
                {lc.state === 'active' && (
                  <Button loading={busy === 'retire'} onClick={() => void run('retire', () => p.onRetire(lc))}>
                    Stop using
                  </Button>
                )}
              </div>
              <p className="yx-chat__meta">Save the draft before you check or publish it.</p>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- set-up: schedules and sequences (SD-2.13)

const WEEKDAYS = [
  { value: 'MO', label: 'Monday' },
  { value: 'TU', label: 'Tuesday' },
  { value: 'WE', label: 'Wednesday' },
  { value: 'TH', label: 'Thursday' },
  { value: 'FR', label: 'Friday' },
  { value: 'SA', label: 'Saturday' },
  { value: 'SU', label: 'Sunday' },
];

export interface SchedulesAdminProps {
  timeZone: string;
  groups: { id: string; name: string }[];
  recurring: RecurringView[];
  sequences: SequenceDef[];
  onCreate: (input: { name: string; rrule: string; timeZone: string; startsAt: string; template: { subject: string; bodyHtml: string; groupId?: string } }) => Promise<unknown>;
  onState: (r: RecurringView, state: RecurringView['state']) => Promise<unknown>;
  onSaveSequence: (s: SequenceDef | null, input: { name: string; steps: { afterHours: number; bodyHtml: string }[]; active?: boolean }) => Promise<unknown>;
}

export function SchedulesAdmin(p: SchedulesAdminProps) {
  const [name, setName] = useState('');
  const [freq, setFreq] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [day, setDay] = useState<string | null>('MO');
  const [nth, setNth] = useState<'1' | 'last' | 'date'>('1');
  const [monthDay, setMonthDay] = useState<number | null>(1);
  const [time, setTime] = useState('10:00');
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [seqName, setSeqName] = useState('');
  const [steps, setSteps] = useState<{ afterHours: number | null; text: string }[]>([{ afterHours: 24, text: '' }]);
  const { busy, error, run } = useRun();
  const rule = useMemo(() => {
    if (freq === 'DAILY') return 'FREQ=DAILY';
    if (freq === 'WEEKLY') return `FREQ=WEEKLY;BYDAY=${day ?? 'MO'}`;
    if (freq === 'YEARLY') return 'FREQ=YEARLY';
    return nth === 'date' ? `FREQ=MONTHLY;BYMONTHDAY=${monthDay ?? 1}` : `FREQ=MONTHLY;BYDAY=${nth === 'last' ? '-1' : '1'}${day ?? 'MO'}`;
  }, [freq, day, nth, monthDay]);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    <div className="yx-ops-stack">
      <Problem error={error} />
      <Card title="Repeating tickets">
        <div className="yx-ops-stack">
          {p.recurring.length === 0 ? (
            <EmptyState compact title="Nothing repeats yet." />
          ) : (
            <ul className="yx-esm-rules">
              {p.recurring.map((r) => (
                <li key={r.id} className="yx-ops-stack" data-gap="sm">
                  <span className="yx-ops-row" data-between>
                    <strong>{r.name}</strong>
                    <Badge tone={r.state === 'active' ? 'success' : r.state === 'paused' ? 'warning' : 'neutral'}>{r.state === 'active' ? 'On' : r.state === 'paused' ? 'Paused' : 'Ended'}</Badge>
                  </span>
                  <span className="yx-chat__meta">{r.state === 'active' && r.nextRunAt ? `Next: ${when(r.nextRunAt, r.timeZone)}` : 'No next run'}</span>
                  {r.runs.length > 0 && (
                    <span className="yx-ops-row">
                      {r.runs.slice(0, 5).map((x) => (
                        <Badge key={x.dueAt} tone={x.missed ? 'danger' : x.late ? 'warning' : 'neutral'}>
                          {when(x.dueAt, r.timeZone)}
                          {x.missed ? ' · missed' : x.late ? ' · made late' : ''}
                        </Badge>
                      ))}
                    </span>
                  )}
                  {r.state !== 'ended' && (
                    <span className="yx-ops-row">
                      <Button size="sm" loading={busy === r.id} onClick={() => void run(r.id, () => p.onState(r, r.state === 'active' ? 'paused' : 'active'))}>
                        {r.state === 'active' ? 'Pause' : 'Resume'}
                      </Button>
                      <Button size="sm" loading={busy === `e${r.id}`} onClick={() => void run(`e${r.id}`, () => p.onState(r, 'ended'))}>
                        End
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <strong>New repeating ticket</strong>
          <FormField label="Name" required>
            <TextField value={name} onChange={setName} maxLength={100} />
          </FormField>
          <Segment label="How often" value={freq} onChange={setFreq} options={[{ value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' }, { value: 'YEARLY', label: 'Yearly' }]} />
          {freq === 'MONTHLY' && <Segment label="Which day of the month" value={nth} onChange={setNth} options={[{ value: '1', label: 'First weekday' }, { value: 'last', label: 'Last weekday' }, { value: 'date', label: 'A date' }]} />}
          {(freq === 'WEEKLY' || (freq === 'MONTHLY' && nth !== 'date')) && (
            <FormField label="Weekday">
              <Select value={day} onChange={setDay} options={WEEKDAYS} />
            </FormField>
          )}
          {freq === 'MONTHLY' && nth === 'date' && (
            <FormField label="Day of the month" helper="Months without this day are skipped.">
              <NumberField value={monthDay} onChange={setMonthDay} min={1} max={31} />
            </FormField>
          )}
          <div className="yx-ops-row">
            <FormField label="Starts on">
              <TextField type="date" value={start} onChange={setStart} />
            </FormField>
            <FormField label={`At (${p.timeZone})`}>
              <TextField type="time" value={time} onChange={setTime} />
            </FormField>
          </div>
          <FormField label="Ticket subject" required>
            <TextField value={subject} onChange={setSubject} maxLength={200} />
          </FormField>
          <FormField label="What to do" required>
            <TextArea rows={3} value={body} onChange={setBody} />
          </FormField>
          <FormField label="Team" optional>
            <Select value={groupId} onChange={setGroupId} clearable options={p.groups.map((g) => ({ value: g.id, label: g.name }))} />
          </FormField>
          <div className="yx-ops-row">
            <Button
              variant="primary"
              disabled={!name.trim() || !subject.trim() || !body.trim()}
              loading={busy === 'create'}
              onClick={() =>
                void run('create', async () => {
                  const offset = zoneOffset(p.timeZone, `${start}T${time}:00`);
                  await p.onCreate({ name: name.trim(), rrule: rule, timeZone: p.timeZone, startsAt: new Date(Date.parse(`${start}T${time}:00Z`) - offset).toISOString(), template: { subject: subject.trim(), bodyHtml: `<p>${esc(body.trim())}</p>`, ...(groupId ? { groupId } : {}) } });
                  setName('');
                  setSubject('');
                  setBody('');
                })
              }
            >
              Save
            </Button>
          </div>
        </div>
      </Card>
      <Card title="Follow-up message sequences">
        <div className="yx-ops-stack">
          {p.sequences.map((s) => (
            <div key={s.id} className="yx-ops-row" data-between>
              <span>
                <strong>{s.name}</strong> · {s.steps.map((x) => `after ${x.afterHours} h`).join(', ')}
              </span>
              <Button size="sm" loading={busy === s.id} onClick={() => void run(s.id, () => p.onSaveSequence(s, { name: s.name, steps: s.steps, active: !s.active }))}>
                {s.active ? 'Switch off' : 'Switch on'}
              </Button>
            </div>
          ))}
          <strong>New sequence</strong>
          <FormField label="Name" required>
            <TextField value={seqName} onChange={setSeqName} maxLength={100} />
          </FormField>
          {steps.map((s, i) => (
            <div key={i} className="yx-esm-field-editor">
              <FormField label={`Message ${i + 1}: send after (hours)`}>
                <NumberField value={s.afterHours} onChange={(v) => setSteps(steps.map((x, j) => (j === i ? { ...x, afterHours: v } : x)))} min={1} max={720} />
              </FormField>
              <FormField label="Message">
                <TextArea rows={2} value={s.text} onChange={(v) => setSteps(steps.map((x, j) => (j === i ? { ...x, text: v } : x)))} />
              </FormField>
            </div>
          ))}
          <div className="yx-ops-row">
            {steps.length < 10 && (
              <Button icon={Plus} onClick={() => setSteps([...steps, { afterHours: 48, text: '' }])}>
                Add a message
              </Button>
            )}
            <Button
              variant="primary"
              disabled={!seqName.trim() || steps.some((s) => !s.text.trim() || !s.afterHours)}
              loading={busy === 'seq'}
              onClick={() =>
                void run('seq', async () => {
                  await p.onSaveSequence(null, { name: seqName.trim(), steps: steps.map((s) => ({ afterHours: s.afterHours!, bodyHtml: `<p>${esc(s.text.trim())}</p>` })) });
                  setSeqName('');
                  setSteps([{ afterHours: 24, text: '' }]);
                })
              }
            >
              Save sequence
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** How far a time zone is ahead of UTC at a wall time, in ms (for turning "10:00 India time" into an instant). */
function zoneOffset(zone: string, wall: string): number {
  const at = new Date(`${wall}Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - at.getTime();
}

// ---------------------------------------------------------------------------------------------- set-up: live chat queues (SD-2.18 / SD-2.19)

export function ChatQueuesAdmin({ queues, groups, onSave }: { queues: ChatQueue[]; groups: { id: string; name: string }[]; onSave: (q: ChatQueue | null, input: Partial<ChatQueue>) => Promise<unknown> }) {
  const [editing, setEditing] = useState<ChatQueue | 'new' | null>(null);
  const q = editing === 'new' ? null : editing;
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [max, setMax] = useState<number | null>(3);
  const [wait, setWait] = useState<number | null>(10);
  const [welcome, setWelcome] = useState('');
  const [question, setQuestion] = useState('');
  const [prompt, setPrompt] = useState<ChatPrompt>({ pathPrefix: '/yx/desk/help', text: '', afterSeconds: 20 });
  const { busy, error, run } = useRun();
  useEffect(() => {
    setName(q?.name ?? '');
    setGroupId(q?.groupId ?? null);
    setMax(q?.maxPerAgent ?? 3);
    setWait(q?.waitMinutes ?? 10);
    setWelcome(q?.welcome ?? '');
    const first = q?.preChat.sections[0]?.fields[0];
    setQuestion(first?.label ?? '');
    setPrompt(q?.prompts[0] ?? { pathPrefix: '/yx/desk/help', text: '', afterSeconds: 20 });
  }, [editing]);
  return (
    <Card title="Live chat queues" actions={<Button icon={Plus} onClick={() => setEditing('new')}>New queue</Button>}>
      <div className="yx-ops-stack">
        {queues.length === 0 && editing === null && <EmptyState compact title="No chat queues yet." description="A queue lets people chat with this desk from the help centre." />}
        <ul className="yx-esm-runs">
          {queues.map((x) => (
            <li key={x.id} className="yx-ops-row" data-between>
              <span>
                <strong>{x.name}</strong> · up to {x.maxPerAgent} chats each · a ticket after {x.waitMinutes} min without an agent {x.active ? '' : '· off'}
              </span>
              <Button size="sm" onClick={() => setEditing(x)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
        {editing !== null && (
          <div className="yx-esm-field-editor">
            <FormField label="Name" required>
              <TextField value={name} onChange={setName} maxLength={100} />
            </FormField>
            <FormField label="Team" optional>
              <Select value={groupId} onChange={setGroupId} clearable options={groups.map((g) => ({ value: g.id, label: g.name }))} />
            </FormField>
            <div className="yx-ops-row">
              <FormField label="Chats an agent takes at once">
                <NumberField value={max} onChange={setMax} min={1} max={10} />
              </FormField>
              <FormField label="Minutes before it becomes a ticket">
                <NumberField value={wait} onChange={setWait} min={1} max={120} />
              </FormField>
            </div>
            <FormField label="Welcome line" optional>
              <TextField value={welcome} onChange={setWelcome} maxLength={300} />
            </FormField>
            <FormField label="Question before the chat" optional helper="One short question the person answers first, for example: What is it about?">
              <TextField value={question} onChange={setQuestion} maxLength={200} />
            </FormField>
            <FormField label="Offer a chat on pages starting with" optional>
              <TextField value={prompt.pathPrefix} onChange={(v) => setPrompt({ ...prompt, pathPrefix: v })} maxLength={100} />
            </FormField>
            <FormField label="What the offer says" optional>
              <TextField value={prompt.text} onChange={(v) => setPrompt({ ...prompt, text: v })} maxLength={200} />
            </FormField>
            <Problem error={error} />
            <div className="yx-ops-row">
              <Button
                variant="primary"
                disabled={!name.trim()}
                loading={busy === 'save'}
                onClick={() =>
                  void run('save', async () => {
                    await onSave(q, {
                      name: name.trim(),
                      groupId,
                      maxPerAgent: max ?? 3,
                      waitMinutes: wait ?? 10,
                      welcome: welcome.trim() || null,
                      preChat: question.trim() ? { sections: [{ id: 'pre', columns: 1, fields: [{ key: 'about', type: 'text', label: question.trim(), required: true }] }], rules: [] } : { sections: [], rules: [] },
                      prompts: prompt.text.trim() ? [{ pathPrefix: prompt.pathPrefix.trim() || '/', text: prompt.text.trim(), afterSeconds: prompt.afterSeconds }] : [],
                    } as Partial<ChatQueue>);
                    setEditing(null);
                  })
                }
              >
                Save
              </Button>
              {q && (
                <Button loading={busy === 'off'} onClick={() => void run('off', () => onSave(q, { active: !q.active }))}>
                  {q.active ? 'Switch off' : 'Switch on'}
                </Button>
              )}
              <Button onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- set-up: desk organisation (SD-2.07 … SD-2.10)

export interface DeskOrgAdminProps {
  deskId: string;
  deskKind: string;
  desks: { id: string; name: string }[];
  forwardTo: string[];
  canCreateDesks: boolean;
  branches: BranchView[];
  locations: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  templates: DocTemplate[] | null;
  docFields: { key: string; label: string }[];
  onForwardTo: (deskIds: string[]) => Promise<unknown>;
  onClone: (input: { name: string; key: string }) => Promise<unknown>;
  /** restrict: the admin's answer when an existing HR desk would become restricted (asked first, 9 Oct 2026). */
  onStarterPack: (restrict?: boolean) => Promise<{ items: number; sla: boolean; restricted?: boolean }>;
  onAddBranch: (input: { locationId: string; groupId?: string }) => Promise<unknown>;
  onSaveTemplate: (t: DocTemplate | null, input: { name: string; body: string; needsSignature: boolean }) => Promise<unknown>;
  journeys?: { setup: JourneySetup | null | undefined; onSave: (input: { kind: 'join' | 'exit'; name: string; itemIds: string[] }) => Promise<unknown> } | null;
}

export function DeskOrgAdmin(p: DeskOrgAdminProps) {
  const [forward, setForward] = useState<string[]>(p.forwardTo);
  const [cloneName, setCloneName] = useState('');
  const [cloneKey, setCloneKey] = useState('');
  const [loc, setLoc] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplSign, setTplSign] = useState<'yes' | 'no'>('yes');
  const [packDone, setPackDone] = useState<string | null>(null);
  const [packAsk, setPackAsk] = useState<string[] | null>(null);
  const [jKind, setJKind] = useState<'join' | 'exit'>('join');
  const [jName, setJName] = useState('');
  const [jItems, setJItems] = useState<string[]>([]);
  const { busy, error, run } = useRun();
  useEffect(() => setForward(p.forwardTo), [p.forwardTo.join(',')]);
  /** The HR pack on an existing standard desk answers CONFIRM_RESTRICT first, with what changes; the admin chooses. */
  const addPack = async (restrict: boolean | undefined) => {
    try {
      const r = await p.onStarterPack(restrict);
      setPackAsk(null);
      const what = r.items || r.sla ? `Added ${r.items} catalogue item${r.items === 1 ? '' : 's'}${r.sla ? ' and response targets' : ''}.` : 'Nothing was missing.';
      setPackDone(restrict ? `${what} The desk is restricted now.` : what);
    } catch (e) {
      const err = e as Error & { code?: string; body?: { changes?: string[] } };
      if (err.code === 'CONFIRM_RESTRICT' && err.body?.changes) {
        setPackDone(null);
        setPackAsk(err.body.changes);
        return;
      }
      throw e;
    }
  };

  return (
    <div className="yx-ops-stack">
      <Problem error={error} />
      <Card title="Starter pack">
        <div className="yx-ops-stack" data-gap="sm">
          <p className="yx-chat__meta">Ready catalogue items, response targets and (for HR) private sensitive categories for this kind of desk. Only what is missing is added.</p>
          {packDone && <InlineAlert tone="success">{packDone}</InlineAlert>}
          {packAsk ? (
            <InlineAlert tone="warning" title="This makes the desk restricted">
              <ul className="yx-esm-changes">
                {packAsk.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </InlineAlert>
          ) : null}
          <div className="yx-ops-row">
            {packAsk ? (
              <>
                <Button variant="primary" loading={busy === 'pack-yes'} onClick={() => void run('pack-yes', () => addPack(true))}>
                  Make it restricted and add the pack
                </Button>
                <Button loading={busy === 'pack-no'} onClick={() => void run('pack-no', () => addPack(false))}>
                  Add the pack, keep it as it is
                </Button>
                <Button onClick={() => setPackAsk(null)}>Cancel</Button>
              </>
            ) : (
              <Button loading={busy === 'pack'} onClick={() => void run('pack', () => addPack(undefined))}>
                Add the starter pack
              </Button>
            )}
          </div>
        </div>
      </Card>
      <Card title="Moving tickets to other desks">
        <div className="yx-ops-stack" data-gap="sm">
          <FormField label="Agents may move tickets to" helper="Agents who also work on another desk may always move tickets there.">
            <MultiSelect value={forward} onChange={setForward} options={p.desks.filter((d) => d.id !== p.deskId).map((d) => ({ value: d.id, label: d.name }))} />
          </FormField>
          <div className="yx-ops-row">
            <Button loading={busy === 'fwd'} onClick={() => void run('fwd', () => p.onForwardTo(forward))}>
              Save
            </Button>
          </div>
        </div>
      </Card>
      <Card title="Sites (branches)">
        <div className="yx-ops-stack" data-gap="sm">
          <p className="yx-chat__meta">Tickets from people at a site go to that site’s team and use its hours. A site admin changes only their site.</p>
          {p.branches.map((b) => (
            <div key={b.id} className="yx-ops-row" data-between>
              <span>
                {b.location} · {p.groups.find((g) => g.id === b.groupId)?.name ?? 'No team'}
              </span>
            </div>
          ))}
          <div className="yx-ops-row">
            <Select aria-label="Location" placeholder="Location" value={loc} onChange={setLoc} options={p.locations.map((l) => ({ value: l.id, label: l.name }))} />
            <Select aria-label="Team" placeholder="Team" value={team} onChange={setTeam} options={p.groups.map((g) => ({ value: g.id, label: g.name }))} />
            <Button icon={Plus} disabled={!loc} loading={busy === 'branch'} onClick={() => void run('branch', () => p.onAddBranch({ locationId: loc!, ...(team ? { groupId: team } : {}) }))}>
              Add site
            </Button>
          </div>
        </div>
      </Card>
      {p.templates && (
        <Card title="Document templates">
          <div className="yx-ops-stack" data-gap="sm">
            {p.templates.map((t) => (
              <div key={t.id} className="yx-ops-row" data-between>
                <span>
                  <strong>{t.name}</strong> · {t.needsSignature ? 'needs a signature' : 'for information'}
                </span>
              </div>
            ))}
            <FormField label="Name" required>
              <TextField value={tplName} onChange={setTplName} maxLength={100} />
            </FormField>
            <FormField label="Text" required helper={`Fields you can use: ${p.docFields.map((f) => `{{${f.key}}}`).join(', ')}, and {{answer.<question key>}}.`}>
              <TextArea rows={5} value={tplBody} onChange={setTplBody} />
            </FormField>
            <Segment label="Signature" value={tplSign} onChange={setTplSign} options={[{ value: 'yes', label: 'Needs a signature' }, { value: 'no', label: 'For information' }]} />
            <div className="yx-ops-row">
              <Button disabled={!tplName.trim() || !tplBody.trim()} loading={busy === 'tpl'} onClick={() => void run('tpl', async () => {
                await p.onSaveTemplate(null, { name: tplName.trim(), body: tplBody, needsSignature: tplSign === 'yes' });
                setTplName('');
                setTplBody('');
              })}>
                Save template
              </Button>
            </div>
          </div>
        </Card>
      )}
      {p.journeys?.setup && (
        <Card title="Joiner and leaver journeys (whole company)">
          <div className="yx-ops-stack" data-gap="sm">
            {p.journeys.setup.journeys.map((j) => (
              <div key={j.id}>
                <strong>{j.name}</strong> · {j.kind === 'join' ? 'when someone joins' : 'when someone leaves'} · {j.itemIds.map((id) => p.journeys!.setup!.items.find((i) => i.id === id)?.name).filter(Boolean).join(', ')}
              </div>
            ))}
            <Segment label="When" value={jKind} onChange={setJKind} options={[{ value: 'join', label: 'Someone joins' }, { value: 'exit', label: 'Someone leaves' }]} />
            <FormField label="Name" required>
              <TextField value={jName} onChange={setJName} maxLength={100} />
            </FormField>
            <FormField label="What it orders" required>
              <MultiSelect value={jItems} onChange={setJItems} options={p.journeys.setup.items.map((i) => ({ value: i.id, label: i.name, description: i.journeyOnly ? 'Only for journeys' : undefined }))} />
            </FormField>
            <div className="yx-ops-row">
              <Button disabled={!jName.trim() || !jItems.length} loading={busy === 'journey'} onClick={() => void run('journey', async () => {
                await p.journeys!.onSave({ kind: jKind, name: jName.trim(), itemIds: jItems });
                setJName('');
                setJItems([]);
              })}>
                Save journey
              </Button>
            </div>
          </div>
        </Card>
      )}
      {p.canCreateDesks && (
        <Card title="Copy this desk">
          <div className="yx-ops-stack" data-gap="sm">
            <p className="yx-chat__meta">A new desk with the same set-up. Tickets, people and rules are not copied; catalogue items arrive as drafts.</p>
            <div className="yx-ops-row">
              <FormField label="New desk name">
                <TextField value={cloneName} onChange={setCloneName} maxLength={100} />
              </FormField>
              <FormField label="Key" helper="2 to 10 capital letters or digits, like ITP.">
                <TextField value={cloneKey} onChange={(v) => setCloneKey(v.toUpperCase())} maxLength={10} />
              </FormField>
            </div>
            <div className="yx-ops-row">
              <Button disabled={!cloneName.trim() || cloneKey.length < 2} loading={busy === 'clone'} onClick={() => void run('clone', () => p.onClone({ name: cloneName.trim(), key: cloneKey }))}>
                Copy desk
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
