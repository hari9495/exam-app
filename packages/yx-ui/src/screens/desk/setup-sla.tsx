import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Switch } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { Card } from '../../components/shell';
import { useRun } from '../org/org-kit';
import { minutesText, when } from './desk-kit';
import type { Calendar, ComplianceReport, DeskDetail, DeskTemplates, DuplicatePerson, SlaPolicyView, SlaSetup, SlaTarget } from './types';

// Desk set-up, batch 2: response targets (SLA and OLA policies with versions, monthly targets and the month's
// compliance, SD-1.14 … SD-1.17), resolution codes and templates (SD-1.10), and HR's possible-duplicate list
// (founder decision 8 Oct 2026). Plain words; every save is checked on the server.

const METRICS: Record<'sla' | 'ola', { value: string; label: string }[]> = {
  sla: [
    { value: 'assign', label: 'Time to assign' },
    { value: 'first_response', label: 'First response' },
    { value: 'next_response', label: 'Next response' },
    { value: 'resolution', label: 'Resolution' },
  ],
  ola: [
    { value: 'group', label: 'Team hand-off' },
    { value: 'task', label: 'Team task' },
  ],
};
const metricLabel = (m: string) => [...METRICS.sla, ...METRICS.ola].find((x) => x.value === m)?.label ?? m;
const PAUSE = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Waiting on requester' },
  { value: 'on_hold', label: 'On hold' },
];

export interface SlaTabProps {
  detail: DeskDetail;
  calendars: Calendar[];
  setup: SlaSetup | null;
  compliance: ComplianceReport | null;
  month: string;
  onMonth: (month: string) => void;
  onCreatePolicy: (input: PolicyInput & { name: string; kind: 'sla' | 'ola' }) => Promise<void>;
  onAddVersion: (policyId: string, input: PolicyInput) => Promise<void>;
  onUpdatePolicy: (policyId: string, change: { version: number; active?: boolean; sortOrder?: number }) => Promise<void>;
  onSaveTargets: (targets: { metric: string; priority: number | null; targetPercent: number }[]) => Promise<void>;
}

export interface PolicyInput {
  scope: { match: 'all' | 'any'; rules: { field: string; op: 'in' | 'not_in'; values: string[] }[] };
  calendarSource: 'desk' | 'calendar';
  calendarId?: string;
  targets: SlaTarget[];
  pauseStates: string[];
  recount: 'keep' | 'retroactive';
  validFrom?: string;
}

/** One policy form: targets in minutes per priority, which tickets, which hours, when the clock pauses. */
function PolicyForm({ kind, detail, calendars, initial, onSave, saveLabel }: { kind: 'sla' | 'ola'; detail: DeskDetail; calendars: Calendar[]; initial?: SlaPolicyView['versions'][number]; onSave: (i: PolicyInput) => Promise<void>; saveLabel: string }) {
  const { busy, error, run } = useRun();
  const [rows, setRows] = useState<SlaTarget[]>(initial?.targets ?? [{ metric: kind === 'sla' ? 'first_response' : 'group', minutes: [30, 60, 240, 480] }, ...(kind === 'sla' ? [{ metric: 'resolution', minutes: [240, 480, 1440, 2880] }] : [])]);
  const [source, setSource] = useState<'desk' | 'calendar'>(initial?.calendarSource === 'calendar' ? 'calendar' : 'desk');
  const [calendarId, setCalendarId] = useState<string | null>(initial?.calendarId ?? null);
  const [priorities, setPriorities] = useState<string[]>(initial?.scope.rules.find((r) => r.field === 'priority')?.values ?? []);
  const [categories, setCategories] = useState<string[]>(initial?.scope.rules.find((r) => r.field === 'category')?.values ?? []);
  const [pause, setPause] = useState<string[]>(initial?.pauseStates ?? ['pending', 'on_hold']);
  const [recount, setRecount] = useState<'keep' | 'retroactive'>(initial?.recount === 'retroactive' ? 'retroactive' : 'keep');
  const [from, setFrom] = useState('');
  const set = (i: number, t: SlaTarget) => setRows(rows.map((r, j) => (j === i ? t : r)));
  const free = METRICS[kind].filter((m) => !rows.some((r) => r.metric === m.value));
  const ok = rows.length > 0 && rows.every((r) => r.minutes.some((m) => m !== null)) && (source === 'desk' || calendarId);
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <table className="yx-desk-matrix">
        <caption>Targets in minutes of working time (leave empty for no target at that priority)</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            {[1, 2, 3, 4].map((p) => (
              <th key={p} scope="col">
                P{p}
              </th>
            ))}
            <th scope="col">
              <span className="yx-visually-hidden">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.metric}>
              <th scope="row">{metricLabel(r.metric)}</th>
              {r.minutes.map((m, p) => (
                <td key={p}>
                  <NumberField size="sm" aria-label={`${metricLabel(r.metric)} P${p + 1} minutes`} value={m} min={1} max={525600} onChange={(v) => set(i, { ...r, minutes: r.minutes.map((x, q) => (q === p ? v : x)) })} />
                </td>
              ))}
              <td>
                <Button size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {free.length > 0 && (
        <span className="yx-ops-row">
          {free.map((m) => (
            <Button key={m.value} size="sm" icon={Plus} onClick={() => setRows([...rows, { metric: m.value, minutes: [60, 120, 480, 960] }])}>
              {m.label}
            </Button>
          ))}
        </span>
      )}
      <p className="yx-ops-muted">Milestones: the owner is warned at 75 % and the owner and team leads are told at 100 % (missed). The timeline of each ticket shows them.</p>
      <FormField label="Business hours">
        <Segment label="Business hours" options={[{ value: 'desk', label: 'The desk’s calendar' }, { value: 'calendar', label: 'Another calendar' }]} value={source} onChange={setSource} />
      </FormField>
      {source === 'calendar' && (
        <FormField label="Calendar" required>
          <Select value={calendarId} onChange={setCalendarId} options={calendars.map((c) => ({ value: c.id, label: `${c.name} · ${c.timeZone}` }))} />
        </FormField>
      )}
      <FormField label="Only these priorities" optional helper="Empty: every priority.">
        <MultiSelect value={priorities} onChange={setPriorities} options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${p}` }))} placeholder="Every priority" />
      </FormField>
      <FormField label="Only these categories" optional helper="Empty: every category. A ticket must match both choices.">
        <MultiSelect value={categories} onChange={setCategories} options={detail.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} placeholder="Every category" />
      </FormField>
      <FormField label="The clock pauses while the ticket is" optional>
        <MultiSelect value={pause} onChange={setPause} options={PAUSE} />
      </FormField>
      <FormField label="When a ticket moves to this policy" helper="From another policy, or when this policy is added later.">
        <Segment label="When a ticket moves to this policy" options={[{ value: 'keep', label: 'Keep time used' }, { value: 'retroactive', label: 'Count from when raised' }]} value={recount} onChange={setRecount} />
      </FormField>
      {initial && (
        <FormField label="Starts" optional helper="Empty: now. Tickets already counting keep the old version.">
          <TextField type="datetime-local" value={from} onChange={setFrom} />
        </FormField>
      )}
      <div className="yx-ops-row">
        <Button
          variant="primary"
          disabled={!ok}
          loading={busy === 'save'}
          onClick={() =>
            void run('save', () =>
              onSave({
                scope: { match: 'all', rules: [...(priorities.length ? [{ field: 'priority', op: 'in' as const, values: priorities }] : []), ...(categories.length ? [{ field: 'category', op: 'in' as const, values: categories }] : [])] },
                calendarSource: source,
                ...(source === 'calendar' ? { calendarId: calendarId! } : {}),
                targets: rows,
                pauseStates: pause,
                recount,
                ...(from ? { validFrom: new Date(from).toISOString() } : {}),
              }),
            )
          }
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function SlaTab(p: SlaTabProps) {
  const { busy, error, run } = useRun();
  const [adding, setAdding] = useState<'sla' | 'ola' | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const can = p.detail.canSetUp;
  const policies = p.setup?.policies ?? [];
  return (
    <div className="yx-ops-stack">
      <p className="yx-ops-muted">Response targets (SLA) are promises to requesters; team targets (OLA) are promises between teams. Policies are checked in order; the first that fits a ticket wins and the ticket keeps that version.</p>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {policies.length === 0 && <EmptyState compact title="No response targets yet." />}
      {policies.map((pol) => {
        const v = pol.versions[0];
        return (
          <Card key={pol.id} title={`${pol.name} · ${pol.kind === 'sla' ? 'Response targets' : 'Team targets'} · version ${v?.version ?? 1}`}>
            <div className="yx-ops-stack" data-gap="sm">
              <span className="yx-ops-row">
                {pol.active ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}
                <span className="yx-ops-muted">From {v ? when(v.validFrom) : '—'} · order {pol.sortOrder}</span>
              </span>
              <ul className="yx-ops-list">
                {(v?.targets ?? []).map((t) => (
                  <li key={t.metric} className="yx-ops-list__item">
                    {metricLabel(t.metric)}: {t.minutes.map((m, i) => `P${i + 1} ${m ? minutesText(m) : '—'}`).join(' · ')}
                  </li>
                ))}
              </ul>
              {can && (
                <span className="yx-ops-row">
                  <Switch label="On" checked={pol.active} onChange={(a) => void run(`a-${pol.id}`, () => p.onUpdatePolicy(pol.id, { version: pol.version, active: a }))} />
                  <Button size="sm" onClick={() => setEditing(editing === pol.id ? null : pol.id)}>
                    {editing === pol.id ? 'Close' : 'New version'}
                  </Button>
                </span>
              )}
              {editing === pol.id && <PolicyForm kind={pol.kind} detail={p.detail} calendars={p.calendars} initial={v} saveLabel="Save new version" onSave={async (i) => { await p.onAddVersion(pol.id, i); setEditing(null); }} />}
            </div>
          </Card>
        );
      })}
      {can && !adding && (
        <span className="yx-ops-row">
          <Button icon={Plus} onClick={() => setAdding('sla')}>
            New response targets
          </Button>
          <Button icon={Plus} onClick={() => setAdding('ola')}>
            New team targets
          </Button>
        </span>
      )}
      {adding && (
        <Card title={adding === 'sla' ? 'New response targets (SLA)' : 'New team targets (OLA)'}>
          <div className="yx-ops-stack">
            <FormField label="Name" required>
              <TextField value={name} onChange={setName} maxLength={100} />
            </FormField>
            <PolicyForm kind={adding} detail={p.detail} calendars={p.calendars} saveLabel="Save policy" onSave={async (i) => { if (!name.trim()) throw new Error('Give the policy a name.'); await p.onCreatePolicy({ ...i, name: name.trim(), kind: adding }); setAdding(null); setName(''); }} />
            <Button onClick={() => setAdding(null)}>Cancel</Button>
          </div>
        </Card>
      )}
      <ComplianceCard {...p} />
      {busy && <span className="yx-visually-hidden">Saving</span>}
    </div>
  );
}

/** US-G-015: monthly targets, the month so far and an at-risk warning. */
function ComplianceCard(p: SlaTabProps) {
  const { busy, error, run } = useRun();
  const [rows, setRows] = useState(p.setup?.complianceTargets ?? []);
  const can = p.detail.canSetUp;
  return (
    <Card title="Monthly targets">
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        <FormField label="Month">
          <TextField type="month" value={p.month} onChange={(m) => m && p.onMonth(m)} />
        </FormField>
        {p.compliance && p.compliance.lines.length ? (
          <table className="yx-desk-matrix">
            <caption>Kept on time this month (left-out tickets are not counted)</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Priority</th>
                <th scope="col">On time</th>
                <th scope="col">Missed</th>
                <th scope="col">Still open</th>
                <th scope="col">Target</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {p.compliance.lines.map((l) => (
                <tr key={`${l.metric}-${l.priority}`}>
                  <th scope="row">{l.label}</th>
                  <td>{l.priority ? `P${l.priority}` : 'All'}</td>
                  <td>{l.percent === null ? '—' : `${l.percent} % (${l.kept})`}</td>
                  <td>{l.missed}</td>
                  <td>{l.open}</td>
                  <td>{l.target === null ? '—' : `${l.target} %`}</td>
                  <td>{l.atRisk ? <Badge tone="danger">At risk</Badge> : l.target !== null ? <Badge tone="success">On track</Badge> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="yx-ops-muted">Nothing measured this month yet.</p>
        )}
        {can && (
          <>
            {rows.map((r, i) => (
              <span key={i} className="yx-ops-row">
                <Select size="sm" aria-label="Measure" value={r.metric} onChange={(v) => v && setRows(rows.map((x, j) => (j === i ? { ...x, metric: v } : x)))} options={METRICS.sla} />
                <Select size="sm" aria-label="Priority" value={r.priority === null ? 'all' : String(r.priority)} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, priority: v && v !== 'all' ? Number(v) : null } : x)))} options={[{ value: 'all', label: 'All priorities' }, ...[1, 2, 3, 4].map((x) => ({ value: String(x), label: `P${x}` }))]} />
                <NumberField size="sm" aria-label="Target percent" value={r.targetPercent} min={1} max={100} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, targetPercent: v ?? 0 } : x)))} />
                <Button size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </span>
            ))}
            <span className="yx-ops-row">
              <Button size="sm" icon={Plus} onClick={() => setRows([...rows, { metric: 'resolution', priority: null, targetPercent: 95 }])}>
                Add a target
              </Button>
              <Button size="sm" variant="primary" loading={busy === 'targets'} disabled={rows.some((r) => !r.targetPercent || r.targetPercent > 100)} onClick={() => void run('targets', () => p.onSaveTargets(rows))}>
                Save targets
              </Button>
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

export interface WorkSetupProps {
  detail: DeskDetail;
  templates: DeskTemplates | null;
  onSaveCode: (id: string | null, input: { code: string; label: string; active?: boolean }) => Promise<void>;
  onSaveTemplate: (id: string | null, input: { name: string; defaults: { categoryId?: string; tags?: string[] }; checklist: string[]; active?: boolean }) => Promise<void>;
}

/** YX-SD-11 resolution codes and US-G-001 templates with checklists. */
export function WorkSetupTab(p: WorkSetupProps) {
  const { busy, error, run } = useRun();
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [lines, setLines] = useState('');
  const can = p.detail.canSetUp;
  const code = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return (
    <div className="yx-ops-stack">
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <Card title="Resolution codes">
        <div className="yx-ops-stack" data-gap="sm">
          {(p.templates?.resolutionCodes ?? []).map((c) => (
            <span key={c.id} className="yx-ops-row">
              <span>{c.label}</span>
              {can && <Switch label="In use" checked={c.active} onChange={(a) => void run(`c-${c.id}`, () => p.onSaveCode(c.id, { code: c.code, label: c.label, active: a }))} />}
            </span>
          ))}
          {can && (
            <span className="yx-ops-row">
              <TextField size="sm" aria-label="New resolution code" placeholder="e.g. Fixed" value={label} onChange={setLabel} maxLength={100} />
              <Button size="sm" disabled={!code} loading={busy === 'code'} onClick={() => void run('code', async () => { await p.onSaveCode(null, { code, label: label.trim() }); setLabel(''); })}>
                Add code
              </Button>
            </span>
          )}
        </div>
      </Card>
      <Card title="Templates">
        <div className="yx-ops-stack" data-gap="sm">
          {(p.templates?.templates ?? []).map((x) => (
            <div key={x.id}>
              <strong>{x.name}</strong> {!x.active && <Badge tone="neutral">Off</Badge>}
              <p className="yx-ops-muted">{x.checklist.length ? `Checklist: ${x.checklist.join(' · ')}` : 'No checklist'}</p>
            </div>
          ))}
          {can && (
            <>
              <FormField label="Template name">
                <TextField size="sm" value={name} onChange={setName} maxLength={100} />
              </FormField>
              <FormField label="Category" optional>
                <Select size="sm" value={category} onChange={setCategory} clearable options={p.detail.categories.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} />
              </FormField>
              <FormField label="Checklist" optional helper="One step per line (up to 30).">
                <TextArea value={lines} onChange={setLines} rows={4} />
              </FormField>
              <div className="yx-ops-row">
                <Button size="sm" disabled={!name.trim()} loading={busy === 'tpl'} onClick={() => void run('tpl', async () => { await p.onSaveTemplate(null, { name: name.trim(), defaults: category ? { categoryId: category } : {}, checklist: lines.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 30) }); setName(''); setLines(''); })}>
                  Add template
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Founder decision 8 Oct 2026: logins that got a new person on their first ticket, with the person they may be. */
export function DuplicatesCard({ rows, onLink }: { rows: DuplicatePerson[]; onLink: (personId: string, intoPersonId: string) => Promise<void> }) {
  const { busy, error, run } = useRun();
  return (
    <Card title="Possible duplicate people">
      <div className="yx-ops-stack" data-gap="sm">
        <p className="yx-ops-muted">These logins raised a ticket before they were linked to a person, so the Service Desk made a new person. We never link by email on our own: check each one and link it if it is the same person. Their tickets move with them.</p>
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        {rows.length === 0 ? (
          <p className="yx-ops-muted">Nothing to check.</p>
        ) : (
          <ul className="yx-ops-list" aria-label="Possible duplicate people">
            {rows.map((r) => (
              <li key={`${r.personId}-${r.possibleMatch.personId}`} className="yx-ops-list__item">
                <span className="yx-ops-list__main">
                  <span>
                    {r.name} ({r.loginEmail}) may be {r.possibleMatch.name}
                    {r.possibleMatch.employeeCode ? ` · ${r.possibleMatch.employeeCode}` : ''}
                  </span>
                  <span className="yx-ops-list__sub">
                    {r.tickets} ticket{r.tickets === 1 ? '' : 's'}
                  </span>
                </span>
                <Button size="sm" loading={busy === r.personId} onClick={() => void run(r.personId, () => onLink(r.personId, r.possibleMatch.personId))}>
                  Link to {r.possibleMatch.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
