// PLT-12 Approval policy editor, live (Settings S-6, answer 1330; widened by E2, answers 2644-2650 and 2785-2789). For
// each request type: ordered rules (a condition on the type's values and its own steps; the first matching rule wins) and
// the "otherwise" steps, on the shared approvals engine. Pay run types are built in and cannot change; other pay types,
// exits and letters take add-on steps after the module's own. Every type keeps its required steps. "Try it" runs the
// engine's own route. Requisitions and offers also have their own notice text, and Hiring › Approvals opens this same
// editor for those two types (2650), with the move of the old hiring routes (2789).
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { Button, IconButton, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { Card, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { useToastIfAny } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { summariseConditions, type RuleField } from '../../lib/rules';
import { fromServerGroup } from '../../lib/forms';
import { RuleBuilderScreen } from './governance';
import { TestPreviewDrawer } from '../platform-b/studio-screens';
import { SampleValues, TryTrace } from '../platform-b/try-live';
import { Tile, Workspace } from './platform-kit';
import { StepDrawer, StepTiles, kindsFor, type StepChoices } from './approval-steps';
import type { LivePolicyEditor, MoveRow, NoticeRow, PolicyBodyInput, PolicyRuleInput, PolicyStepInput, PolicyTypeRow, TryResult } from './approval-rules-types';

export type { LivePolicyEditor, PolicyTypeRow, PolicyStepInput, PolicyApprover, PolicyRuleInput, PolicyBodyInput, TryResult, TryInput, PastRequest, NoticeRow, MoveRow } from './approval-rules-types';
export { APPROVER_LABEL } from './approval-steps';

const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');
const MODE_WORDS = { full: 'Your steps replace the built-in ones; required steps stay', addon: 'Your steps come after the built-in ones', locked: 'Built in, cannot change' } as const;
const NOTICE_TYPES = ['ats.requisition', 'ats.offer'];
const fieldsOf = (row: PolicyTypeRow): RuleField[] => (row.fields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }));

export function LivePolicyEditorScreen({ live }: { live: LivePolicyEditor }) {
  const types = live.only ? live.types.filter((t) => live.only!.includes(t.key)) : live.types;
  const [chosen, setType] = useState<string>(live.defaultType ?? '');
  // Until one is chosen, the first type (the list may arrive after the first render).
  const type = chosen && types.some((t) => t.key === chosen) ? chosen : (types[0]?.key ?? '');
  if (live.state === 'no-access') return <NoAccessState grantedBy="your System Admin" what="approval policies" />;
  if (live.state === 'error') return <ErrorState title="We couldn't load the approval policies." description="Retry in a moment. Nothing has changed." onRetry={live.onRetry} />;
  const row = types.find((t) => t.key === type);
  return (
    <div className="yx-plt-stack">
      <PageHeader
        title={live.only ? 'Hiring approvals' : 'Approval policies'}
        description={`Who approves each request type. Reminders after ${live.remindHours} hours, escalation to their manager after ${live.escalateHours} hours (Settings › Approvals). Changes apply to new requests only.`}
        status={!live.canEdit ? <Badge tone="neutral">View only</Badge> : undefined}
        actions={
          <>
            {live.limitsHref && <Link href={live.limitsHref}>Approval limits</Link>}
            <Select aria-label="Request type" value={type || null} onChange={(v) => v && setType(v)} options={types.map((t) => ({ value: t.key, label: t.group && !live.only ? `${t.group}: ${t.label}` : t.label }))} />
          </>
        }
      />
      {live.move && <MoveCard move={live.move} canEdit={live.canEdit} />}
      {live.state === 'loading' && <p className="yx-plt-muted">Loading…</p>}
      {row && <TypeEditor key={`${row.key}:${row.version}`} live={live} row={row} />}
    </div>
  );
}

function TypeEditor({ live, row }: { live: LivePolicyEditor; row: PolicyTypeRow }) {
  const toaster = useToastIfAny();
  const mode = row.mode ?? 'full';
  const canEdit = live.canEdit && mode !== 'locked';
  const choices: StepChoices = { people: live.people, groups: live.groups, grades: live.grades };
  const kinds = kindsFor(row);
  const fields = fieldsOf(row);
  const [rules, setRules] = useState<PolicyRuleInput[]>(row.rules ?? []);
  const [steps, setSteps] = useState<PolicyStepInput[]>(row.steps ?? []);
  const [ruleOpen, setRuleOpen] = useState<number | null | undefined>(undefined);
  const [stepOpen, setStepOpen] = useState<number | null | undefined>(undefined);
  const [tryOpen, setTryOpen] = useState(false);
  const [sample, setSample] = useState<Record<string, string | number>>({});
  const [tried, setTried] = useState<TryResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const draft: PolicyBodyInput = { rules, steps };
  const changed = JSON.stringify(draft) !== JSON.stringify({ rules: row.rules ?? [], steps: row.steps ?? [] });
  const early = useTooEarly([!steps.length && { fieldId: 'pe-add', message: 'Add at least one "otherwise" step, or keep the built-in steps.' }].filter(Boolean) as { fieldId: string; message: string }[]);
  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setFailed(null);
    try {
      await fn();
      toaster?.toast({ tone: 'success', title: done });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const quickTry = async () => {
    setBusy('try');
    setFailed(null);
    try {
      setTried(await live.onTry!(row.key, { values: sample, ...(steps.length ? { draft } : {}) }));
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const moveRule = (i: number, d: number) =>
    setRules((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  // PLT-32: one rule open in the rule builder.
  if (ruleOpen !== undefined)
    return (
      <RuleBuilderScreen
        live={{
          typeLabel: row.label,
          rule: ruleOpen === null ? null : rules[ruleOpen]!,
          position: ruleOpen === null ? rules.length + 1 : ruleOpen + 1,
          fields,
          kinds,
          choices,
          canEdit,
          onCancel: () => setRuleOpen(undefined),
          onDone: (r) => {
            setRules((xs) => (ruleOpen === null ? [...xs, r] : xs.map((x, k) => (k === ruleOpen ? r : x))));
            setRuleOpen(undefined);
          },
        }}
      />
    );

  const rulesView = (
    <div className="yx-plt-stack">
      {failed && <InlineAlert tone="danger" title={failed} />}
      {mode === 'addon' && (
        <Tile title="Built-in steps first" badge={<Badge tone="neutral">Built in</Badge>}>
          <span>{row.builtIn || row.approvers}</span>
          <span className="yx-plt-muted">Your steps below come after these. They cannot remove them.</span>
        </Tile>
      )}
      {rules.map((r, i) => (
        <Card
          key={i}
          title={`Rule ${i + 1} · ${r.name}`}
          actions={
            canEdit ? (
              <>
                <IconButton icon={Pencil} label={`Change rule ${r.name}`} onClick={() => setRuleOpen(i)} />
                <IconButton icon={ArrowUp} label={`Move rule ${r.name} up`} disabled={i === 0} onClick={() => moveRule(i, -1)} />
                <IconButton icon={ArrowDown} label={`Move rule ${r.name} down`} disabled={i === rules.length - 1} onClick={() => moveRule(i, 1)} />
                <IconButton icon={Trash2} label={`Remove rule ${r.name}`} onClick={() => setRules((xs) => xs.filter((_, k) => k !== i))} />
              </>
            ) : (
              <Button onClick={() => setRuleOpen(i)}>Open</Button>
            )
          }
        >
          <div className="yx-plt-stack">
            <p className="yx-plt-muted">When {summariseConditions(fromServerGroup(r.when, fields), fields)}.</p>
            <StepTiles steps={r.steps} choices={choices} canEdit={false} onChange={() => {}} onEdit={() => {}} label={`Rule ${r.name}`} />
          </div>
        </Card>
      ))}
      <Card title={rules.length ? 'Otherwise' : mode === 'addon' ? 'Your add-on steps' : 'Steps'}>
        <div className="yx-plt-stack">
          <p className="yx-plt-muted">
            {row.steps ? `Version ${row.version}${row.updatedBy ? `, by ${row.updatedBy}` : ''}${row.updatedAt ? ` on ${formatDate(new Date(row.updatedAt))}` : ''}.` : `Built in: ${row.builtIn || row.approvers}.${canEdit ? ' Add steps to set your own.' : ''}`}
            {rules.length ? ' Requests that match no rule take these steps.' : ''}
          </p>
          {!steps.length && !canEdit && <EmptyState compact title="Built-in steps" description="This request type uses the steps its module sets." />}
          <FormField id="pe-add" label="Otherwise steps" hideLabel error={early.errorOf('pe-add')}>
            <StepTiles steps={steps} choices={choices} canEdit={canEdit} onChange={setSteps} onEdit={setStepOpen} label="Otherwise" />
          </FormField>
        </div>
      </Card>
      {canEdit && !fields.length && <p className="yx-plt-muted">This request type sends no values to test, so it has one route.</p>}
    </div>
  );

  return (
    <>
      <ObjectHeader
        name={`${row.label} approvals`}
        icon={Workflow}
        secondary={`${row.group ? `${row.group} · ` : ''}${MODE_WORDS[mode]}${rules.length ? ' · the first matching rule wins' : ''}`}
        status={mode === 'locked' ? <Badge tone="neutral">Built in</Badge> : changed ? <Badge tone="warning">Not saved</Badge> : row.steps ? <Badge tone="success">{`Version ${row.version}`}</Badge> : <Badge tone="neutral">Built-in steps</Badge>}
        facts={[
          { label: 'Rules', value: rules.length },
          { label: 'Changes affect', value: 'New requests only' },
          { label: 'Last change', value: row.updatedAt ? formatDate(new Date(row.updatedAt)) : '—' },
        ]}
        actions={
          canEdit ? (
            <>
              {fields.length > 0 && (
                <Button icon={Plus} disabled={rules.length >= 10} onClick={() => setRuleOpen(null)}>
                  {rules.length >= 10 ? 'At most 10 rules' : 'Add rule'}
                </Button>
              )}
              {live.onTry && (
                <Button onClick={() => setTryOpen(true)}>
                  Try on a past request
                </Button>
              )}
              {row.steps && (
                <Button loading={busy === 'reset'} onClick={() => void act('reset', () => live.onReset(row.key, row.version), 'Back to the built-in steps')}>
                  Use the built-in steps
                </Button>
              )}
              <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void act('save', () => live.onSave(row.key, draft, row.version), `${row.label} approvals saved`)}>
                Save as version {row.version + 1}
              </Button>
            </>
          ) : undefined
        }
      />
      {mode === 'locked' ? (
        <InlineAlert tone="info" title={`${row.label} approvals are built in and cannot change`}>
          {row.builtIn || row.approvers}. These checks keep pay safe (for example, nobody approves a run that pays them or that includes inputs they made).
        </InlineAlert>
      ) : (
        <Workspace
          asideLabel="Try it"
          aside={
            <>
              <h2 className="yx-plt-h">Try it</h2>
              <p className="yx-plt-muted">Try sample values to see which rule matches and who would approve, as the policy is in the editor now.</p>
              <SampleValues row={row} values={sample} onChange={setSample} />
              {live.onTry && (
                <Button loading={busy === 'try'} onClick={() => void quickTry()}>
                  Try it
                </Button>
              )}
              {tried && <TryTrace result={tried} />}
            </>
          }
        >
          {NOTICE_TYPES.includes(row.key) && live.notices ? (
            <Tabs defaultValue="rules">
              <TabsList aria-label={`${row.label} approvals`}>
                <TabsTrigger value="rules" count={rules.length}>
                  Rules
                </TabsTrigger>
                <TabsTrigger value="notices">Notices</TabsTrigger>
              </TabsList>
              <TabsContent value="rules">{rulesView}</TabsContent>
              <TabsContent value="notices">
                <Notices type={row.key} notices={live.notices} canEdit={live.canEdit} />
              </TabsContent>
            </Tabs>
          ) : (
            rulesView
          )}
        </Workspace>
      )}
      {stepOpen !== undefined && (
        <StepDrawer
          open
          step={stepOpen === null ? null : steps[stepOpen]!}
          kinds={kinds}
          choices={choices}
          onClose={() => setStepOpen(undefined)}
          onDone={(s) => {
            setSteps((xs) => (stepOpen === null ? [...xs, s] : xs.map((x, k) => (k === stepOpen ? s : x))));
            setStepOpen(undefined);
          }}
        />
      )}
      {tryOpen && live.onTry && <TestPreviewDrawer live={{ row, draft: steps.length ? draft : null, onTry: live.onTry, pastRequests: live.pastRequests, mode: 'past', onClose: () => setTryOpen(false) }} />}
    </>
  );
}

/** Part 7 (answer 2648): the hiring notices per event; merge fields only, plain text. */
function Notices({ type, notices, canEdit }: { type: string; notices: NonNullable<LivePolicyEditor['notices']>; canEdit: boolean }) {
  const toaster = useToastIfAny();
  const [rows, setRows] = useState<NoticeRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState<NoticeRow | null>(null);
  const load = () => notices.load(type).then((r) => setRows(r.events), (e) => setFailed(errorText(e)));
  useEffect(() => {
    void notices.load(type).then((r) => setRows(r.events), (e) => setFailed(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per type; the host passes new callbacks each render
  }, [type]);
  const cols: TableColumn<NoticeRow>[] = [
    { key: 'event', header: 'When', value: (r) => r.label, render: (r) => <strong>{r.label}</strong> },
    { key: 'subject', header: 'Subject', value: (r) => r.subject ?? '', render: (r) => r.subject ?? <span className="yx-plt-muted">Standard notice</span> },
    { key: 'own', header: 'Text', type: 'status', value: (r) => (r.own ? 'Your text' : 'Standard'), statusTone: (v) => (v === 'Your text' ? 'success' : 'neutral') },
  ];
  return (
    <div className="yx-plt-stack">
      <p className="yx-plt-muted">Your own words for each notice. You can use {'{title}'}, {'{requester}'}, {'{step}'} and {'{link}'}. The request's details never go into a notice.</p>
      {failed && <InlineAlert tone="danger" title={failed} />}
      <DataTable label="Notices" columns={cols} rows={rows ?? []} getRowId={(r) => r.event} state={rows ? 'ready' : 'loading'} defaultGroupBy={null} onRowClick={canEdit ? (r) => setOpen(r) : undefined} />
      {open && (
        <NoticeDrawer
          row={open}
          onClose={() => setOpen(null)}
          onSave={async (v) => {
            const r = (await notices.save(type, open.event, v)) as { events?: NoticeRow[] } | undefined;
            if (r?.events) setRows(r.events);
            else await load();
            toaster?.toast({ tone: 'success', title: `${open.label} notice saved` });
            setOpen(null);
          }}
          onReset={async () => {
            const r = (await notices.reset(type, open.event)) as { events?: NoticeRow[] } | undefined;
            if (r?.events) setRows(r.events);
            else await load();
            toaster?.toast({ tone: 'success', title: `${open.label} notice back to standard` });
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function NoticeDrawer({ row, onClose, onSave, onReset }: { row: NoticeRow; onClose: () => void; onSave: (v: { subject: string; body: string }) => Promise<void>; onReset: () => Promise<void> }) {
  const [subject, setSubject] = useState(row.subject ?? '');
  const [body, setBody] = useState(row.body ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const bad = (t: string) => /[<>]/.test(t) || [...t.matchAll(/\{([a-z_]+)\}/g)].some((m) => !['title', 'requester', 'step', 'link'].includes(m[1]!));
  const early = useTooEarly(
    [
      (subject.trim().length < 2 || subject.length > 150 || bad(subject)) && { fieldId: 'nt-subject', message: 'Write a subject of 2 to 150 characters, plain text, with only {title}, {requester}, {step} or {link}.' },
      (body.trim().length < 2 || body.length > 2000 || bad(body)) && { fieldId: 'nt-body', message: 'Write a message of 2 to 2,000 characters, plain text, with only {title}, {requester}, {step} or {link}.' },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setFailed(null);
    try {
      await fn();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${row.label} notice`}
      subtitle="Sent by email and shown in the bell. Values are filled in when it is sent."
      footer={
        <>
          {row.own && (
            <Button loading={busy === 'reset'} onClick={() => void run('reset', onReset)}>
              Use the standard notice
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={() => !early.stop() && void run('save', () => onSave({ subject: subject.trim(), body: body.trim() }))}>
            Save notice
          </Button>
        </>
      }
    >
      <div className="yx-plt-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <FormField id="nt-subject" label="Subject" required error={early.errorOf('nt-subject')}>
          <TextField value={subject} onChange={setSubject} maxLength={150} placeholder="Please approve: {title}" />
        </FormField>
        <FormField id="nt-body" label="Message" required error={early.errorOf('nt-body')} helper="A blank line starts a new paragraph.">
          <TextArea value={body} onChange={setBody} rows={6} maxLength={2000} placeholder="{requester} needs your approval at the {step} step. Open it here: {link}" />
        </FormField>
      </div>
    </Drawer>
  );
}

/** Part 6 (answer 2789): the old hiring routes next to the new rules; only matching types move. */
function MoveCard({ move, canEdit }: { move: NonNullable<LivePolicyEditor['move']>; canEdit: boolean }) {
  const toaster = useToastIfAny();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const rows = move.rows;
  if (!rows || rows.every((r) => r.status === 'none' || r.status === 'moved')) return null;
  const diffs = rows.flatMap((r) => r.differences.map((d, i) => ({ ...d, id: `${r.type}-${i}`, type: r.label })));
  const cols: TableColumn<(typeof diffs)[number]>[] = [
    { key: 'type', header: 'Type', value: (d) => d.type },
    { key: 'step', header: 'Step', value: (d) => d.step },
    { key: 'person', header: 'For a request from', value: (d) => d.person || '—' },
    { key: 'old', header: 'Old route', value: (d) => d.old.join(', ') || 'Skipped' },
    { key: 'new', header: 'New rules', value: (d) => d.new.join(', ') || 'Nobody' },
    { key: 'why', header: 'Why', value: (d) => d.why },
  ];
  const matching = rows.filter((r) => r.status === 'match');
  return (
    <Card
      title="Move from the old hiring routes"
      actions={
        canEdit && matching.length ? (
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setFailed(null);
              try {
                await move.onMove();
                toaster?.toast({ tone: 'success', title: `${matching.map((r) => r.label).join(' and ')} moved to these rules` });
              } catch (e) {
                setFailed(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Move {matching.map((r) => r.label.toLowerCase()).join(' and ')}
          </Button>
        ) : undefined
      }
    >
      <div className="yx-plt-stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <p className="yx-plt-muted">
          {rows.map((r: MoveRow) => `${r.label}: ${r.status === 'match' ? `the same people for all ${r.checked} checked, ready to move` : r.status === 'differs' ? 'some steps give other people, so it stays on the old route until you set its rules here' : r.status === 'moved' ? 'already on these rules' : 'no old route'}`).join('. ')}.
        </p>
        {diffs.length > 0 && <DataTable label="Where the old route and the new rules differ" columns={cols} rows={diffs} getRowId={(d) => d.id} defaultGroupBy={null} />}
      </div>
    </Card>
  );
}
