// HLP-14 Write policies with AI, live (Helpdesk design wiring): the designed PolicyWriterScreen in cases-more.tsx
// renders this when the page passes `live`. Same layout as the design: the questionnaire stepper, the drafting card, the
// draft with its source tags beside the law check, and the approve dialog. States only the real records have are drawn
// in the same look: AI off (the YukthiX starters instead), the latest open draft, a clause that states a number, a state
// with no law table (counsel), an approved draft waiting for a second person. The server checks every rule again
// (docs/yukthix/helpdesk-design-map.md 4i); the numbers come from the answers and the law check runs on the server.
import { useEffect, useState } from 'react';
import { Button } from '../../components/button';
import { AiBadge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { NumberField, TextArea } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Card, PageHeader } from '../../components/shell';
import { Dialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { Stepper } from '../../components/stepper';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import type { LoadState } from '../desk/types';
import { Actions, CheckList, Facts, OpsDesk, SourceTag, useSay, type CheckRow } from './ops-kit';

/* ---------------- what the API sends ---------------- */

export type WriterAi = 'on' | 'off' | 'not_set_up';
export type WriterType = 'leave' | 'work_from_home' | 'notice' | 'conduct' | 'posh';
export interface WriterOption {
  value: string;
  label: string;
}
export interface WriterValueSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
}
/** GET desk/policy-writer */
export interface WriterHome {
  ai: WriterAi;
  latest: { id: string; type: string; createdAt: string } | null;
  options: {
    types: { value: WriterType; label: string }[];
    industries: WriterOption[];
    states: WriterOption[];
    patterns: WriterOption[];
    values: Record<WriterType, WriterValueSpec[]>;
    notesMax: number;
  };
}
export interface WriterClause {
  id: string;
  title: string;
  text: string;
  source: 'law' | 'company' | 'ai';
  ref?: string;
  editable: boolean;
  finding?: string;
}
export interface WriterFinding {
  id: string;
  state: string;
  text: string;
  status: 'open' | 'resolved' | 'unchecked';
  fix?: { key: string; value: number };
}
/** GET desk/policy-writer/drafts/:id */
export interface WriterDraft {
  id: string;
  status: 'draft' | 'approved' | 'discarded';
  version: number;
  mode: 'ai' | 'starter';
  type: WriterType;
  typeLabel: string;
  answers: {
    industry: string;
    states: string[];
    headcount: number;
    workPattern: string;
  };
  values: Record<string, number>;
  clauses: WriterClause[];
  findings: WriterFinding[];
  openFindings: number;
  createdBy: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvedByMe: boolean;
  /** "Law check covers general labour law only; … review with counsel" (null when the industry's tables were checked). */
  counselNote: string | null;
  discardedBy: string | null;
  discardedAt: string | null;
  /** manual, or expired (the daily clean-up). */
  discardReason: 'manual' | 'expired' | null;
  target: {
    title: string;
    policyId: string | null;
    code: string | null;
    number: number;
    blockedBy: { number: number; status: string } | null;
  };
}
export interface WriterAnswers {
  mode: 'ai' | 'starter';
  type: WriterType;
  industry: string;
  states: string[];
  headcount: number;
  workPattern: string;
  notes?: string;
  [value: string]: unknown;
}
export interface WriterSave {
  version: number;
  clauses?: { id: string; text: string }[];
  [value: string]: unknown;
}

export interface LivePolicyWriter {
  state: LoadState;
  onRetry?: () => void;
  home: WriterHome | null;
  draftId: string | null;
  draft: WriterDraft | null;
  draftState?: LoadState;
  onOpenDraft: (id: string | null) => void;
  onGenerate: (input: WriterAnswers) => Promise<{ id: string }>;
  onSave: (id: string, input: WriterSave) => Promise<{ version: number }>;
  onApprove: (
    id: string,
    version: number,
  ) => Promise<{
    policyId: string;
    code: string;
    title: string;
    number: number;
  }>;
  onOpenPolicy: (policyId: string) => void;
  /** Answer 106: set an unapproved draft aside (never deleted). */
  onDiscard: (id: string, version: number) => Promise<void>;
  /** Stories and tests only. */
  start?: { approveOpen?: boolean; generating?: boolean; discardOpen?: boolean };
}

const day = (iso: string | null) => (iso ? formatDate(new Date(iso)) : '—');

function Frame({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <OpsDesk area="helpdesk" active="Policies">
      <PageHeader
        title="Write policies with AI"
        description="Helpdesk › Write policies with AI. Answer a few questions; we draft the policy and check it against the law for each state. Nothing is published until you approve and a second person publishes it."
        status={<AiBadge />}
        actions={actions}
      />
      <PageBanner tone="info">Not legal advice; review by counsel recommended.</PageBanner>
      {children}
    </OpsDesk>
  );
}

/* ---------------- questionnaire ---------------- */

function WriterQuestions({ live, home }: { live: LivePolicyWriter; home: WriterHome }) {
  const o = home.options;
  const aiOn = home.ai === 'on';
  const [type, setType] = useState<WriterType>('leave');
  const [industry, setIndustry] = useState<string>('');
  const [states, setStates] = useState<string[]>([]);
  const [headcount, setHeadcount] = useState<number | null>(null);
  const [pattern, setPattern] = useState<string>(o.patterns[0]?.value ?? 'office');
  const [values, setValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(
      Object.values(o.values)
        .flat()
        .map((v) => [v.key, v.default]),
    ),
  );
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(!!live.start?.generating);
  const [error, setError] = useState<string | null>(null);
  const specs = o.values[type] ?? [];
  const company = useTooEarly([
    ...(!industry ? [{ fieldId: 'pq-industry', message: 'Choose your industry.' }] : []),
    ...(!states.length
      ? [
          {
            fieldId: 'pq-states',
            message: 'Choose at least one state where people work.',
          },
        ]
      : []),
    ...(!headcount || headcount < 1
      ? [
          {
            fieldId: 'pq-headcount',
            message: 'Say how many people work for you.',
          },
        ]
      : []),
  ]);
  const choices = useTooEarly([
    ...specs
      .filter((s) => values[s.key] === null || values[s.key]! < s.min || values[s.key]! > s.max)
      .map((s) => ({
        fieldId: `pq-${s.key}`,
        message: `${s.label}: a whole number from ${s.min} to ${s.max}.`,
      })),
    ...(notes.length > o.notesMax
      ? [
          {
            fieldId: 'pq-notes',
            message: `Keep the notes to ${o.notesMax} characters.`,
          },
        ]
      : []),
  ]);
  const label = (list: WriterOption[], v: string) => list.find((x) => x.value === v)?.label ?? v;
  const finish = async () => {
    if (company.stop() || choices.stop()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await live.onGenerate({
        mode: aiOn ? 'ai' : 'starter',
        type,
        industry,
        states,
        headcount: headcount!,
        workPattern: pattern,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...Object.fromEntries(specs.map((s) => [s.key, values[s.key]])),
      });
      live.onOpenDraft(r.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const drafting = (
    <Card title={`Drafting the ${label(o.types, type).toLowerCase()} policy`}>
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-live="polite" aria-label="Drafting policies">
        <p className="yx-ops-muted">
          {aiOn
            ? `Drafting from your answers and the dated law for ${states.map((s) => label(o.states, s)).join(', ') || 'your states'}. This takes about a minute.`
            : 'Putting the YukthiX starter together with your answers.'}
        </p>
        <Skeleton height={24} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </div>
    </Card>
  );
  return (
    <div className="yx-ops-stack">
      {busy && drafting}
      {/* Kept mounted while drafting, so a refusal returns to the same step with every answer. */}
      <div className="yx-ops-stack" hidden={busy}>
        {!aiOn && (
          <InlineAlert tone="warning" title={home.ai === 'off' ? 'AI is switched off for policies' : 'Your company has no AI set up'}>
            {home.ai === 'off' ? 'Your company switched AI off in Settings › Company policies.' : 'Ask your System Admin to add an AI key in Settings › Integrations.'} You can still answer the
            questions and start from a YukthiX starter: the same law check and approval apply.
          </InlineAlert>
        )}
        {home.latest && (
          <InlineAlert
            tone="info"
            title="You have a draft that is not approved yet"
            actions={
              <Button size="sm" onClick={() => live.onOpenDraft(home.latest!.id)}>
                Open it
              </Button>
            }
          >
            {home.latest.type} policy, started {day(home.latest.createdAt)}.
          </InlineAlert>
        )}
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <Stepper
          title="Policy questionnaire"
          finishLabel={aiOn ? 'Draft policies' : 'Use a starter'}
          onFinish={() => void finish()}
          onContinue={(id) => (id === 'company' ? !company.stop() : id === 'choices' ? !choices.stop() : true)}
          review={{
            title: 'Check your answers',
            note: aiOn ? 'Only these answers go to your company’s AI: never names or other personal data.' : undefined,
          }}
          steps={[
            {
              id: 'company',
              title: 'Your company',
              content: (
                <div className="yx-ops-stack">
                  <FormField id="pq-type" label="Policy to write">
                    {/* Five types: a dropdown, not the Segment (2-4 options only). */}
                    <Select id="pq-type" value={type} onChange={(v) => setType(v as WriterType)} options={o.types} />
                  </FormField>
                  <FormField id="pq-industry" label="Industry" required error={company.errorOf('pq-industry')}>
                    <Select id="pq-industry" value={industry || null} onChange={(v) => setIndustry(String(v))} options={o.industries} />
                  </FormField>
                  <FormField id="pq-states" label="States where people work" helper="The law check runs for each state" required error={company.errorOf('pq-states')}>
                    <MultiSelect id="pq-states" value={states} onChange={setStates} options={o.states} />
                  </FormField>
                  <FormField id="pq-headcount" label="Headcount" required error={company.errorOf('pq-headcount')}>
                    <NumberField id="pq-headcount" value={headcount} onChange={setHeadcount} min={1} max={1_000_000} />
                  </FormField>
                </div>
              ),
              summary: `${label(o.types, type)} · ${industry ? label(o.industries, industry) : 'Industry not chosen'} · ${states.map((s) => label(o.states, s)).join(', ') || 'No states'} · ${headcount ?? '—'} people`,
            },
            {
              id: 'work',
              title: 'How people work',
              content: (
                <FormField label="Work pattern">
                  <RadioGroup value={pattern} onChange={setPattern} options={o.patterns} />
                </FormField>
              ),
              summary: label(o.patterns, pattern),
            },
            {
              id: 'choices',
              title: 'Your choices',
              content: (
                <div className="yx-ops-stack">
                  {specs.length > 0 && (
                    <FieldRow>
                      {specs.map((s) => (
                        <FormField key={s.key} id={`pq-${s.key}`} label={s.label} error={choices.errorOf(`pq-${s.key}`)}>
                          <NumberField id={`pq-${s.key}`} value={values[s.key] ?? null} onChange={(n) => setValues((x) => ({ ...x, [s.key]: n }))} min={s.min} max={s.max} />
                        </FormField>
                      ))}
                    </FieldRow>
                  )}
                  <FormField
                    id="pq-notes"
                    label="Anything else the policy should say"
                    helper={`Optional. No names, emails or phone numbers. Up to ${o.notesMax} characters.`}
                    error={choices.errorOf('pq-notes')}
                  >
                    <TextArea id="pq-notes" value={notes} onChange={setNotes} rows={3} maxLength={o.notesMax} />
                  </FormField>
                </div>
              ),
              summary: specs.map((s) => `${values[s.key] ?? '—'} ${s.label.toLowerCase()}`).join(' · '),
            },
          ]}
        />
      </div>
    </div>
  );
}

/* ---------------- the draft ---------------- */

function DraftView({ live, d }: { live: LivePolicyWriter; d: WriterDraft }) {
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(d.clauses.filter((c) => c.editable).map((c) => [c.id, c.text])));
  const [open, setOpen] = useState(!!live.start?.approveOpen);
  const [discardOpen, setDiscardOpen] = useState(!!live.start?.discardOpen);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast, say } = useSay();
  useEffect(() => setTexts(Object.fromEntries(d.clauses.filter((c) => c.editable).map((c) => [c.id, c.text]))), [d.id, d.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = d.clauses.filter((c) => c.editable && texts[c.id] !== undefined && texts[c.id] !== c.text);
  const empty = d.clauses.find((c) => c.editable && !(texts[c.id] ?? '').trim());
  const approved = d.status === 'approved';
  const discarded = d.status === 'discarded';
  const closed = approved || discarded;
  const discard = async () => {
    setBusy('discard');
    setError(null);
    try {
      await live.onDiscard(d.id, d.version);
      setDiscardOpen(false);
      toast({ tone: 'success', title: 'Draft discarded', description: 'It stays in the audit trail. Start a new one when you need it.' });
      live.onOpenDraft(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async (extra: Record<string, number> = {}, quiet = false) => {
    if (empty) {
      say(`Write the "${empty.title}" clause, or keep its text.`);
      return null;
    }
    const r = await live.onSave(d.id, {
      version: d.version,
      ...extra,
      ...(changed.length ? { clauses: changed.map((c) => ({ id: c.id, text: texts[c.id] })) } : {}),
    });
    if (!quiet)
      toast({
        tone: 'success',
        title: 'Draft saved',
        description: 'The law check ran again.',
      });
    return r;
  };
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const approve = async () => {
    setBusy('approve');
    setError(null);
    try {
      const saved = changed.length ? await save({}, true) : { version: d.version };
      if (!saved) return;
      const r = await live.onApprove(d.id, saved.version);
      setOpen(false);
      toast({
        tone: 'success',
        title: `${r.title} v${r.number} is waiting to be published`,
        description: 'A second person with publish rights publishes it in Policy admin.',
      });
      live.onOpenPolicy(r.policyId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const checks: CheckRow[] = d.findings.map((f) => ({
    id: f.id,
    status: f.status === 'open' ? 'fail' : f.status === 'unchecked' ? 'warn' : 'pass',
    label: `${f.state}: ${f.text}`,
    detail:
      f.status === 'open'
        ? f.fix
          ? 'Raise it to the legal minimum.'
          : 'Change the clause, then save the draft.'
        : f.status === 'unchecked'
          ? 'No law table yet: counsel review recommended'
          : 'Meets the law',
    action:
      f.status === 'open' && f.fix && !closed ? (
        <Actions>
          <Button size="sm" loading={busy === f.id} onClick={() => void run(f.id, () => save({ [f.fix!.key]: f.fix!.value }))}>
            Use the legal minimum
          </Button>
        </Actions>
      ) : undefined,
  }));

  return (
    <Frame
      actions={
        discarded ? (
          <Button onClick={() => live.onOpenDraft(null)}>Start again</Button>
        ) : approved ? (
          d.target.policyId && <Button onClick={() => live.onOpenPolicy(d.target.policyId!)}>Open in Policy admin</Button>
        ) : (
          <>
            <Button onClick={() => live.onOpenDraft(null)}>Start again</Button>
            <Button variant="danger" onClick={() => (setError(null), setDiscardOpen(true))}>
              Discard
            </Button>
            <Button loading={busy === 'save'} onClick={() => void run('save', () => save())}>
              Save draft
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                say(d.openFindings > 0 && `Fix the ${d.openFindings === 1 ? 'open law-check finding' : `${d.openFindings} open law-check findings`} first.`, () => (setError(null), setOpen(true)))
              }
            >
              Approve & load
            </Button>
          </>
        )
      }
    >
      {approved && (
        <InlineAlert tone="info" title={`Approved by ${d.approvedByMe ? 'you' : (d.approvedBy ?? 'a policy manager')} on ${day(d.approvedAt)}`}>
          {d.target.title} v{d.target.number} waits in Policy admin.{' '}
          {d.approvedByMe ? 'Another person with publish rights publishes it; you can’t.' : 'A person with publish rights who did not approve it publishes it.'}
        </InlineAlert>
      )}
      {discarded && (
        <InlineAlert
          tone="info"
          title={d.discardReason === 'expired' ? `Discarded by the daily clean-up on ${day(d.discardedAt)}` : `Discarded by ${d.discardedBy ?? 'a policy manager'} on ${day(d.discardedAt)}`}
        >
          {d.discardReason === 'expired' ? 'Nobody changed it for the days your company set.' : 'It was set aside before approval.'} It stays in the audit trail and can’t be changed. Start again for a
          new draft.
        </InlineAlert>
      )}
      {d.counselNote && (
        <InlineAlert tone="warning" title="Ask counsel">
          {d.counselNote}. {approved ? 'The publisher ticks this as seen before publishing.' : 'It does not stop approval; the publisher ticks it as seen before publishing.'}
        </InlineAlert>
      )}
      <div className="yx-ops-split">
        <Card title={`${d.typeLabel} policy (${approved ? 'approved' : discarded ? 'discarded' : 'draft'})`}>
          <div className="yx-ops-stack">
            <p className="yx-ops-muted">
              {d.mode === 'ai' ? 'Drafted by your company’s AI' : 'Started from the YukthiX starter'} from the answers: {d.answers.industry} · {d.answers.states.join(', ')} · {d.answers.headcount}{' '}
              people.
            </p>
            {d.clauses.map((c) => (
              <section key={c.id} className="yx-ops-clause" data-finding={c.finding ? true : undefined}>
                <div className="yx-ops-clause__head">
                  <span className="yx-ops-clause__title">{c.title}</span>
                  <SourceTag source={c.source} rule={c.ref} />
                </div>
                <TextArea
                  value={c.editable ? (texts[c.id] ?? c.text) : c.text}
                  onChange={(v) => setTexts((x) => ({ ...x, [c.id]: v }))}
                  readOnly={!c.editable || closed}
                  rows={3}
                  maxLength={1500}
                  aria-label={c.title}
                />
              </section>
            ))}
          </div>
        </Card>
        <div className="yx-ops-stack">
          <Card title={`Law check (${d.openFindings} open)`}>
            <p className="yx-ops-muted">Checked against the law tables valid today for each chosen state. Numbers come from your answers; the AI never sets them.</p>
            <CheckList label="Law-floor findings" items={checks} />
          </Card>
          {d.openFindings > 0 && !closed && <InlineAlert tone="warning">Approve & load works once every finding is fixed.</InlineAlert>}
          {d.target.blockedBy && !closed && (
            <InlineAlert tone="warning" title={`${d.target.title} has v${d.target.blockedBy.number} being written`}>
              Finish it or send it back in Policy admin before you approve this draft.
            </InlineAlert>
          )}
        </div>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title={`Approve and load the ${d.typeLabel.toLowerCase()} policy?`}
        description="The text becomes a new version of the policy in Policy admin. A second person publishes it; people see it and acknowledge it only then."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'approve'} onClick={() => void approve()}>
              Approve & load
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Facts
            items={[
              {
                label: 'Policy',
                value: d.target.code ? `${d.target.code} · ${d.target.title}` : `${d.target.title} (new)`,
              },
              { label: 'New policy version', value: `v${d.target.number}` },
              {
                label: 'Publishes it',
                value: 'Another person with publish rights (not you)',
              },
              ...(d.counselNote ? [{ label: 'Counsel note', value: 'The publisher ticks it as seen', tone: 'warning' as const }] : []),
            ]}
          />
          <p className="yx-ops-muted">Employees see the new version only after it is published in Policies.</p>
        </div>
      </Dialog>
      <Dialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        size="sm"
        title="Discard this draft?"
        description="It stays in the audit trail but can’t be opened to change or approve again."
        footer={
          <>
            <Button onClick={() => setDiscardOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={busy === 'discard'} onClick={() => void discard()}>
              Discard draft
            </Button>
          </>
        }
      >
        {error ? (
          <InlineAlert tone="danger">{error}</InlineAlert>
        ) : (
          <p className="yx-ops-muted">
            {d.typeLabel} policy, started {day(d.createdAt)}.
          </p>
        )}
      </Dialog>
    </Frame>
  );
}

export function LivePolicyWriter({ live }: { live: LivePolicyWriter }) {
  if (live.state === 'no-access')
    return (
      <Frame>
        <NoAccessState what="the policy writer" grantedBy="your HR admin" note="HR with policy rights for the whole company write company policies." />
      </Frame>
    );
  if (live.state === 'error' || (live.draftId && live.draftState === 'error'))
    return (
      <Frame>
        <ErrorState
          title={live.draftId ? 'We couldn’t load this draft.' : 'We couldn’t load the policy writer.'}
          description="It may belong to another company, or the connection dropped. Try again in a moment."
          onRetry={live.onRetry}
        />
      </Frame>
    );
  if (live.state === 'loading' || !live.home || (live.draftId && (!live.draft || live.draft.id !== live.draftId)))
    return (
      <Frame>
        <Card>
          <div className="yx-ops-stack" aria-busy="true">
            <Skeleton height={24} />
            <Skeleton height={160} />
          </div>
        </Card>
      </Frame>
    );
  if (live.draftId && live.draft) return <DraftView live={live} d={live.draft} />;
  return <Frame>{live.home.options.types.length ? <WriterQuestions live={live} home={live.home} /> : <EmptyState title="No policy types yet." />}</Frame>;
}
