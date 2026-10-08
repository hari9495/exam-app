import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { ConditionBuilder, emptyRule } from '../../components/condition';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { Card } from '../../components/shell';
import { fromServerGroup, toServerGroup } from '../../lib/forms';
import type { Rule, RuleField } from '../../lib/rules';
import { useRun } from '../org/org-kit';
import { when } from './desk-kit';
import type { DeskRule, DeskRuleAction, DeskRuleSchema, DryRunResult, RuleRun, RuleWebhook } from './esm-types';

// Automation rules of a desk (SD-2.12, US-B-130, US-B-131, US-G-051) on the shared P19 engine: when (a trigger), if
// (conditions on allow-listed fields), then (actions). Recipes install as drafts; a dry run shows which recent tickets
// would match, changing nothing; the run list shows each condition passed or failed and what changed. A rule stops
// at its hourly limit, and a chain of rules stops before it loops.

export interface RulesAdminProps {
  rules: DeskRule[];
  schema: DeskRuleSchema | null;
  webhooks?: RuleWebhook[] | null;
  timeZone?: string;
  onSave: (rule: DeskRule | null, input: { name: string; description?: string; trigger: DeskRule['trigger']; condition: DeskRule['condition']; actions: DeskRuleAction[]; maxRunsPerHour: number; stopAfter: boolean }) => Promise<unknown>;
  onStatus: (rule: DeskRule, status: 'active' | 'paused' | 'retired') => Promise<unknown>;
  onRuns: (rule: DeskRule) => Promise<RuleRun[]>;
  onDryRun: (rule: DeskRule) => Promise<DryRunResult>;
  onInstall: (key: string) => Promise<unknown>;
  /** Webhooks need desk.integration.manage (and a fresh second factor to add one). */
  onAddWebhook?: (input: { name: string; url: string }) => Promise<{ secret: string }>;
  onWebhookActive?: (hook: RuleWebhook, active: boolean) => Promise<unknown>;
}

const STATUS = { draft: { label: 'Draft', tone: 'neutral' }, active: { label: 'On', tone: 'success' }, paused: { label: 'Paused', tone: 'warning' }, retired: { label: 'Retired', tone: 'neutral' } } as const;
const OUTCOME: Record<RuleRun['outcome'], { label: string; tone: 'success' | 'neutral' | 'danger' | 'warning' | 'info' }> = {
  matched: { label: 'Ran', tone: 'success' },
  not_matched: { label: 'Conditions not met', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
  loop_stopped: { label: 'Stopped a loop', tone: 'warning' },
  limit_stopped: { label: 'Over its limit', tone: 'warning' },
  dry_run: { label: 'Dry run', tone: 'info' },
};
const ACTIONS: { value: DeskRuleAction['type']; label: string }[] = [
  { value: 'assign', label: 'Assign to a team' },
  { value: 'set_field', label: 'Set a field' },
  { value: 'add_tag', label: 'Add a tag' },
  { value: 'notify', label: 'Send a message' },
  { value: 'escalate', label: 'Escalate' },
  { value: 'create_task', label: 'Add a task' },
  { value: 'webhook', label: 'Call a webhook' },
];

export function RulesAdmin(props: RulesAdminProps) {
  const [editing, setEditing] = useState<DeskRule | 'new' | null>(null);
  const [runs, setRuns] = useState<{ rule: DeskRule; runs: RuleRun[] } | null>(null);
  const [dry, setDry] = useState<{ rule: DeskRule; result: DryRunResult } | null>(null);
  const { busy, error, run } = useRun();
  const schema = props.schema;
  return (
    <div className="yx-ops-stack">
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      <Card title="Automation rules" actions={<Button icon={Plus} onClick={() => setEditing('new')}>New rule</Button>}>
        {props.rules.length === 0 ? (
          <EmptyState compact title="No rules yet." description="Start from a recipe below, or make your own." />
        ) : (
          <ul className="yx-esm-rules">
            {props.rules.map((r) => (
              <li key={r.id} className="yx-ops-stack">
                <div className="yx-ops-row">
                  <strong>{r.name}</strong>
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  {r.lastWeek && <span className="yx-ops-muted">Last 7 days: ran {r.lastWeek.matched ?? 0}, failed {r.lastWeek.failed ?? 0}</span>}
                </div>
                {r.pausedReason && <InlineAlert tone="warning" title="Paused by itself">{r.pausedReason}</InlineAlert>}
                {r.description && <p className="yx-ops-muted">{r.description}</p>}
                <div className="yx-ops-row">
                  <Button size="sm" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                  {r.status !== 'active' && (
                    <Button size="sm" variant="primary" disabled={busy === r.id} onClick={() => void run(r.id, () => props.onStatus(r, 'active'))}>
                      Switch on
                    </Button>
                  )}
                  {r.status === 'active' && (
                    <Button size="sm" disabled={busy === r.id} onClick={() => void run(r.id, () => props.onStatus(r, 'paused'))}>
                      Pause
                    </Button>
                  )}
                  <Button size="sm" onClick={() => void run(`runs-${r.id}`, async () => setRuns({ rule: r, runs: await props.onRuns(r) }))}>
                    What it did
                  </Button>
                  <Button size="sm" onClick={() => void run(`dry-${r.id}`, async () => setDry({ rule: r, result: await props.onDryRun(r) }))}>
                    Try it on recent tickets
                  </Button>
                  <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => void run(r.id, () => props.onStatus(r, 'retired'))}>
                    Retire
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {schema && schema.recipes.length > 0 && (
        <Card title="Recipes">
          <ul className="yx-esm-cart">
            {schema.recipes.map((rc) => (
              <li key={rc.key} className="yx-ops-row">
                <span className="yx-esm-cart__name">
                  <strong>{rc.name}</strong> <span className="yx-ops-muted">{rc.description}</span>
                </span>
                <Button size="sm" disabled={busy === rc.key} onClick={() => void run(rc.key, () => props.onInstall(rc.key))}>
                  Add as a draft
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {props.webhooks && props.onAddWebhook && <WebhooksCard hooks={props.webhooks} onAdd={props.onAddWebhook} onActive={props.onWebhookActive!} />}
      {editing && schema && <RuleEditor rule={editing === 'new' ? null : editing} schema={schema} onClose={() => setEditing(null)} onSave={async (r, input) => {
            await props.onSave(r, input);
            setEditing(null);
          }} />}
      <Drawer open={Boolean(runs)} onOpenChange={(o) => !o && setRuns(null)} title={`What "${runs?.rule.name ?? ''}" did`} size="lg">
        {runs && (runs.runs.length === 0 ? <EmptyState compact title="It has not run yet." /> : <RunList runs={runs.runs} timeZone={props.timeZone} />)}
      </Drawer>
      <Drawer open={Boolean(dry)} onOpenChange={(o) => !o && setDry(null)} title={`"${dry?.rule.name ?? ''}" on recent tickets`} subtitle={dry ? `${dry.result.matched} of the last ${dry.result.checked} tickets would match. Nothing was changed.` : undefined} size="lg">
        {dry && (
          <ul className="yx-esm-runs">
            {dry.result.records.map((r) => (
              <li key={r.recordId}>
                <div className="yx-ops-row">
                  <strong>{r.label}</strong>
                  <Badge tone={r.match ? 'success' : 'neutral'}>{r.match ? 'Would run' : 'Would not run'}</Badge>
                </div>
                <Trace trace={r.trace} />
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
}

function Trace({ trace }: { trace: RuleRun['trace'] }) {
  if (!trace.length) return <p className="yx-ops-muted">No conditions: it runs every time.</p>;
  return (
    <ul className="yx-esm-trace">
      {trace.map((t) => (
        <li key={t.id} data-pass={t.pass}>
          {t.pass ? 'Passed' : 'Failed'}: {t.label} {t.operator.replace('_', ' ')} {JSON.stringify(t.expected)}
          {t.actual !== null && t.actual !== undefined ? ` (it was ${JSON.stringify(t.actual)})` : ''}
        </li>
      ))}
    </ul>
  );
}

function RunList({ runs, timeZone }: { runs: RuleRun[]; timeZone?: string }) {
  return (
    <ul className="yx-esm-runs">
      {runs.map((r) => (
        <li key={r.id} className="yx-ops-stack">
          <div className="yx-ops-row">
            <Badge tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</Badge>
            <span>{r.ticket ?? 'A ticket you cannot open'}</span>
            <span className="yx-ops-muted">
              {when(r.at, timeZone)} · version {r.ruleVersion}
              {r.depth ? ` · started by another rule` : ''}
            </span>
          </div>
          <Trace trace={r.trace} />
          {r.actions.length > 0 && (
            <ul className="yx-ops-muted">
              {r.actions.map((a, i) => (
                <li key={i}>{a.result}</li>
              ))}
            </ul>
          )}
          {r.error && <p className="yx-ops-muted">{r.error}</p>}
        </li>
      ))}
    </ul>
  );
}

function RuleEditor({ rule, schema, onClose, onSave }: { rule: DeskRule | null; schema: DeskRuleSchema; onClose: () => void; onSave: RulesAdminProps['onSave'] }) {
  const fields: RuleField[] = schema.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }));
  const [name, setName] = useState(rule?.name ?? '');
  const [trigger, setTrigger] = useState<DeskRule['trigger']>(rule?.trigger ?? { type: 'created' });
  const [cond, setCond] = useState<Rule>({ ...emptyRule(), conditions: fromServerGroup(rule?.condition, fields) });
  const [actions, setActions] = useState<DeskRuleAction[]>(rule?.actions ?? [{ type: 'add_tag', tag: '' }]);
  const [limit, setLimit] = useState<number | null>(rule?.maxRunsPerHour ?? 200);
  const [stopAfter, setStopAfter] = useState(rule?.stopAfter ?? false);
  const { busy, error, run } = useRun();
  const t = schema.triggers.find((x) => x.key === trigger.type);
  const setAt = (i: number, patch: Partial<DeskRuleAction>) => setActions(actions.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const groupOpts = schema.groups.map((g) => ({ value: g.id, label: g.name }));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={rule ? `Edit ${rule.name}` : 'New rule'}
      subtitle="Saving makes a new version; the run list keeps which version did what."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || busy === 'save'} onClick={() => void run('save', () => onSave(rule, { name: name.trim(), trigger, condition: toServerGroup(cond.conditions), actions, maxRunsPerHour: limit ?? 200, stopAfter }))}>
            Save
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && (
          <InlineAlert tone="danger" title="Fix this first">
            {error}
          </InlineAlert>
        )}
        <FormField label="Name" required>
          <TextField value={name} onChange={setName} maxLength={100} />
        </FormField>
        <FormField label="When">
          <Select options={schema.triggers.map((x) => ({ value: x.key, label: x.label }))} value={trigger.type} onChange={(type) => type && setTrigger({ type, ...(schema.triggers.find((x) => x.key === type)?.time ? { hours: trigger.hours ?? 24 } : {}) })} />
        </FormField>
        {t?.time && (
          <FormField label="Hours">
            <NumberField value={trigger.hours ?? 24} onChange={(hours) => setTrigger({ ...trigger, hours: hours ?? 24 })} min={1} max={2160} />
          </FormField>
        )}
        {trigger.type === 'updated' && (
          <FormField label="Only when one of these changed" optional>
            <MultiSelect options={fields.filter((f) => ['state', 'priority', 'category', 'group', 'tags', 'type', 'subject'].includes(f.key)).map((f) => ({ value: f.key, label: f.label }))} value={trigger.fields ?? []} onChange={(v) => setTrigger({ ...trigger, fields: v.length ? v : undefined })} />
          </FormField>
        )}
        <ConditionBuilder schema={{ triggers: [], fields, recipients: [] }} value={cond} onChange={setCond} parts={['if']} />
        <Card title="Then">
          {actions.map((a, i) => (
            <div key={i} className="yx-ops-row yx-esm-action">
              <Select aria-label={`Action ${i + 1}`} options={ACTIONS.filter((x) => x.value !== 'webhook' || schema.canUseWebhooks)} value={a.type} onChange={(type) => type && setAt(i, { type: type as DeskRuleAction['type'] })} />
              {a.type === 'assign' && <Select aria-label={`Action ${i + 1} team`} options={groupOpts} value={a.groupId ?? null} onChange={(groupId) => setAt(i, { groupId: groupId ?? undefined })} />}
              {a.type === 'set_field' && (
                <>
                  <Select aria-label={`Action ${i + 1} field`} options={[{ value: 'priority', label: 'Priority' }, { value: 'category', label: 'Category' }, { value: 'type', label: 'Type' }, { value: 'status', label: 'Status' }]} value={a.field ?? null} onChange={(field) => setAt(i, { field: (field ?? undefined) as DeskRuleAction['field'], value: undefined })} />
                  {a.field === 'priority' ? (
                    <Select aria-label={`Action ${i + 1} priority`} options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${p}` }))} value={a.value ? String(a.value) : null} onChange={(v) => setAt(i, { value: v ? Number(v) : undefined })} />
                  ) : a.field ? (
                    <Select aria-label={`Action ${i + 1} value`} options={(a.field === 'category' ? schema.categories : a.field === 'type' ? schema.types : schema.statuses).map((x) => ({ value: x.id, label: x.name }))} value={typeof a.value === 'string' ? a.value : null} onChange={(v) => setAt(i, { value: v ?? undefined })} />
                  ) : null}
                </>
              )}
              {a.type === 'add_tag' && <TextField aria-label={`Action ${i + 1} tag`} value={a.tag ?? ''} onChange={(tag) => setAt(i, { tag })} maxLength={40} />}
              {a.type === 'notify' && (
                <>
                  <Select aria-label={`Action ${i + 1} who`} options={[{ value: 'assignee', label: 'The owner' }, { value: 'group', label: 'The team' }, { value: 'leads', label: 'The leads' }, { value: 'user', label: 'Someone on the desk' }]} value={a.to ?? null} onChange={(to) => setAt(i, { to: (to ?? undefined) as DeskRuleAction['to'] })} />
                  {a.to === 'user' && <Select aria-label={`Action ${i + 1} person`} options={schema.people.map((p) => ({ value: p.id, label: p.name }))} value={a.userId ?? null} onChange={(userId) => setAt(i, { userId: userId ?? undefined })} />}
                  <TextField aria-label={`Action ${i + 1} message`} value={a.message ?? ''} onChange={(message) => setAt(i, { message })} maxLength={300} placeholder="The message" />
                </>
              )}
              {a.type === 'escalate' && (
                <>
                  <Select aria-label={`Action ${i + 1} tier`} options={[{ value: 'L2', label: 'To L2' }, { value: 'L3', label: 'To L3' }]} value={a.tier ?? null} onChange={(tier) => setAt(i, { tier: (tier ?? undefined) as DeskRuleAction['tier'] })} />
                  <Select aria-label={`Action ${i + 1} team`} options={groupOpts} value={a.groupId ?? null} onChange={(groupId) => setAt(i, { groupId: groupId ?? undefined })} clearable placeholder="Same team" />
                </>
              )}
              {a.type === 'create_task' && (
                <>
                  <TextField aria-label={`Action ${i + 1} task`} value={a.title ?? ''} onChange={(title) => setAt(i, { title })} maxLength={200} placeholder="What to do" />
                  <Select aria-label={`Action ${i + 1} team`} options={groupOpts} value={a.groupId ?? null} onChange={(groupId) => setAt(i, { groupId: groupId ?? undefined })} clearable placeholder="No team" />
                  <NumberField aria-label={`Action ${i + 1} hours`} value={a.olaHours ?? null} onChange={(n) => setAt(i, { olaHours: n ?? undefined })} min={1} max={720} />
                </>
              )}
              {a.type === 'webhook' && <Select aria-label={`Action ${i + 1} webhook`} options={schema.webhooks.map((w) => ({ value: w.id, label: w.name }))} value={a.webhookId ?? null} onChange={(webhookId) => setAt(i, { webhookId: webhookId ?? undefined })} />}
              <IconButton icon={Trash2} label={`Remove action ${i + 1}`} disabled={actions.length <= 1} onClick={() => setActions(actions.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" icon={Plus} disabled={actions.length >= 10} onClick={() => setActions([...actions, { type: 'add_tag', tag: '' }])}>
            Add an action
          </Button>
        </Card>
        <div className="yx-ops-row">
          <FormField label="Most runs in an hour">
            <NumberField value={limit} onChange={setLimit} min={1} max={10000} />
          </FormField>
          <Checkbox label="Stop the rules after this one when it runs" checked={stopAfter} onChange={setStopAfter} />
        </div>
      </div>
    </Drawer>
  );
}

function WebhooksCard({ hooks, onAdd, onActive }: { hooks: RuleWebhook[]; onAdd: NonNullable<RulesAdminProps['onAddWebhook']>; onActive: NonNullable<RulesAdminProps['onWebhookActive']> }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  return (
    <Card title="Webhooks rules may call">
      <p className="yx-ops-muted">Only https addresses on the public internet. Each call is signed with a secret you see once; it carries ticket ids and fields, never message text.</p>
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {secret && (
        <InlineAlert tone="success" title="Copy the signing secret now">
          <code>{secret}</code>. It will not be shown again.
        </InlineAlert>
      )}
      <ul className="yx-esm-cart">
        {hooks.map((h) => (
          <li key={h.id} className="yx-ops-row">
            <span className="yx-esm-cart__name">
              {h.name} <span className="yx-ops-muted">{h.url}</span>
            </span>
            <Badge tone={h.active ? 'success' : 'neutral'}>{h.active ? 'On' : 'Off'}</Badge>
            <Button size="sm" disabled={busy === h.id} onClick={() => void run(h.id, () => onActive(h, !h.active))}>
              {h.active ? 'Switch off' : 'Switch on'}
            </Button>
          </li>
        ))}
      </ul>
      <div className="yx-ops-row">
        <TextField aria-label="Webhook name" placeholder="Name" value={name} onChange={setName} maxLength={100} />
        <TextField aria-label="Webhook address" placeholder="https://" value={url} onChange={setUrl} maxLength={500} />
        <Button
          disabled={!name.trim() || !url.trim() || busy === 'add'}
          onClick={() =>
            void run('add', async () => {
              setSecret((await onAdd({ name: name.trim(), url: url.trim() })).secret);
              setName('');
              setUrl('');
            })
          }
        >
          Add webhook
        </Button>
      </div>
    </Card>
  );
}
