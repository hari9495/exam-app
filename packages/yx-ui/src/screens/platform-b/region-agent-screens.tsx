// P21 / P02 region screens (PLT-45, PLT-46), P10 agent screens (PLT-47, PLT-48) and EOR connector set-up (PLT-49).
import { useState } from 'react';
import { ArrowRight, Globe2, Lock, MessageSquare, Undo2 } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Icon } from '../../components/foundations';
import { AiBadge, Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar } from '../../components/filters';
import { Card, DescriptionList, ObjectHeader, PageHeader } from '../../components/shell';
import { FormField } from '../../components/field';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { TextArea } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { ConfirmDialog } from '../../components/overlay';
import { Stepper } from '../../components/stepper';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { DesktopFrame, PhoneFrame } from '../_kit/frames';
import { SettingsFrame } from './platform-b-kit';

/* ================================================================== shared: regions */

export interface Region {
  code: string;
  name: string;
  status: 'live' | 'planned';
  inCountry?: boolean;
  countries: string[];
  x: number;
  y: number;
}

export const REGIONS: Region[] = [
  { code: 'IN', name: 'India (Mumbai, DR Hyderabad)', status: 'live', countries: ['India'], x: 300, y: 120 },
  { code: 'ME-AE', name: 'UAE, in-country', status: 'live', inCountry: true, countries: ['United Arab Emirates'], x: 232, y: 104 },
  { code: 'ME-SA', name: 'Saudi Arabia, in-country', status: 'planned', inCountry: true, countries: ['Saudi Arabia'], x: 210, y: 110 },
  { code: 'EU', name: 'European Union (Frankfurt)', status: 'live', countries: ['Germany', 'Netherlands', 'Ireland'], x: 160, y: 56 },
  { code: 'US', name: 'United States', status: 'planned', countries: ['United States'], x: 50, y: 76 },
  { code: 'SG', name: 'Singapore', status: 'live', countries: ['Singapore', 'Malaysia'], x: 372, y: 150 },
];

/** P21 YX-GLB-01 / P01 YX-ORG-30: a region can hold an entity only when live and serving its country. */
export function regionsFor(country: string) {
  return REGIONS.filter((r) => r.status === 'live' && r.countries.includes(country));
}

/** P02 YX-SEC-38: moves out of an in-country region need a recorded lawful transfer route. */
export function canMoveRegion(from: string, to: string, lawfulRoute?: string): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: 'Choose a different region.' };
  const target = REGIONS.find((r) => r.code === to);
  if (!target || target.status !== 'live') return { ok: false, reason: `${target?.name ?? to} is not live yet.` };
  if (REGIONS.find((r) => r.code === from)?.inCountry && !lawfulRoute) return { ok: false, reason: 'Data can leave an in-country region only with a recorded lawful transfer route.' };
  return { ok: true };
}

/** Plain SVG "map preview": region pins, planned regions grey, optional move route. */
export function RegionMap({ current, target }: { current: string[]; target?: string }) {
  const at = (c: string) => REGIONS.find((r) => r.code === c)!;
  return (
    <svg className="yxp-region-map" viewBox="0 0 420 200" role="img" aria-label={`Map preview. Data regions: ${current.join(', ')}${target ? `, moving to ${target}` : ''}`}>
      <rect className="land" x="20" y="30" width="120" height="90" rx="12" />
      <rect className="land" x="140" y="30" width="110" height="60" rx="12" />
      <rect className="land" x="190" y="80" width="200" height="100" rx="12" />
      {target && current[0] && <path className="route" d={`M${at(current[0]).x},${at(current[0]).y} Q${(at(current[0]).x + at(target).x) / 2},20 ${at(target).x},${at(target).y}`} />}
      {REGIONS.map((r) => (
        <g key={r.code}>
          <circle className="pin" cx={r.x} cy={r.y} r={current.includes(r.code) || r.code === target ? 7 : 4} data-planned={r.status === 'planned' || undefined} />
          <text x={r.x + 9} y={r.y + 4}>
            {r.code}
            {r.status === 'planned' ? ' (planned)' : ''}
          </text>
        </g>
      ))}
      <text x="20" y="196">
        Map preview
      </text>
    </svg>
  );
}

/* ================================================================== PLT-45 Entity data region */

export interface EntityRegion {
  id: string;
  name: string;
  country: string;
  region: string | null;
  employees: number;
  moving?: string;
}

// PLT-45
export function EntityDataRegionScreen({ entities, selected, choosing }: { entities: EntityRegion[]; selected: string; choosing?: boolean }) {
  const e = entities.find((x) => x.id === selected)!;
  const [pick, setPick] = useState<string | null>(null);
  const options = regionsFor(e.country).map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }));
  const multi = new Set(entities.map((x) => x.region).filter(Boolean)).size > 1;
  const cols: TableColumn<EntityRegion>[] = [
    { key: 'name', header: 'Legal entity', value: (x) => x.name, render: (x) => <strong>{x.name}</strong> },
    { key: 'country', header: 'Country', value: (x) => x.country },
    { key: 'region', header: 'Data region', value: (x) => x.region ?? '', render: (x) => (x.region ? <span className="yxp-row"><Icon icon={Lock} /> {x.region}{x.moving ? ` → ${x.moving} (move scheduled)` : ''}</span> : <Badge tone="warning">Not set</Badge>) },
    { key: 'emp', header: 'Employees', type: 'number', value: (x) => x.employees },
  ];
  return (
    <SettingsFrame active="Legal entities">
      <PageHeader title="Legal entities" description="Each entity's people data lives in its data region. The home region holds company settings, users and billing." facts={`Home region IN${multi ? ' · multi-region company' : ''}`} />
      <DataTable label="Legal entities and data regions" columns={cols} rows={entities} getRowId={(x) => x.id} activeRowId={selected} onRowClick={() => {}} />
      <Card
        title={`${e.name} · data region`}
        actions={e.region && !choosing ? <Button icon={Globe2}>Move region</Button> : undefined}
      >
        <div className="yxp-split">
          <div className="yxp-stack">
            {choosing ? (
              <>
                <FormField label="Data region" required helper="Fixed once saved. Only live regions that serve this country are listed." error={options.length === 0 ? `No live region serves ${e.country} yet. The entity can't be created until one does.` : null}>
                  <Select options={options} value={pick} onChange={setPick} placeholder="Choose a region" />
                </FormField>
                <InlineAlert tone="warning" title="You can't change this later without a region move">
                  A move needs a request, YukthiX approval and a planned freeze of up to 24 hours.
                </InlineAlert>
              </>
            ) : (
              <DescriptionList
                items={[
                  { label: 'Data region', value: <span className="yxp-row"><Icon icon={Lock} /> {e.region} · {REGIONS.find((r) => r.code === e.region)?.name} · read-only</span> },
                  { label: 'What stays here', value: 'Records, files, backups, search index, analytics snapshots, AI processing' },
                  { label: 'Copied to the home region', value: multi ? 'Directory card only (name, job title, work email)' : 'Nothing: same as home region' },
                  { label: 'Special data', value: 'Never leaves this region' },
                ]}
              />
            )}
            {e.moving && <InlineAlert tone="info" title={`Move to ${e.moving} scheduled`}>See the region-move request for dates and status.</InlineAlert>}
          </div>
          <RegionMap current={[...new Set(entities.map((x) => x.region).filter((x): x is string => Boolean(x)))]} target={e.moving ?? pick ?? undefined} />
        </div>
      </Card>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-46 Region-move request */

export type MoveStage = 'draft' | 'requested' | 'approved' | 'copying' | 'verified' | 'cut-over' | 'source-deleted' | 'refused';
const STAGES: { id: MoveStage; label: string }[] = [
  { id: 'requested', label: 'Requested by System Admin' },
  { id: 'approved', label: 'Approved by YukthiX, legal check done' },
  { id: 'copying', label: 'Freeze and copy' },
  { id: 'verified', label: 'Verified: checksums and row counts match' },
  { id: 'cut-over', label: 'Cut over to the new region' },
  { id: 'source-deleted', label: 'Source deleted, certificate issued' },
];

// PLT-46
export function RegionMoveScreen({ stage, from = 'IN', to = 'ME-AE', entity = 'Kaveri Foods FZE (Dubai)', lawfulRoute }: { stage: MoveStage; from?: string; to?: string; entity?: string; lawfulRoute?: string }) {
  const [target, setTarget] = useState<string | null>(to);
  const [basis, setBasis] = useState('The entity now has its own employees in the UAE; local law requires in-country hosting.');
  const [ack, setAck] = useState(stage !== 'draft');
  const check = target ? canMoveRegion(from, target, lawfulRoute) : null;
  const idx = STAGES.findIndex((s) => s.id === stage);
  const statusTone: BadgeTone = stage === 'refused' ? 'danger' : stage === 'source-deleted' ? 'success' : stage === 'draft' ? 'neutral' : 'info';
  return (
    <SettingsFrame active="Legal entities">
      <ObjectHeader
        name={`Region move · ${entity}`}
        icon={Globe2}
        status={<Badge tone={statusTone}>{stage === 'draft' ? 'Draft' : stage === 'refused' ? 'Refused' : STAGES[idx]?.label ?? stage}</Badge>}
        facts={[
          { label: 'From', value: from },
          { label: 'To', value: target ?? '—' },
          { label: 'Employees', value: 18 },
          { label: 'Freeze window', value: 'Sat 17 Oct 2026, 10 pm – Sun 18 Oct 2026, 8 pm' },
        ]}
      />
      <div className="yxp-split">
        <div className="yxp-stack">
          {stage === 'draft' ? (
            <Card title="Request">
              <div className="yxp-stack">
                <FormField label="Move to" required error={check && !check.ok ? check.reason : null}>
                  <Select options={REGIONS.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}${r.status === 'planned' ? ' (planned)' : ''}` }))} value={target} onChange={setTarget} />
                </FormField>
                <FormField label="Legal basis" required helper="Recorded with the request and checked by YukthiX.">
                  <TextArea value={basis} onChange={setBasis} rows={3} />
                </FormField>
                <FormField label="Preferred start" helper="Outside the payroll-critical window (25th to 5th). The freeze lasts at most 24 hours.">
                  <DatePicker value={new Date(2026, 9, 17)} onChange={() => {}} />
                </FormField>
              </div>
            </Card>
          ) : (
            <Card title="Status">
              {stage === 'refused' ? (
                <InlineAlert tone="danger" title="YukthiX refused this move">
                  Data can leave an in-country region only with a recorded lawful transfer route. Add the route to the request and send it again.
                </InlineAlert>
              ) : (
                <ol className="yxp-plain" aria-label="Move stages">
                  {STAGES.map((s, i) => (
                    <li key={s.id} className="yxp-row">
                      <Badge tone={i < idx ? 'success' : i === idx ? 'info' : 'neutral'}>{i < idx ? 'Done' : i === idx ? 'Now' : 'Next'}</Badge>
                      {s.label}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
          <Card title="Impact">
            <DescriptionList
              items={[
                { label: 'Moves', value: 'Employee records, documents, payslips, backups, search index, analytics snapshots' },
                { label: 'Does not move', value: 'Company settings, users, billing (home region IN); legal holds move with the data' },
                { label: 'During the freeze', value: 'Employees can view but not change data; check-ins queue on the phone and sync after' },
                { label: 'Afterwards', value: 'Data processing annex and sub-processor notice updated; privacy notice for 18 employees updated before cut-over' },
              ]}
            />
          </Card>
        </div>
        <aside className="yxp-stack" aria-label="Notice and map">
          <RegionMap current={[from]} target={target ?? undefined} />
          <Card title="Region-move notice (G-39)">
            <div className="yxp-stack">
            <p className="yxp-muted">The notice tells your admins what moves, when, the downtime and the rollback plan. Employees get your version under Me › My data.</p>
            <p className="yxp-muted"><Link href="#">Read the notice</Link></p>
            <Checkbox label="I have read the notice and acknowledge it for Kaveri Foods Pvt Ltd" checked={ack} onChange={setAck} disabled={stage !== 'draft'} />
            </div>
          </Card>
          {stage === 'draft' && (
            <ConfirmDialog
              trigger={
                <Button variant="primary" disabled={!ack || !check?.ok}>
                  Send request
                </Button>
              }
              title={`Request a move of ${entity} to ${target}?`}
              consequence="YukthiX reviews the legal basis within 2 working days. Nothing moves until approved and scheduled."
              confirmLabel="Send request"
              onConfirm={() => {}}
            />
          )}
          {stage === 'source-deleted' && <Button icon={ArrowRight}>Download deletion certificate</Button>}
        </aside>
      </div>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-47 Copilot action card */

export interface CopilotAction {
  title: string;
  changes: { field: string; value: string; masked?: boolean }[];
  dataUsed: string[];
  /** The request would need approval or pay rights: send to the app instead. */
  notAllowed?: string;
  confirmed?: boolean;
  noCredits?: boolean;
}

function ActionCard({ a, channel }: { a: CopilotAction; channel: 'web' | 'chat' | 'whatsapp' }) {
  return (
    <section className="yxp-plan" data-compact aria-label="Prepared action">
      <header className="yxp-plan__head">
        <h3 className="yxp-plan__title">{a.notAllowed ? 'Open the app to do this' : a.confirmed ? 'Submitted' : 'Check and confirm'}</h3>
        <AiBadge />
      </header>
      {a.notAllowed ? (
        <>
          <p>{a.notAllowed}</p>
          <Button icon={ArrowRight}>Open approvals in YukthiX</Button>
        </>
      ) : a.noCredits ? (
        <>
          <p>Your company has used this month's AI allowance. You can still do this in the app; nothing you asked for is lost.</p>
          <Button icon={ArrowRight}>Apply leave in YukthiX</Button>
        </>
      ) : (
        <>
          <p className="yxp-plan__action">{a.title}</p>
          <dl className="yxp-stack yxp-stack--tight">
            {a.changes.map((c) => (
              <div key={c.field} className="yxp-row yxp-row--between">
                <dt className="yxp-muted">{c.field}</dt>
                <dd>{c.masked && channel === 'whatsapp' ? '•••• (open the app to see)' : c.value}</dd>
              </div>
            ))}
          </dl>
          <p className="yxp-muted">Data used: {a.dataUsed.join(' · ')}</p>
          {a.confirmed ? (
            <InlineAlert tone="success" title="Request LR-2317 submitted. Karthik Subramanian will be asked to approve." />
          ) : (
            <div className="yxp-plan__foot">
              <Button>Cancel</Button>
              <Button>Edit</Button>
              <Button variant="primary">Confirm</Button>
            </div>
          )}
          <p className="yxp-muted">Nothing is submitted until you confirm.</p>
        </>
      )}
    </section>
  );
}

// PLT-47 web
export function CopilotActionWeb({ action }: { action: CopilotAction }) {
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={[{ items: [{ label: 'Home', active: true }, { label: 'Approvals' }, { label: 'Notifications' }] }]}>
      <PageHeader title="Ask YukthiX" />
      <div className="yxp-chat">
        <div className="yxp-chat__body">
          <p className="yxp-chat__msg">Apply 2 days casual leave on 8 and 9 Oct</p>
          <ActionCard a={action} channel="web" />
        </div>
      </div>
    </DesktopFrame>
  );
}

// PLT-47 phone
export function CopilotActionPhone({ action }: { action: CopilotAction }) {
  return (
    <PhoneFrame tab="home" title="Ask YukthiX">
      <p className="yxp-chat__msg">Apply 2 days casual leave on 8 and 9 Oct</p>
      <ActionCard a={action} channel="web" />
    </PhoneFrame>
  );
}

// PLT-47 chat card (Teams / Slack / WhatsApp)
export function CopilotActionChat({ action, channel, ask }: { action: CopilotAction; channel: 'chat' | 'whatsapp'; ask: string }) {
  return (
    <div className="yx-screen">
      <div className="yxp-chat" role="region" aria-label={channel === 'whatsapp' ? 'WhatsApp chat preview' : 'Teams chat preview'}>
        <div className="yxp-chat__head">
          <span className="yxp-row">
            <Icon icon={MessageSquare} /> {channel === 'whatsapp' ? 'WhatsApp · Kaveri Foods HR' : 'Teams · YukthiX app'}
          </span>
          <span>9:42 am</span>
        </div>
        <div className="yxp-chat__body">
          <p className="yxp-chat__msg">{ask}</p>
          <ActionCard a={action} channel={channel} />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== PLT-48 Agent actions log */

export interface AgentAction {
  id: string;
  at: Date;
  person: string;
  feature: string;
  channel: 'Web' | 'Mobile' | 'Teams' | 'Slack' | 'WhatsApp';
  action: string;
  confirmation: 'Confirmed' | 'Cancelled' | 'Plan approved' | 'Sent to app';
  result: 'Done' | 'Failed' | 'Undone' | 'Not run';
  undoable: boolean;
}

// PLT-48
export function AgentActionsLogScreen({ rows, persona = 'SA', state = 'ready' }: { rows: AgentAction[]; persona?: 'SA' | 'Aud'; state?: 'ready' | 'loading' | 'error' }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const shown = rows.filter((r) => filters.every((f) => f.type !== 'multi' || !f.values.length || f.values.includes(f.key === 'channel' ? r.channel : r.confirmation)));
  const cols: TableColumn<AgentAction>[] = [
    { key: 'at', header: 'When', type: 'date', value: (r) => r.at, render: (r) => `${formatDate(r.at)}, ${r.at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` },
    { key: 'person', header: 'Person (confirmed by)', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }) },
    { key: 'feature', header: 'Feature and version', value: (r) => r.feature },
    { key: 'channel', header: 'Channel', value: (r) => r.channel },
    { key: 'action', header: 'Action', value: (r) => r.action, width: 320 },
    { key: 'conf', header: 'Confirmation', type: 'status', value: (r) => r.confirmation, statusTone: (v) => (v === 'Cancelled' ? 'neutral' : v === 'Sent to app' ? 'warning' : 'success') },
    { key: 'result', header: 'Result', type: 'status', value: (r) => r.result, statusTone: (v) => (v === 'Done' ? 'success' : v === 'Failed' ? 'danger' : 'neutral') },
  ];
  return (
    <SettingsFrame active="Agent actions">
      <PageHeader
        title="Agent actions"
        description="Every action an assistant prepared, who confirmed it and what happened. Assistants never approve, pay, file or change pay."
        facts={persona === 'Aud' ? 'Auditor view · read-only' : undefined}
        actions={<Button>Export</Button>}
      />
      <DataTable
        label="Agent actions"
        columns={cols}
        rows={state === 'ready' ? shown : []}
        getRowId={(r) => r.id}
        state={state}
        errorTitle="We couldn't load agent actions."
        errorReference="AGT-30117"
        onRetry={() => {}}
        rowButtons={persona === 'SA' ? (r) => (r.undoable && r.result === 'Done' ? <ConfirmDialog trigger={<Button size="sm" icon={Undo2}>Undo</Button>} title={`Undo “${r.action}”?`} consequence="The prepared request is withdrawn if it is still pending. The person is told." confirmLabel="Undo" onConfirm={() => {}} /> : null) : undefined}
        filtered={filters.length > 0}
        onClearFilters={() => setFilters([])}
        empty={<EmptyState title="No agent actions yet." description="Actions appear here when people confirm what an assistant prepared." />}
        toolbar={
          <FilterBar
            fields={[
              { key: 'channel', label: 'Channel', type: 'multi', options: ['Web', 'Mobile', 'Teams', 'Slack', 'WhatsApp'].map((v) => ({ value: v, label: v })) },
              { key: 'conf', label: 'Confirmation', type: 'multi', options: ['Confirmed', 'Cancelled', 'Plan approved', 'Sent to app'].map((v) => ({ value: v, label: v })) },
            ]}
            value={filters}
            onChange={setFilters}
          />
        }
      />
    </SettingsFrame>
  );
}

/* ================================================================== PLT-49 EOR connector set-up */

// PLT-49
export function EorConnectorSetup({ defaultStep = 'provider', connected }: { defaultStep?: string; connected?: boolean }) {
  const [provider, setProvider] = useState('globalhands');
  if (connected)
    return (
      <SettingsFrame active="Integrations">
        <ObjectHeader
          name="GlobalHands EOR"
          icon={Globe2}
          status={<Badge tone="success">Connected</Badge>}
          facts={[
            { label: 'Countries', value: 'Germany, Netherlands' },
            { label: 'Workers synced', value: 6 },
            { label: 'Last sync', value: '29 Sep 2026, 6:00 am' },
            { label: 'Owner', value: 'Lakshmi Venkatesan' },
          ]}
          actions={<Button>Sync now</Button>}
        />
        <div className="yxp-grid">
          <Card title="Worker sync">
            <p>6 workers pushed · 1 joiner waiting for the provider to confirm</p>
            <Link href="#">See run log</Link>
          </Card>
          <Card title="Payslips and invoices">
            <p>September 2026: 6 payslips received as documents, locked. Employer cost €38,420 posted to the accounting export.</p>
          </Card>
          <Card title="Errors">
            <InlineAlert tone="warning" title="1 failure in Jobs & errors">Tax ID missing for Jonas Weber. Ask him to add it in his profile.</InlineAlert>
          </Card>
        </div>
        <InlineAlert tone="info" title="YukthiX does not calculate German or Dutch pay">Results come from the provider and are read-only.</InlineAlert>
      </SettingsFrame>
    );
  return (
    <SettingsFrame active="Integrations">
      <Stepper
        title="Connect a global payroll / EOR provider"
        defaultCurrent={defaultStep}
        finishLabel="Connect provider"
        review={{ title: 'Review' }}
        steps={[
          {
            id: 'provider',
            title: 'Provider',
            summary: 'GlobalHands EOR',
            content: (
              <FormField label="Provider" required helper="Listed sub-processors with a data processing agreement. Provider fees are yours.">
                <RadioGroup
                  value={provider}
                  onChange={setProvider}
                  options={[
                    { value: 'globalhands', label: 'GlobalHands EOR', description: 'EU, UK, Singapore' },
                    { value: 'meridian', label: 'Meridian Payroll Network', description: 'EU, US' },
                  ]}
                />
              </FormField>
            ),
          },
          {
            id: 'countries',
            title: 'Countries',
            summary: 'Germany, Netherlands',
            content: (
              <div className="yxp-stack">
                <p className="yxp-muted">Only countries without a YukthiX pay pack are offered.</p>
                <Checkbox label="Germany (6 workers)" defaultChecked />
                <Checkbox label="Netherlands (0 workers)" defaultChecked />
                <Checkbox label="India" disabled description="Paid by YukthiX payroll" />
              </div>
            ),
          },
          {
            id: 'sync',
            title: 'Worker sync',
            summary: 'Joiners, leavers, changes, pay inputs, leave summary',
            content: (
              <div className="yxp-stack">
                <p>We send only the fields the provider needs:</p>
                <Checkbox label="Joiners, leavers and job changes" defaultChecked />
                <Checkbox label="Pay inputs (salary, allowances, one-time pay)" defaultChecked />
                <Checkbox label="Leave and attendance summary" defaultChecked />
                <Checkbox label="Bank details" defaultChecked />
                <Checkbox label="Performance ratings" disabled description="Never shared" />
              </div>
            ),
          },
          {
            id: 'results',
            title: 'Payslips and invoices',
            summary: 'Payslips as documents, totals, employer cost, journals',
            content: (
              <DescriptionList
                items={[
                  { label: 'Payslips', value: 'Stored as documents in each worker’s profile, read-only and locked' },
                  { label: 'Gross-to-net totals and employer cost', value: 'Shown on the pay run; not editable' },
                  { label: 'Invoices and journals', value: 'Added to the accounting export under cost centre EU-OPS' },
                ]}
              />
            ),
          },
        ]}
      />
    </SettingsFrame>
  );
}
