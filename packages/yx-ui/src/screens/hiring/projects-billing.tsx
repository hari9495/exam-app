// Projects › Billing workbench, timesheet correction after invoice, bench & resource requests, timesheet mapping rules.
// PRJ-05, PRJ-06, PRJ-07, PRJ-08 (M12 YX-PRJ-09…12 / 15 / 16 / 17, P23 YX-AST-08 / 09 / 18).
import { useMemo, useState } from 'react';
import { FlaskConical, Plus, Send, UserSearch } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { RadioGroup, Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { Stepper } from '../../components/stepper';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { invoiceTotals } from './hiring-logic';
import { applyMappingRules, benchStatus, correctionEffect, matchResource, marginPct, type MappingRule, type ResourcePerson, type SourceItem } from './projects-logic';
import { EInvoiceBanner, ProjectsFrame, SettingsTimeFrame, SummaryTiles } from './hiring-kit';
import './hiring.css';

/* ================================================================== PRJ-05 · Billing workbench */

export interface WipRow {
  id: string;
  client: string;
  clientState: string;
  project: string;
  source: 'Timesheet hours' | 'Milestone' | 'Retainer' | 'Expense rebill';
  detail: string;
  hours?: number;
  amount: number;
  held?: string;
}

export interface BillingWorkbenchProps {
  rows: WipRow[];
  today: Date;
  defaultStep?: string;
  issued?: boolean;
  draftDate?: Date;
  now?: Date;
}

// PRJ-05
export function BillingWorkbenchScreen({ rows, today, defaultStep = 'wip', issued = false, draftDate, now }: BillingWorkbenchProps) {
  const billable = rows.filter((r) => !r.held);
  const [selected, setSelected] = useState<string[]>(billable.map((r) => r.id));
  const chosen = rows.filter((r) => selected.includes(r.id) && !r.held);
  const clients = Array.from(new Set(chosen.map((r) => r.client)));
  const drafts = clients.map((c) => {
    const lines = chosen.filter((r) => r.client === c);
    return { client: c, lines, totals: invoiceTotals(lines.map((l) => ({ description: l.detail, qty: 1, rate: l.amount })), 'Tamil Nadu', lines[0].clientState) };
  });
  const cols: TableColumn<WipRow>[] = [
    { key: 'client', header: 'Client', value: (r) => r.client, groupable: true },
    { key: 'project', header: 'Project', type: 'id', value: (r) => r.project },
    { key: 'source', header: 'Source', value: (r) => r.source },
    { key: 'detail', header: 'Detail', value: (r) => r.detail },
    { key: 'hours', header: 'Hours', type: 'number', value: (r) => r.hours ?? null, total: 'sum' },
    { key: 'amount', header: 'Amount', type: 'money', value: (r) => r.amount, total: 'sum' },
    { key: 'held', header: 'Status', type: 'status', value: (r) => (r.held ? `Held: ${r.held}` : 'Ready'), statusTone: (v) => (v === 'Ready' ? 'success' : 'warning') },
  ];
  const steps: ApprovalStep[] = [
    { id: 'am', label: 'Account manager', status: 'done', approver: 'Anita Kurian', at: now },
    { id: 'fin', label: 'Finance', status: issued ? 'done' : 'current', approver: 'Ravi Shankar', at: issued ? now : undefined },
  ];
  if (issued)
    return (
      <ProjectsFrame active="Billing workbench">
        <PageHeader title="Billing workbench" status={<Badge tone="success">Issued</Badge>} description="Invoices issued on the shared invoice engine and shown in the client portal." />
        <SummaryTiles
          label="Issued"
          tiles={drafts.map((d) => ({ label: d.client, value: formatINR(d.totals.total), sub: d.totals.interState ? 'IGST' : 'CGST + SGST' }))}
        />
        <EInvoiceBanner invoiceDate={draftDate ?? today} today={today} invoiceNo="KF/TN/26-27/0192" />
      </ProjectsFrame>
    );
  return (
    <ProjectsFrame active="Billing workbench">
      <PageHeader title="Billing workbench" description="Unbilled work (WIP) by client and project. Create draft invoices, review, approve and issue on the shared invoice engine." />
      <Stepper
        title="Billing run, September 2026"
        defaultCurrent={defaultStep}
        finishLabel={`Issue ${drafts.length} invoices`}
        steps={[
          {
            id: 'wip',
            title: 'Unbilled work',
            description: `${formatINR(billable.reduce((s, r) => s + r.amount, 0))} ready`,
            content:
              rows.length === 0 ? (
                <EmptyState title="Nothing to bill." description="Approved billable hours, completed milestones and retainers appear here." />
              ) : (
                <div className="yx-hire-stack">
                  {rows.some((r) => r.held) && <InlineAlert tone="info">Held items stay in WIP until the client approves the hours or accepts the milestone in the portal.</InlineAlert>}
                  <DataTable label="Unbilled work" columns={cols} rows={rows} getRowId={(r) => r.id} selectable selectedIds={selected} onSelectedChange={setSelected} defaultGroupBy="client" />
                </div>
              ),
            summary: <Text>{chosen.length} items selected across {clients.length} clients</Text>,
          },
          {
            id: 'drafts',
            title: 'Draft invoices',
            description: `${drafts.length} drafts`,
            content: (
              <div className="yx-hire-stack">
                {drafts.map((d) => (
                  <Card key={d.client} title={d.client} actions={<Badge>Draft</Badge>}>
                    <ul className="yx-hire-plainlist">
                      {d.lines.map((l) => (
                        <li key={l.id}>
                          {l.project} · {l.detail}: {formatINR(l.amount)}
                        </li>
                      ))}
                    </ul>
                    <Text size="sm">
                      Taxable {formatINR(d.totals.subtotal)} + {d.totals.interState ? `IGST ${formatINR(d.totals.igst)}` : `CGST ${formatINR(d.totals.cgst)} + SGST ${formatINR(d.totals.sgst)}`} = <strong>{formatINR(d.totals.total)}</strong>
                    </Text>
                  </Card>
                ))}
              </div>
            ),
            summary: <Text>{drafts.map((d) => `${d.client} ${formatINR(d.totals.total)}`).join(' · ')}</Text>,
          },
          {
            id: 'approve',
            title: 'Approve and issue',
            content: (
              <div className="yx-hire-stack">
                <ApprovalTimeline steps={steps} now={now} />
                <EInvoiceBanner invoiceDate={draftDate ?? today} today={today} invoiceNo="each invoice" />
                <Text size="sm" tone="secondary">
                  Issued invoices are never edited. They go to the client&rsquo;s billing contacts and the client portal, and to accounting with the project dimension.
                </Text>
              </div>
            ),
          },
        ]}
      />
    </ProjectsFrame>
  );
}

/* ================================================================== PRJ-06 · Timesheet correction on invoiced time */

export interface CorrectionProps {
  person: string;
  project: string;
  week: string;
  invoiceNo: string;
  invoiceDate: Date;
  invoicedHours: number;
  rate: number;
  costRate: number;
  defaultCorrected: number;
  policy: 'recovery' | 'none';
  periodLocked?: boolean;
  monthRevenue: number;
  monthCost: number;
  defaultStep?: string;
}

// PRJ-06
export function TimesheetCorrectionScreen({ person, project, week, invoiceNo, invoiceDate, invoicedHours, rate, costRate, defaultCorrected, policy, periodLocked = false, monthRevenue, monthCost, defaultStep = 'correct' }: CorrectionProps) {
  const [hours, setHours] = useState<number | null>(defaultCorrected);
  const [reason, setReason] = useState('Stand-up booked twice on 14 Aug');
  const eff = correctionEffect({ invoicedHours, correctedHours: hours ?? invoicedHours, rate, costRate, recoveryPolicy: policy });
  const newRevenue = monthRevenue + eff.revenueChange;
  const doc = eff.kind === 'credit-note' ? 'credit note' : eff.kind === 'supplementary' ? 'supplementary invoice' : 'no document';
  return (
    <ProjectsFrame active="Billing workbench">
      <PageHeader title="Correct invoiced time" description={`${person} · ${project} · ${week} · invoiced on ${invoiceNo} (${formatDate(invoiceDate)})`} />
      {periodLocked && (
        <InlineAlert tone="info" title="August is locked">
          The approved lines can&rsquo;t change. The correction is an adjustment line in the current open week that points to the original line; margin for August is restated in the report.
        </InlineAlert>
      )}
      <Stepper
        title="Timesheet correction"
        defaultCurrent={defaultStep}
        finishLabel={eff.kind === 'none' ? 'Save correction' : `Create ${doc}`}
        steps={[
          {
            id: 'correct',
            title: 'Correct hours',
            content: (
              <div className="yx-hire-sheet">
                <div className="yx-hire-sheet__form">
                  <FieldRow>
                    <FormField label="Invoiced hours">
                      <TextField value={String(invoicedHours)} readOnly />
                    </FormField>
                    <FormField label="Correct hours" required>
                      <NumberField value={hours} onChange={setHours} min={0} decimals />
                    </FormField>
                  </FieldRow>
                  <FormField label="Reason" required helper="Shown to the employee and on the credit note" error={reason.trim() ? null : 'Enter why the hours change.'}>
                    <TextArea value={reason} onChange={setReason} rows={2} />
                  </FormField>
                </div>
                <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="Effect">
                  <Text weight="semibold">What happens</Text>
                  <Text size="sm">
                    {eff.hours === 0 ? 'No change to hours.' : `${eff.hours > 0 ? '+' : ''}${eff.hours} h × ${formatINR(rate)} = ${eff.hours < 0 ? '−' : ''}${formatINR(eff.net)} + GST ${formatINR(eff.gst)}`}
                  </Text>
                  {eff.kind !== 'none' && (
                    <Badge tone={eff.kind === 'credit-note' ? 'warning' : 'info'}>
                      {eff.kind === 'credit-note' ? 'Credit note' : 'Supplementary invoice'} {formatINR(eff.total)} linked to {invoiceNo}
                    </Badge>
                  )}
                  <Text size="sm">{policy === 'recovery' && eff.recovery ? `Pay recovery line ${formatINR(eff.recovery)} in the next payroll (company policy).` : 'No pay recovery (company policy: none).'}</Text>
                  <Text size="sm">
                    August margin restated: {marginPct(monthRevenue, monthCost)}% → {marginPct(newRevenue, monthCost)}%
                  </Text>
                </aside>
              </div>
            ),
            summary: <Text>{eff.hours} h · {doc} {eff.kind !== 'none' ? formatINR(eff.total) : ''}</Text>,
          },
          {
            id: 'review',
            title: 'Review documents',
            content: (
              <DescriptionList
                items={[
                  { label: 'Adjustment line', value: `${eff.hours} h in week of 28 Sep 2026, referencing the 14 Aug line` },
                  { label: 'Document', value: eff.kind === 'none' ? 'None' : `${doc[0].toUpperCase()}${doc.slice(1)} for ${formatINR(eff.total)} against ${invoiceNo}` },
                  { label: 'Pay recovery', value: eff.recovery ? formatINR(eff.recovery) : 'None' },
                  { label: 'Audit', value: 'Recorded with before and after values' },
                ]}
              />
            ),
          },
        ]}
      />
    </ProjectsFrame>
  );
}

/* ================================================================== PRJ-07 · Bench board + resource requests */

export interface ResourceRequest {
  id: string;
  project: string;
  requestedBy: string;
  skill: string;
  level: string;
  pct: number;
  from: Date;
  to: Date;
  status: 'Open' | 'Matched' | 'Confirmed';
  person?: string;
}

export interface BenchRequestsProps {
  people: ResourcePerson[];
  requests: ResourceRequest[];
  today: Date;
  persona: 'pm' | 'resource-manager';
  matchFor?: string | null;
  raiseOpen?: boolean;
  defaultTab?: 'bench' | 'requests';
}

// PRJ-07
export function BenchRequestsScreen({ people, requests, today, persona, matchFor = null, raiseOpen = false, defaultTab = 'bench' }: BenchRequestsProps) {
  const [match, setMatch] = useState<string | null>(matchFor);
  const [raise, setRaise] = useState(raiseOpen);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const req = requests.find((r) => r.id === match);
  const matches = req ? matchResource({ skill: req.skill, pct: req.pct }, people, today) : [];
  const cols: TableColumn<ResourceRequest>[] = [
    { key: 'project', header: 'Project', type: 'id', value: (r) => r.project },
    { key: 'skill', header: 'Skill · level', value: (r) => `${r.skill} · ${r.level}` },
    { key: 'pct', header: 'Allocation', type: 'number', value: (r) => r.pct, render: (r) => `${r.pct}%` },
    { key: 'dates', header: 'Dates', value: (r) => `${formatDate(r.from)} – ${formatDate(r.to)}` },
    { key: 'by', header: 'Requested by', type: 'person', value: (r) => r.requestedBy, person: (r) => ({ name: r.requestedBy }) },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Confirmed' ? 'success' : v === 'Matched' ? 'info' : 'warning') },
    { key: 'person', header: 'Person', value: (r) => r.person ?? '—' },
  ];
  return (
    <ProjectsFrame active="Bench & requests">
      <PageHeader
        title="Bench and resource requests"
        description="Bench status comes from allocations. Requests are matched on confirmed skills and free capacity, bench people first; the resource manager confirms."
        actions={persona === 'pm' ? <Button variant="primary" icon={Plus} onClick={() => setRaise(true)}>Raise request</Button> : undefined}
      />
      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label="Bench sections">
          <TabsTrigger value="bench" count={people.filter((p) => benchStatus(p.allocatedPct) !== 'allocated').length}>
            Bench board
          </TabsTrigger>
          <TabsTrigger value="requests" count={requests.filter((r) => r.status === 'Open').length}>
            Resource requests
          </TabsTrigger>
        </TabsList>
        <TabsContent value="bench">
          <div className="yx-hire-board">
            {(['bench', 'partly allocated', 'allocated'] as const).map((st) => {
              const ps = people.filter((p) => benchStatus(p.allocatedPct) === st);
              return (
                <section key={st} className="yx-hire-board__col" aria-label={st}>
                  <header className="yx-hire-board__head">
                    <Text weight="semibold">{st[0].toUpperCase() + st.slice(1)}</Text>
                    <Text size="sm" tone="secondary">
                      {ps.length}
                    </Text>
                  </header>
                  {ps.length === 0 && <Text size="sm" tone="secondary">No one.</Text>}
                  {ps.map((p) => {
                    const days = p.benchSince ? Math.max(0, Math.round((today.getTime() - p.benchSince.getTime()) / 86_400_000)) : 0;
                    return (
                      <article key={p.id} className="yx-hire-board__card">
                        <PersonLabel name={p.name} secondary={p.skills.map((s) => `${s.name}${s.confirmed ? '' : ' (unconfirmed)'}`).join(', ')} />
                        <Meter value={p.allocatedPct} max={100} label={`${p.name} allocated`} warnAt={101} dangerAt={200} valueText={`${p.allocatedPct}% allocated`} />
                        {st === 'bench' && <Badge tone={days > 30 ? 'warning' : 'neutral'}>On bench {days} days</Badge>}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="requests">
          <DataTable
            label="Resource requests"
            columns={cols}
            rows={requests}
            getRowId={(r) => r.id}
            rowButtons={persona === 'resource-manager' ? (r) => (r.status === 'Open' ? <Button size="sm" icon={UserSearch} onClick={() => setMatch(r.id)}>Find match</Button> : null) : undefined}
            rowActions={() => <MenuItem destructive>Withdraw request</MenuItem>}
            empty={<EmptyState title="No resource requests." description="Project managers raise requests with skills, level, dates and allocation." />}
          />
        </TabsContent>
      </Tabs>
      {req && (
        <Drawer
          open
          onOpenChange={(o) => !o && setMatch(null)}
          size="lg"
          title={`Match · ${req.skill} ${req.level} at ${req.pct}%`}
          subtitle={`${req.project} · ${formatDate(req.from)} – ${formatDate(req.to)}`}
          footer={
            <>
              <Button onClick={() => setMatch(null)}>Cancel</Button>
              <Button variant="primary" disabled={!confirmed}>
                Confirm allocation
              </Button>
            </>
          }
        >
          {matches.length === 0 ? (
            <EmptyState title="No one is free with this skill." description="People fully allocated on these dates are not shown. Widen the dates or lower the allocation." />
          ) : (
            <ol className="yx-hire-list" aria-label="Matches, best first">
              {matches.map((m, i) => (
                <li key={m.id} className="yx-hire-list__item">
                  <div className="yx-hire-list__main">
                    <PersonLabel name={`${i + 1}. ${m.name}`} secondary={`${m.status}${m.benchDays ? ` · ${m.benchDays} days on bench` : ''} · ${100 - m.allocatedPct}% free`} />
                    <div className="yx-hire-chips">
                      <Badge tone={m.confirmed ? 'success' : 'warning'}>{req.skill} {m.confirmed ? 'confirmed' : 'not confirmed'}</Badge>
                    </div>
                  </div>
                  <Button size="sm" aria-pressed={confirmed === m.id} onClick={() => setConfirmed(m.id)}>
                    {confirmed === m.id ? 'Selected' : 'Select'}
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </Drawer>
      )}
      <Drawer
        open={raise}
        onOpenChange={setRaise}
        title="Raise resource request"
        subtitle="NRP-MOB · Loyalty mobile app"
        footer={
          <>
            <Button onClick={() => setRaise(false)}>Cancel</Button>
            <Button variant="primary" icon={Send}>
              Send request
            </Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          <FieldRow>
            <FormField label="Skill" required helper="From the skills library">
              <Select value="SQL" onChange={() => {}} options={['SQL', 'Java', 'React', 'Python', 'Power BI'].map((v) => ({ value: v, label: v }))} />
            </FormField>
            <FormField label="Level" required>
              <Select value="mid" onChange={() => {}} options={[{ value: 'junior', label: 'Junior' }, { value: 'mid', label: 'Mid' }, { value: 'senior', label: 'Senior' }]} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="From" required>
              <DatePicker value={new Date(2026, 10, 1)} onChange={() => {}} />
            </FormField>
            <FormField label="To" required>
              <DatePicker value={new Date(2027, 3, 30)} onChange={() => {}} />
            </FormField>
          </FieldRow>
          <FormField label="Allocation" required>
            <RadioGroup aria-label="Allocation" orientation="horizontal" defaultValue="100" options={['25', '50', '75', '100'].map((v) => ({ value: v, label: `${v}%` }))} />
          </FormField>
          <FormField label="Note" optional>
            <TextArea rows={2} />
          </FormField>
        </div>
      </Drawer>
    </ProjectsFrame>
  );
}

/* ================================================================== PRJ-08 · Timesheet mapping rules (Settings 3.11) */

export interface MappingRulesProps {
  rules: MappingRule[];
  items: SourceItem[];
  prefillOn?: boolean;
  editOpen?: boolean;
  tested?: boolean;
}

const SOURCE_LABEL: Record<MappingRule['source'], string> = { calendar: 'Calendar', jira: 'Jira', github: 'GitHub' };

// PRJ-08
export function MappingRulesScreen({ rules: initial, items, prefillOn = true, editOpen = false, tested = false }: MappingRulesProps) {
  const [rules, setRules] = useState(initial);
  const [on, setOn] = useState(prefillOn);
  const [edit, setEdit] = useState<MappingRule | null>(editOpen ? initial[0] : null);
  const [showTest, setShowTest] = useState(tested);
  const results = useMemo(() => applyMappingRules(rules, items), [rules, items]);
  const matched = results.filter((r) => r.rule).length;
  const cols: TableColumn<MappingRule>[] = [
    { key: 'priority', header: 'Priority', type: 'number', value: (r) => r.priority, width: 90 },
    { key: 'source', header: 'Source', value: (r) => SOURCE_LABEL[r.source] },
    { key: 'pattern', header: 'Pattern', type: 'id', value: (r) => r.pattern },
    { key: 'project', header: 'Project', type: 'id', value: (r) => r.project },
    { key: 'task', header: 'Task', value: (r) => r.task },
    { key: 'enabled', header: 'Status', type: 'status', value: (r) => (r.enabled ? 'On' : 'Off'), statusTone: (v) => (v === 'On' ? 'success' : 'neutral') },
  ];
  return (
    <SettingsTimeFrame>
      <PageHeader
        title="Timesheet mapping rules"
        description="Settings › Time & Leave › 3.11 Projects & timesheets. Rules turn calendar events, Jira issues and GitHub activity into suggested timesheet rows. The employee always reviews and submits; raw activity is visible only to them."
        actions={
          <>
            <Button icon={FlaskConical} disabled={!on} onClick={() => setShowTest(true)}>
              Test against last week
            </Button>
            <Button variant="primary" icon={Plus} disabled={!on} onClick={() => setEdit({ id: 'new', source: 'jira', pattern: '', project: '', task: '', priority: rules.length + 1, enabled: true })}>
              Add rule
            </Button>
          </>
        }
      />
      <Switch className="yx-hire-switch" label="Pre-fill timesheets from work tools" description="YukthiX starter: on. Connectors allowed: calendar, Jira, GitHub (read-only, metadata only)." checked={on} onChange={setOn} />
      {!on ? (
        <EmptyState title="Timesheet pre-fill is off." description="Employees fill timesheets by hand. Switch it on to use mapping rules." />
      ) : (
        <>
          <DataTable
            label="Mapping rules"
            columns={cols}
            rows={[...rules].sort((a, b) => a.priority - b.priority)}
            getRowId={(r) => r.id}
            onRowClick={(r) => setEdit(r)}
            rowActions={(r) => (
              <>
                <MenuItem onSelect={() => setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))}>{r.enabled ? 'Switch off' : 'Switch on'}</MenuItem>
                <MenuItem destructive onSelect={() => setRules((rs) => rs.filter((x) => x.id !== r.id))}>
                  Delete rule
                </MenuItem>
              </>
            )}
            empty={<EmptyState title="No mapping rules yet." description="Without rules, suggestions come only from the AI and are marked as AI." action={<Button variant="primary" icon={Plus}>Add rule</Button>} />}
          />
          {showTest && (
            <Card title="Test against last week's items (sample employee, anonymised)" actions={<Badge tone="info">{matched} of {results.length} matched</Badge>}>
              <ul className="yx-hire-list">
                {results.map(({ item, rule }) => (
                  <li key={item.id} className="yx-hire-list__item">
                    <div className="yx-hire-list__main">
                      <Text weight="medium">
                        {SOURCE_LABEL[item.source]} · {item.text}
                      </Text>
                      <Text size="sm" tone="secondary">
                        {item.hours} h
                      </Text>
                    </div>
                    {rule ? <Badge tone="success">→ {rule.project} · {rule.task} (rule {rule.priority})</Badge> : <Badge>No rule: left for the employee</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      {edit && (
        <Drawer
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={edit.id === 'new' ? 'Add mapping rule' : `Edit rule ${edit.priority}`}
          footer={
            <>
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary">Save rule</Button>
            </>
          }
        >
          <div className="yx-hire-stack">
            <FormField label="Source" required>
              <RadioGroup aria-label="Source" orientation="horizontal" defaultValue={edit.source} options={(['calendar', 'jira', 'github'] as const).map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
            </FormField>
            <FormField label="Pattern" required helper="Use * for any text, e.g. NRPWEB-* or *Nilgiri*. Matching ignores capitals.">
              <TextField defaultValue={edit.pattern} />
            </FormField>
            <FieldRow>
              <FormField label="Project" required>
                <Select value={edit.project || null} onChange={() => {}} options={['NRP-WEB', 'CLL-WMS', 'INT-ADM', 'INT-ERP'].map((v) => ({ value: v, label: v }))} />
              </FormField>
              <FormField label="Task" required>
                <Select value={edit.task || null} onChange={() => {}} options={['Store locator build', 'Loyalty engine', 'Client meetings', 'Team meetings', 'Integration'].map((v) => ({ value: v, label: v }))} />
              </FormField>
            </FieldRow>
            <FormField label="Priority" required helper="Lower numbers win when two rules match.">
              <NumberField value={edit.priority} onChange={() => {}} min={1} />
            </FormField>
          </div>
        </Drawer>
      )}
    </SettingsTimeFrame>
  );
}
