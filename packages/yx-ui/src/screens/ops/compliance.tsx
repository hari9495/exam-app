// Compliance screens (M03 statutory, P07): CMP-01 statutory hub, CMP-12 supplementary filing panel, CMP-02 statutory set-up,
// CMP-03 registers, CMP-04 TDS challan sheet, CMP-05 TDS return wizard, CMP-06 Form 16 bulk, CMP-07 missing IDs,
// CMP-08 statutory rules browser + labour-law updates.
import { useMemo, useState } from 'react';
import { Building2, Download, ExternalLink, Lock, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Dialog, TypeToConfirmDialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { BarChart, StatCard } from '../../components/charts';
import { Stepper } from '../../components/stepper';
import { formatDate, formatINR } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { Actions, CardGrid, CheckList, DueMonth, Facts, OpsDesk, StatusTrail, type CheckRow, type DueItem } from './ops-kit';
import { daysBetween, lateFilingFee, tdsLateInterest } from './ops-rules';
import type { ListState } from './helpdesk';
import type { FilingStep, RegisterRow, RuleSetRow, StatuteItem, SupplementaryFiling } from './compliance-data';

/* ---------------- Statute card (hub) ---------------- */

const SELF_STEPS = ['Generate file', 'Download', 'Mark uploaded', 'Acknowledged', 'Filed (locked)'];
const PARTNER_STEPS = ['Generate file', 'Sent to partner', 'Filed by partner', 'Acknowledgement synced', 'Filed (locked)'];
export function stepIndex(step: FilingStep, mode: 'self' | 'partner'): number {
  if (mode === 'partner') return { due: 0, generated: 1, transmitted: 2, 'filed-by-partner': 4, acknowledged: 3, filed: 4, uploaded: 2, rejected: 2 }[step];
  return { due: 0, generated: 1, uploaded: 3, acknowledged: 4, filed: 5, transmitted: 2, 'filed-by-partner': 5, rejected: 2 }[step];
}
function statusFor(item: { due: Date; step: FilingStep }, today: Date): { tone: BadgeTone; text: string } {
  if (item.step === 'filed' || item.step === 'filed-by-partner') return { tone: 'success', text: 'Filed' };
  if (item.step === 'rejected') return { tone: 'danger', text: 'Rejected by partner' };
  const left = daysBetween(today, item.due);
  if (left < 0) return { tone: 'danger', text: `Overdue by ${-left} days` };
  if (left <= 7) return { tone: 'warning', text: left === 0 ? 'Due today' : `Due in ${left} days` };
  return { tone: 'neutral', text: `Due ${formatDate(item.due)}` };
}

export function StatuteCard({ item, today, onOpenChild, onAction }: { item: StatuteItem; today: Date; onOpenChild?: (c: SupplementaryFiling) => void; onAction?: (item: StatuteItem) => void }) {
  const st = statusFor(item, today);
  const steps = item.mode === 'partner' ? PARTNER_STEPS : SELF_STEPS;
  const done = item.step === 'filed' || item.step === 'filed-by-partner';
  return (
    <>
      <article className="yx-ops-card" data-tone={st.tone === 'danger' ? 'danger' : st.tone === 'warning' ? 'warning' : undefined} aria-label={`${item.title}, ${item.period}`}>
        <div className="yx-ops-card__head">
          <div>
            <h3 className="yx-ops-card__title">
              {item.title} · {item.period}
            </h3>
            <span className="yx-ops-card__sub">
              {item.entity} · {item.mode === 'partner' ? 'Compliance partner files' : 'You upload on the portal'}
            </span>
          </div>
          <Badge tone={st.tone}>{st.text}</Badge>
        </div>
        {item.statute !== 'Registers' && (
          <Facts
            items={[
              { label: 'Amount', value: formatINR(item.amount) },
              ...(item.employees != null ? [{ label: 'People included', value: item.employees }] : []),
              ...(item.estimatedPenalty ? [{ label: 'Estimated penalty', value: formatINR(item.estimatedPenalty), tone: 'danger' as const }] : []),
            ]}
          />
        )}
        {item.excluded && <p className="yx-ops-muted">{item.excluded}</p>}
        {item.problems && <InlineAlert tone="warning">{item.problems}. Fix before generating.</InlineAlert>}
        {item.estimatedPenalty && <p className="yx-ops-muted">Estimate from {item.penaltyRule}. Final amount depends on the payment date.</p>}
        <StatusTrail steps={steps.map((label) => ({ label }))} current={stepIndex(item.step, item.mode)} label={`${item.title} progress`} />
        {item.reference && (
          <p className="yx-ops-muted">
            <Lock aria-hidden size={12} /> {item.reference}
          </p>
        )}
        <Actions>
          {item.statute === 'Registers' ? (
            <>
              <Button size="sm" icon={Download}>
                PDF
              </Button>
              <Button size="sm" icon={Download}>
                XLSX
              </Button>
              <Button size="sm">Inspection pack</Button>
            </>
          ) : done ? (
            <>
              <Button size="sm" icon={Download}>
                Filed file
              </Button>
              {(item.statute === 'PF' || item.statute === 'ESI') && <Button size="sm">Correct this month</Button>}
            </>
          ) : (
            <Button size="sm" onClick={() => onAction?.(item)}>
              {item.step === 'due' ? (item.statute === 'TDS challan' ? 'Open challan sheet' : item.statute.startsWith('Form') ? 'Start return' : 'Generate file') : item.mode === 'partner' ? 'Send to partner' : 'Mark uploaded'}
            </Button>
          )}
        </Actions>
      </article>
      {item.children?.map((c) => (
        <article key={c.id} className="yx-ops-card" data-child aria-label={`${c.kind} for ${c.originMonth}`}>
          <div className="yx-ops-card__head">
            <div>
              <h3 className="yx-ops-card__title">
                {c.kind} · {c.originMonth}
              </h3>
              <span className="yx-ops-card__sub">Corrects {c.originalRef}. The filed return is not changed.</span>
            </div>
            <Badge tone={c.step === 'filed' ? 'success' : 'warning'}>{c.step === 'uploaded' ? 'Uploaded, awaiting acknowledgement' : c.step === 'generated' ? 'Generated' : c.step === 'transmitted' ? 'With partner' : 'Filed'}</Badge>
          </div>
          <Facts
            items={[
              { label: 'Contribution', value: formatINR(c.employeeShare + c.employerShare) },
              { label: 'Interest and damages', value: formatINR(c.penalties.reduce((s, p) => s + p.amount, 0)) },
            ]}
          />
          <Actions>
            <Button size="sm" onClick={() => onOpenChild?.(c)}>
              Open filing
            </Button>
          </Actions>
        </article>
      ))}
    </>
  );
}

/* =========================================================================================
 * CMP-01 · Statutory hub (+ CMP-12 supplementary filing panel)
 * ======================================================================================= */

export interface StatutoryHubScreenProps {
  items: StatuteItem[];
  today: Date;
  state?: ListState;
  view?: 'cards' | 'calendar';
  /** CMP-12: supplementary filing panel open. */
  openFiling?: SupplementaryFiling | null;
  /** CMP-04: challan sheet open over the hub. */
  challanOpen?: boolean;
  setupNeeded?: boolean;
}
export function StatutoryHubScreen({ items, today, state = 'ready', view = 'cards', openFiling = null, setupNeeded }: StatutoryHubScreenProps) {
  const [tab, setTab] = useState(view);
  const [month, setMonth] = useState<string | null>('2026-09');
  const [filing, setFiling] = useState<SupplementaryFiling | null>(openFiling);
  const overdue = items.filter((i) => statusFor(i, today).tone === 'danger');
  const due: DueItem[] = items.filter((i) => i.due.getMonth() === 9).map((i) => ({ date: i.due, label: i.title.replace(/,.*/, ''), tone: statusFor(i, today).tone }));
  return (
    <OpsDesk area="compliance" active="Statutory hub" counts={{ 'Statutory hub': items.filter((i) => !i.step.startsWith('filed')).length }}>
      <PageHeader
        title="Statutory hub"
        description="One card per statute per month, with due dates from the compliance calendar."
        facts={`${items.length} items · ${overdue.length} overdue · filing modes per entity in Statutory set-up`}
        actions={
          <Select
            aria-label="Month"
            size="sm"
            value={month}
            onChange={setMonth}
            options={[
              { value: '2026-09', label: 'September 2026' },
              { value: '2026-08', label: 'August 2026' },
              { value: '2026-07', label: 'July 2026' },
            ]}
          />
        }
      />
      {setupNeeded ? (
        <EmptyState title="Statutory set-up needed." description="Add registrations for PF, ESI, PT, LWF and TDS for each legal entity. Cards appear here after the first payroll run." action={<Button variant="primary">Open statutory set-up</Button>} />
      ) : state === 'loading' ? (
        <CardGrid>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={220} />
          ))}
        </CardGrid>
      ) : (
        <>
          {overdue.length > 0 && (
            <PageBanner tone="danger">
              {overdue.length} {overdue.length === 1 ? 'item is' : 'items are'} overdue. Estimated penalties are shown on each card.
            </PageBanner>
          )}
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'cards' | 'calendar')}>
            <TabsList aria-label="Hub views">
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="calendar">Due-date calendar</TabsTrigger>
            </TabsList>
            <TabsContent value="cards">
              <CardGrid min="lg">
                {items.map((i) => (
                  <div key={i.id} className="yx-ops-stack">
                    <StatuteCard item={i} today={today} onOpenChild={setFiling} />
                  </div>
                ))}
              </CardGrid>
            </TabsContent>
            <TabsContent value="calendar">
              <Card title="October 2026">
                <DueMonth month={new Date(2026, 9, 1)} items={due} today={today} label="Statutory due dates, October 2026" />
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
      <SupplementaryFilingPanel filing={filing} onClose={() => setFiling(null)} />
    </OpsDesk>
  );
}

/** CMP-12 · Supplementary filing panel (T3 panel): origin month, reason, amounts, status, TRRN, interest and damages lines. */
export function SupplementaryFilingPanel({ filing, onClose }: { filing: SupplementaryFiling | null; onClose: () => void }) {
  const total = filing ? filing.penalties.reduce((s, p) => s + p.amount, 0) : 0;
  const refund = filing?.kind === 'Excess remittance refund request';
  return (
    <Drawer
      open={!!filing}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={filing ? `${filing.kind} · ${filing.originMonth}` : ''}
      subtitle={filing ? `Corrects ${filing.originalRef}` : ''}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary">{filing?.step === 'generated' ? 'Download file' : filing?.step === 'uploaded' ? 'Record acknowledgement' : 'Check status'}</Button>
        </>
      }
    >
      {filing && (
        <div className="yx-ops-stack">
          <StatusTrail steps={(refund ? ['Request prepared', 'Sent to partner', 'Accepted by portal', 'Refund received'] : ['Generated', 'Uploaded', 'Acknowledged', 'Filed (locked)']).map((label) => ({ label }))} current={filing.step === 'generated' ? 1 : filing.step === 'uploaded' || filing.step === 'transmitted' ? 2 : 4} />
          <DescriptionList
            items={[
              { label: 'Why', value: filing.reason },
              { label: 'People', value: filing.employees },
              { label: 'Employee share', value: formatINR(filing.employeeShare) },
              { label: 'Employer share', value: formatINR(filing.employerShare) },
              ...(filing.trrn ? [{ label: 'Reference', value: filing.trrn, mono: true, copyValue: filing.trrn }] : []),
            ]}
          />
          <Card title="Caused by">
            <ul className="yx-ops-list">
              {filing.payslipLines.map((l) => (
                <li key={l} className="yx-ops-list__item">
                  {l}
                </li>
              ))}
            </ul>
          </Card>
          {refund ? (
            <InlineAlert tone="info">The over-deducted employee share ({formatINR(filing.employeeShare)}) goes back to the 3 employees as a named line in the next payroll run.</InlineAlert>
          ) : (
            <Card title="Interest and damages (employer cost)">
              <DataTable
                label="Penalty lines"
                columns={[
                  { key: 'kind', header: 'Line', value: (p: SupplementaryFiling['penalties'][number]) => p.kind, width: 180 },
                  { key: 'days', header: 'Days late', type: 'number', value: (p) => p.daysLate },
                  { key: 'base', header: 'Base', type: 'money', value: (p) => p.base },
                  { key: 'rate', header: 'Rate or band', value: (p) => p.rate, width: 180 },
                  { key: 'amt', header: 'Amount', type: 'money', value: (p) => p.amount, total: 'sum' },
                  { key: 'v', header: 'Rule', type: 'id', value: (p) => p.ruleVersion },
                ]}
                rows={filing.penalties}
                getRowId={(p) => p.kind}
              />
              <p className="yx-ops-muted">Total {formatINR(total)}. Never deducted from employees.</p>
            </Card>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* =========================================================================================
 * CMP-02 · Statutory set-up per entity
 * ======================================================================================= */

export interface Registration {
  statute: string;
  fields: string[][];
  missing: string[];
  mode: string;
}
export interface StatutorySetupScreenProps {
  entity: string;
  registrations: Registration[];
  tab?: 'registrations' | 'options' | 'filing';
  switchOnOpen?: boolean;
}
export function StatutorySetupScreen({ entity, registrations, tab = 'registrations', switchOnOpen }: StatutorySetupScreenProps) {
  const [current, setCurrent] = useState(tab);
  const [open, setOpen] = useState(!!switchOnOpen);
  const [pfBasis, setPfBasis] = useState('ceiling');
  const [bonus, setBonus] = useState<number | null>(8.33);
  const complete = registrations.filter((r) => r.missing.length === 0).length;
  return (
    <OpsDesk area="compliance" active="Statutory set-up">
      <ObjectHeader
        name={entity}
        icon={Building2}
        secondary="Legal entity · statutory registrations, legal options and filing mode"
        status={complete === registrations.length ? <Badge tone="success">Complete</Badge> : <Badge tone="warning">{registrations.length - complete} statutes incomplete</Badge>}
        facts={[
          { label: 'Statutes on', value: registrations.filter((r) => r.mode !== 'Off').length },
          { label: 'Complete', value: `${complete} of ${registrations.length}` },
        ]}
        actions={<Button variant="primary">Save changes</Button>}
      />
      <Tabs value={current} onValueChange={(v) => setCurrent(v as typeof current)}>
        <TabsList aria-label="Set-up sections">
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="options">Legal options</TabsTrigger>
          <TabsTrigger value="filing">Filing mode</TabsTrigger>
        </TabsList>
        <TabsContent value="registrations">
          <CardGrid>
            {registrations.map((r) => (
              <article key={r.statute} className="yx-ops-card" data-tone={r.missing.length ? 'warning' : undefined}>
                <div className="yx-ops-card__head">
                  <h3 className="yx-ops-card__title">{r.statute}</h3>
                  {r.mode === 'Off' ? <Badge tone="neutral">Off</Badge> : r.missing.length ? <Badge tone="warning">Missing {r.missing.length}</Badge> : <Badge tone="success">Complete</Badge>}
                </div>
                <DescriptionList items={r.fields.map(([label, value]) => ({ label, value: value || 'Not entered', mono: !!value }))} />
                {r.missing.length > 0 && <InlineAlert tone="warning" title="Missing">{r.missing.join('; ')}. File generation is blocked until these are added.</InlineAlert>}
                <Actions>
                  {r.mode === 'Off' ? (
                    <Button size="sm" onClick={() => setOpen(true)}>
                      Switch on
                    </Button>
                  ) : (
                    <Button size="sm">Edit</Button>
                  )}
                </Actions>
              </article>
            ))}
          </CardGrid>
        </TabsContent>
        <TabsContent value="options">
          <Card>
            <div className="yx-ops-stack yx-ops-narrow">
              <p className="yx-ops-muted">Rates come from the published rules and can't be changed. These are the choices the law lets the company make, effective from a date.</p>
              <FormField label="PF on">
                <RadioGroup
                  value={pfBasis}
                  onChange={setPfBasis}
                  options={[
                    { value: 'ceiling', label: 'PF wage up to the ceiling (₹15,000)' },
                    { value: 'actual', label: 'Actual PF wage', description: 'Employer share on actual wage too' },
                  ]}
                />
              </FormField>
              <FormField label="Bonus rate" helper="Between 8.33 % and 20 %">
                <CurrencyField value={bonus} onChange={setBonus} allowPaise suffix="%" />
              </FormField>
              <FormField label="Gratuity provision">
                <Select value="actuarial" onChange={() => {}} options={[{ value: 'actuarial', label: 'Actuarial valuation' }, { value: 'formula', label: '15 / 26 formula on last wage' }]} />
              </FormField>
              <FormField label="Effective from" required>
                <DatePicker value={new Date(2026, 9, 1)} onChange={() => {}} />
              </FormField>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="filing">
          <DataTable
            label="Filing mode"
            columns={[
              { key: 's', header: 'Statute', value: (r: Registration) => r.statute },
              { key: 'm', header: 'How it is filed', value: (r) => r.mode, width: 360 },
            ]}
            rows={registrations}
            getRowId={(r) => r.statute}
            rowButtons={() => <Button size="sm">Change</Button>}
          />
        </TabsContent>
      </Tabs>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title="Switch on labour welfare fund for Tamil Nadu?"
        description="We check that everything the return needs is present before files can be generated."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Save and switch on
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <CheckList
            label="Completeness check"
            items={[
              { id: '1', status: 'fail', label: 'Tamil Nadu LWF registration number', detail: 'Add it below' },
              { id: '2', status: 'pass', label: 'Employee work-location states', detail: '110 people in Tamil Nadu' },
              { id: '3', status: 'pass', label: 'Contribution rule set', detail: 'IN.LWF.TN 2025-01' },
            ]}
          />
          <FormField label="Tamil Nadu LWF registration number" required>
            <TextField />
          </FormField>
        </div>
      </Dialog>
    </OpsDesk>
  );
}

/* =========================================================================================
 * CMP-03 · Statutory registers (T7)
 * ======================================================================================= */

export type RegisterKind = 'EPF' | 'ESIC' | 'PT' | 'LWF';
export interface RegistersScreenProps {
  rows: RegisterRow[];
  kind?: RegisterKind;
  state?: ListState;
  lwfNotDue?: boolean;
}
export function RegistersScreen({ rows, kind = 'EPF', state = 'ready', lwfNotDue }: RegistersScreenProps) {
  const [tab, setTab] = useState<RegisterKind>(kind);
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const fields: FilterFieldDef[] = [
    { key: 'location', label: 'Location', type: 'multi', options: ['Bengaluru head office', 'Chennai office', 'Hosur plant'].map((v) => ({ value: v, label: v })) },
    { key: 'coverage', label: 'Coverage', type: 'multi', options: ['Covered', 'Not covered', 'Not due'].map((v) => ({ value: v, label: v })) },
  ];
  const data = useMemo(() => {
    let r = rows.map((x): RegisterRow => {
      if (tab === 'ESIC') return x.gross <= 21000 ? { ...x, coverage: 'Covered' } : { ...x, coverage: 'Not covered', reason: 'Wages above ₹21,000 at the start of the contribution period' };
      if (tab === 'LWF' && lwfNotDue) return { ...x, coverage: 'Not due', reason: 'LWF is deducted in December in Karnataka' };
      if (tab === 'PT') return { ...x, coverage: x.gross >= 25000 ? 'Covered' : 'Not covered', reason: x.gross >= 25000 ? undefined : 'Below the ₹25,000 slab' };
      return x;
    });
    for (const f of filters) if (f.type === 'multi' && f.values.length) r = r.filter((x) => f.values.includes(String((x as unknown as Record<string, unknown>)[f.key])));
    return r;
  }, [rows, tab, filters, lwfNotDue]);
  const coverage: TableColumn<RegisterRow> = {
    key: 'coverage',
    header: 'Coverage',
    type: 'status',
    value: (r) => r.coverage,
    statusTone: (v) => (v === 'Covered' ? 'success' : 'neutral'),
    render: (r) => (
      <span className="yx-ops-stack" data-gap="sm">
        <Badge tone={r.coverage === 'Covered' ? 'success' : 'neutral'}>{r.coverage}</Badge>
        {r.reason && <span className="yx-ops-muted">{r.reason}</span>}
      </span>
    ),
    width: 260,
  };
  const person: TableColumn<RegisterRow> = { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 200 };
  const cols: Record<RegisterKind, TableColumn<RegisterRow>[]> = {
    EPF: [person, { key: 'uan', header: 'UAN', type: 'id', value: (r) => r.uan }, coverage, { key: 'pfw', header: 'PF wage', type: 'money', value: (r) => r.pfWage, total: 'sum' }, { key: 'ee', header: 'Employee 12%', type: 'money', value: (r) => r.ee, total: 'sum' }, { key: 'eps', header: 'EPS 8.33%', type: 'money', value: (r) => r.eps, total: 'sum' }, { key: 'er', header: 'EPF employer 3.67%', type: 'money', value: (r) => r.er, total: 'sum' }],
    ESIC: [person, { key: 'ip', header: 'IP number', type: 'id', value: (r) => r.ip ?? '—' }, coverage, { key: 'g', header: 'Gross', type: 'money', value: (r) => r.gross, total: 'sum' }, { key: 'ee', header: 'Employee 0.75%', type: 'money', value: (r) => (r.gross <= 21000 ? Math.ceil(r.gross * 0.0075) : 0), total: 'sum' }, { key: 'er', header: 'Employer 3.25%', type: 'money', value: (r) => (r.gross <= 21000 ? Math.ceil(r.gross * 0.0325) : 0), total: 'sum' }],
    PT: [person, { key: 'loc', header: 'Work location', value: (r) => r.location }, coverage, { key: 'g', header: 'Gross', type: 'money', value: (r) => r.gross, total: 'sum' }, { key: 'pt', header: 'PT', type: 'money', value: (r) => (r.gross >= 25000 ? 200 : 0), total: 'sum' }],
    LWF: [person, { key: 'loc', header: 'Work location', value: (r) => r.location }, coverage, { key: 'ee', header: 'Employee', type: 'money', value: (r) => (r.coverage === 'Covered' ? 50 : 0), total: 'sum' }, { key: 'er', header: 'Employer', type: 'money', value: (r) => (r.coverage === 'Covered' ? 100 : 0), total: 'sum' }],
  };
  const exportLabel = { EPF: 'Download ECR file', ESIC: 'Download ESIC portal file', PT: 'Download PT return file', LWF: 'Download LWF file' }[tab];
  return (
    <OpsDesk area="compliance" active="Registers">
      <PageHeader title="Statutory registers" description="Values stored on each payslip at calculation, never today's settings. Same numbers as the filing files." facts="August 2026 · Kaveri Foods Pvt Ltd" actions={<Button icon={Download}>{exportLabel}</Button>} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as RegisterKind)}>
        <TabsList aria-label="Registers">
          {(['EPF', 'ESIC', 'PT', 'LWF'] as RegisterKind[]).map((k) => (
            <TabsTrigger key={k} value={k}>
              {k}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab}>
          <div className="yx-ops-stack">
            <BarChart title={`${tab} contributions, last 6 months`} xLabel="Month" money categories={['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']} series={[{ name: 'Employee', values: [182000, 184500, 186200, 188000, 189400, 191230] }, { name: 'Employer', values: [182000, 184500, 186200, 188000, 189400, 191230] }]} stacked loading={state === 'loading'} />
            <DataTable
              label={`${tab} register`}
              columns={cols[tab]}
              rows={state === 'empty' ? [] : data}
              getRowId={(r) => r.id}
              state={state === 'empty' ? 'ready' : state}
              onRetry={() => {}}
              empty={<EmptyState title="No register for this month yet." description="Registers are generated when the payroll period locks." />}
              filtered={filters.length > 0}
              onClearFilters={() => setFilters([])}
              toolbar={<FilterBar fields={fields} value={filters} onChange={setFilters} searchPlaceholder="Search employee or UAN" />}
              onExport={() => {}}
            />
          </div>
        </TabsContent>
      </Tabs>
    </OpsDesk>
  );
}

/* =========================================================================================
 * CMP-04 · TDS challan sheet (T4)
 * ======================================================================================= */

export interface ChallanData {
  section: string;
  tan: string;
  deductionMonth: string;
  tds: number;
  surcharge: number;
  cess: number;
  deductedOn: Date;
  dueOn: Date;
}
export interface TdsChallanSheetProps {
  challan: ChallanData;
  today: Date;
  depositOn?: Date;
  edited?: boolean;
  items: StatuteItem[];
}
export function TdsChallanScreen({ challan, today, depositOn, edited, items }: TdsChallanSheetProps) {
  const [deposit, setDeposit] = useState<Date | null>(depositOn ?? today);
  const [amount, setAmount] = useState<number | null>(edited ? challan.tds - 1200 : challan.tds);
  const [reason, setReason] = useState('');
  const interest = deposit ? tdsLateInterest(amount ?? 0, challan.deductedOn, challan.dueOn, deposit) : 0;
  const changed = amount !== challan.tds;
  const total = (amount ?? 0) + challan.surcharge + challan.cess + interest;
  return (
    <OpsDesk area="compliance" active="TDS & Form 16">
      <PageHeader title="TDS & Form 16" description="Challans, quarterly returns and certificates." />
      <CardGrid min="lg">
        {items
          .filter((i) => i.statute.startsWith('TDS') || i.statute.startsWith('Form'))
          .map((i) => (
            <div key={i.id} className="yx-ops-stack">
              <StatuteCard item={i} today={today} />
            </div>
          ))}
      </CardGrid>
      <Drawer
        open
        onOpenChange={() => {}}
        size="lg"
        title={`TDS challan · ${challan.deductionMonth}`}
        subtitle={`Section ${challan.section} · TAN ${challan.tan} · due ${formatDate(challan.dueOn)}`}
        footer={
          <>
            <Button>Cancel</Button>
            <Button variant="primary" disabled={changed && !reason.trim()}>
              Save challan
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <InlineAlert tone="info">Pre-filled from the approved September payroll run and paid consultant invoices. Deposit on the tax portal, then record the challan here.</InlineAlert>
          <FieldRow>
            <FormField label="TDS deducted" helper={changed ? `Payroll says ${formatINR(challan.tds)}` : 'From the approved run'} required>
              <CurrencyField value={amount} onChange={setAmount} />
            </FormField>
            <FormField label="Deposit date" required>
              <DatePicker value={deposit} onChange={setDeposit} />
            </FormField>
          </FieldRow>
          {changed && (
            <FormField label="Reason for changing the amount" required error={reason.trim() ? null : 'Say why the amount differs from payroll. The change is audited.'}>
              <TextArea value={reason} onChange={setReason} rows={2} />
            </FormField>
          )}
          <DescriptionList
            items={[
              { label: 'Surcharge', value: formatINR(challan.surcharge) },
              { label: 'Health and education cess', value: formatINR(challan.cess) },
              { label: 'Interest for late deposit (estimate)', value: interest ? `${formatINR(interest)} · 1.5 % a month or part from ${formatDate(challan.deductedOn)}` : 'None: deposited by the due date' },
              { label: 'Late filing fee', value: `${formatINR(lateFilingFee(0, amount ?? 0))} · applies only if the return is filed late` },
              { label: 'Total to deposit', value: <strong>{formatINR(total)}</strong> },
            ]}
          />
          <FieldRow>
            <FormField label="BSR code" helper="7 digits">
              <TextField inputMode="numeric" maxLength={7} defaultValue={depositOn ? '0510308' : ''} />
            </FormField>
            <FormField label="Challan serial number">
              <TextField inputMode="numeric" defaultValue={depositOn ? '11207' : ''} />
            </FormField>
          </FieldRow>
          <FormField label="Challan receipt" helper="We read the BSR code, serial and date for you to confirm" optional>
            <FileUpload accept={['.pdf']} upload={async () => {}} />
          </FormField>
        </div>
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * CMP-05 · TDS return wizard (Form 138 / 24Q)
 * ======================================================================================= */

export interface TdsReturnWizardProps {
  form?: 'Form 138' | '24Q';
  quarter: string;
  months: { month: string; rows: number; status: string }[];
  current?: 'completeness' | 'reconcile' | 'validate' | 'file' | 'corrections';
  missingMonth?: boolean;
  difference?: number;
  mode?: 'self' | 'partner';
  filed?: boolean;
}
export function TdsReturnWizardScreen({ form = 'Form 138', quarter, months, current = 'completeness', missingMonth, difference = 0, mode = 'self', filed }: TdsReturnWizardProps) {
  const monthRows: CheckRow[] = months.map((m, i) => ({
    id: m.month,
    status: missingMonth && i === 0 ? 'fail' : 'pass',
    label: `${m.month}: ${missingMonth && i === 0 ? 'no deductee rows' : `${m.rows} deductee rows`}`,
    detail: missingMonth && i === 0 ? 'This entity started on YukthiX mid-quarter. Import the prior-month rows so the return is complete.' : m.status,
    action: missingMonth && i === 0 ? <Button size="sm" icon={Upload}>Import rows</Button> : undefined,
  }));
  const panRows: CheckRow[] = [
    { id: 'pan1', status: 'warn', label: 'Nisha Thomas: no PAN', detail: 'TDS at 20 %. The row carries the no-PAN flag.' },
    { id: 'pan2', status: 'warn', label: 'Rohan Das: PAN inoperative', detail: 'Checked today. Higher-rate TDS applied from August.' },
    { id: 'pan3', status: 'pass', label: '212 other PANs verified', detail: 'Operative status checked before filing' },
  ];
  const recon = [
    { id: 'c1', challan: 'BSR 0510308 · 11205 · 07 Aug 2026', month: 'Jul 2026', deducted: 468210, deposited: 468210 },
    { id: 'c2', challan: 'BSR 0510308 · 11206 · 07 Sep 2026', month: 'Aug 2026', deducted: 471830, deposited: 471830 - difference },
    { id: 'c3', challan: 'BSR 0510308 · 11207 · 06 Oct 2026', month: 'Sep 2026', deducted: 482340, deposited: 482340 },
  ];
  const steps = [
    {
      id: 'completeness',
      title: 'Data completeness',
      description: 'PANs, prior-month rows, challans',
      status: missingMonth ? ('error' as const) : undefined,
      statusNote: missingMonth ? 'July rows missing' : undefined,
      content: (
        <div className="yx-ops-stack">
          <p className="yx-ops-muted">Deductor and responsible-person details come from Statutory set-up (TAN BLRK01234E). They are not retyped here.</p>
          <CheckList label="Deductee rows by month" items={monthRows} />
          <CheckList label="PAN checks" items={panRows} />
        </div>
      ),
      summary: missingMonth ? 'July rows missing' : `${months.reduce((s, m) => s + m.rows, 0)} deductee rows, 2 PAN warnings`,
    },
    {
      id: 'reconcile',
      title: 'Challan reconciliation',
      description: 'Deposit vs deduction',
      status: difference ? ('error' as const) : undefined,
      statusNote: difference ? `${formatINR(difference, { decimals: 2 })} difference` : undefined,
      content: (
        <div className="yx-ops-stack">
          {difference ? <InlineAlert tone="danger">August deposit is {formatINR(difference, { decimals: 2 })} less than deducted. Pay the difference with interest, or correct the challan, before validating.</InlineAlert> : <InlineAlert tone="success">Every challan matches its deductions.</InlineAlert>}
          <DataTable
            label="Challan reconciliation"
            columns={[
              { key: 'ch', header: 'Challan', value: (r: (typeof recon)[number]) => r.challan, width: 280 },
              { key: 'm', header: 'Month', value: (r) => r.month },
              { key: 'd', header: 'Deducted', type: 'money', value: (r) => r.deducted, total: 'sum' },
              { key: 'p', header: 'Deposited', type: 'money', value: (r) => r.deposited, total: 'sum' },
              { key: 'x', header: 'Difference', type: 'status', value: (r) => (r.deducted === r.deposited ? 'Matches' : formatINR(r.deducted - r.deposited, { decimals: 2 })), statusTone: (v) => (v === 'Matches' ? 'success' : 'danger') },
            ]}
            rows={recon}
            getRowId={(r) => r.id}
          />
        </div>
      ),
      summary: difference ? 'Difference to fix' : '3 challans match',
    },
    {
      id: 'validate',
      title: mode === 'partner' ? 'Send to filing partner' : 'Validate (FVU)',
      content:
        mode === 'partner' ? (
          <div className="yx-ops-stack">
            <p className="yx-ops-muted">The return goes to your filing partner. Status, acknowledgement and Part A come back automatically.</p>
            <StatusTrail steps={[{ label: 'Generated' }, { label: 'Sent to partner' }, { label: 'Filed by partner' }, { label: 'Acknowledged' }]} current={1} />
          </div>
        ) : (
          <div className="yx-ops-stack">
            <CheckList label="FVU validation" items={[{ id: 'v1', status: 'pass', label: 'File validation utility passed', detail: 'FVU 9.2 · 0 errors, 0 warnings' }]} />
            <Button icon={Download}>Download FVU file</Button>
          </div>
        ),
      summary: mode === 'partner' ? 'Filing partner' : 'FVU passed',
    },
    {
      id: 'file',
      title: 'File and acknowledgement',
      content: filed ? (
        <div className="yx-ops-stack">
          <InlineAlert tone="success" title="Filed and locked">
            Acknowledgement 872310045612309 recorded on 29 Sep 2026. Corrections now go through a correction return.
          </InlineAlert>
        </div>
      ) : (
        <div className="yx-ops-stack">
          <FormField label="Acknowledgement number (token)" required>
            <TextField inputMode="numeric" />
          </FormField>
          <FormField label="Acknowledgement receipt" optional>
            <FileUpload accept={['.pdf']} upload={async () => {}} />
          </FormField>
        </div>
      ),
      summary: filed ? 'Filed' : 'Not filed',
    },
    {
      id: 'corrections',
      title: 'Corrections',
      description: 'Correction returns',
      content: (
        <div className="yx-ops-stack">
          <p className="yx-ops-muted">A filed return never changes. A correction return links to it; once accepted, revised certificates are generated and the old ones marked superseded.</p>
          <DataTable
            label="Correction returns"
            columns={[
              { key: 'q', header: 'Original', value: (r: { q: string; reason: string; status: string }) => r.q },
              { key: 'r', header: 'Reason', value: (r) => r.reason, width: 300 },
              { key: 's', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Accepted' ? 'success' : 'warning') },
            ]}
            rows={[{ q: '24Q Q4 FY 2025-26', reason: 'PAN corrected for 1 deductee', status: 'Accepted' }]}
            getRowId={(r) => r.q}
          />
        </div>
      ),
    },
  ];
  return (
    <OpsDesk area="compliance" active="TDS & Form 16">
      <PageHeader title={`${form} · ${quarter}`} description={form === 'Form 138' ? 'Salary TDS return under the Income-tax Act 2025.' : 'Correction of a quarter up to 31 Mar 2026, filed under the 1961 Act form.'} status={filed ? <Badge tone="success">Filed</Badge> : <Badge tone="warning">Draft</Badge>} />
      <Stepper key={current} title={`${form} ${quarter}`} steps={steps} defaultCurrent={current} finishLabel="Mark return filed" onContinue={(id) => !(id === 'completeness' && missingMonth) && !(id === 'reconcile' && difference)} />
    </OpsDesk>
  );
}

/* =========================================================================================
 * CMP-06 · Form 16 bulk (T5)
 * ======================================================================================= */

export interface F16Row {
  id: string;
  name: string;
  pan: string;
  partA: string;
  partB: string;
  signed: boolean;
  published: boolean;
}
export function Form16BulkScreen({ rows, current = 'partA', notYet, q2Linked }: { rows: F16Row[]; current?: string; notYet?: boolean; q2Linked?: boolean }) {
  const [publishOpen, setPublishOpen] = useState(false);
  if (notYet)
    return (
      <OpsDesk area="compliance" active="TDS & Form 16">
        <PageHeader title="Form 130 · tax year 2026-27" />
        <EmptyState title="Form 130 is available after the Q4 return is filed." description="For tax year 2026-27 that is after 31 May 2027. Employees see their monthly TDS in the tax workspace until then." action={<Button>Open Form 16 for FY 2025-26</Button>} />
      </OpsDesk>
    );
  const cols: TableColumn<F16Row>[] = [
    { key: 'n', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.pan }) },
    { key: 'a', header: 'Part A (TRACES)', type: 'status', value: (r) => r.partA, statusTone: (v) => (v === 'Imported' ? 'success' : 'danger') },
    { key: 'b', header: 'Part B', type: 'status', value: (r) => r.partB, statusTone: () => 'success' },
    { key: 's', header: 'Signed', type: 'status', value: (r) => (r.signed ? 'Signed' : 'Not signed'), statusTone: (v) => (v === 'Signed' ? 'success' : 'neutral') },
    { key: 'p', header: 'Published', type: 'status', value: (r) => (r.published ? 'In the app' : 'Not yet'), statusTone: (v) => (v === 'In the app' ? 'success' : 'neutral') },
  ];
  const ready = rows.filter((r) => r.partA === 'Imported').length;
  return (
    <OpsDesk area="compliance" active="TDS & Form 16">
      <PageHeader title="Form 16 · FY 2025-26" description="Year-end certificates for everyone who had TDS, including people who left. Issued in 2026 on the 1961 Act form." facts={`${rows.length} employees · ${ready} ready to sign`} />
      <Stepper
        key={current}
        title="Form 16 FY 2025-26"
        defaultCurrent={current}
        finishLabel="Publish certificates"
        onFinish={() => setPublishOpen(true)}
        steps={[
          {
            id: 'q4',
            title: 'Link the Q4 return',
            status: q2Linked ? 'error' : undefined,
            statusNote: q2Linked ? 'Not a Q4 return' : undefined,
            content: q2Linked ? (
              <InlineAlert tone="danger">The return you chose is Q2 (Jul–Sep 2025). Form 16 needs the filed Q4 return (Jan–Mar 2026).</InlineAlert>
            ) : (
              <InlineAlert tone="success">Linked: 24Q Q4 FY 2025-26, filed 28 May 2026, acknowledgement 872310045119004.</InlineAlert>
            ),
          },
          {
            id: 'partA',
            title: 'Import Part A',
            content: (
              <div className="yx-ops-stack">
                <FileUpload accept={['.zip']} upload={async () => {}} />
                {rows.some((r) => r.partA !== 'Imported') && <InlineAlert tone="warning">1 employee is not in the TRACES file: no PAN. Their certificate can't be issued until PAN is added and a correction return is accepted.</InlineAlert>}
                <DataTable label="Certificate status" columns={cols} rows={rows} getRowId={(r) => r.id} />
              </div>
            ),
          },
          { id: 'partB', title: 'Generate Part B', content: <InlineAlert tone="success">Part B generated for {rows.length} employees from payroll: salary, exemptions, deductions and tax.</InlineAlert> },
          {
            id: 'sign',
            title: 'Sign with DSC',
            content: (
              <div className="yx-ops-stack">
                <DescriptionList items={[{ label: 'Signer', value: 'Suresh Pillai, Payroll Manager' }, { label: 'Certificate', value: 'Class 3 DSC, valid to 14 Feb 2028' }]} />
                <Meter label="Signed" value={rows.filter((r) => r.signed).length} max={ready} />
              </div>
            ),
          },
          { id: 'publish', title: 'Publish', content: <p className="yx-ops-p">Employees and alumni get their certificate in the app. The notification says only that a document is ready.</p> },
        ]}
      />
      <TypeToConfirmDialog open={publishOpen} onOpenChange={setPublishOpen} title={`Publish ${ready} Form 16 certificates?`} consequence="Employees and alumni see them at once. A correction later issues a revised certificate; this one is kept as superseded." objectName="FORM16 FY2025-26" confirmLabel="Publish certificates" onConfirm={() => setPublishOpen(false)} />
    </OpsDesk>
  );
}

/* =========================================================================================
 * CMP-07 · Missing-ID dashboard (T6)
 * ======================================================================================= */

export interface MissingIdRow {
  id: string;
  name: string;
  code: string;
  dept: string;
  issue: string;
  detail: string;
  severity: string;
}
export function MissingIdsScreen({ rows, loading, persona = 'pa' }: { rows: MissingIdRow[]; loading?: boolean; persona?: 'pa' | 'hr' }) {
  const count = (k: string) => rows.filter((r) => r.issue.startsWith(k)).length;
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <OpsDesk area="compliance" active="Missing IDs" counts={{ 'Missing IDs': rows.length }}>
      <PageHeader title="Missing IDs" description="Statutory IDs and bank details that block filing or change tax. Also shown as warnings on the payroll pre-run check." actions={<Button icon={ExternalLink}>Open pre-run check</Button>} />
      {rows.length === 0 && !loading ? (
        <EmptyState title="Every statutory ID is in place." description="PAN, UAN, ESI IP numbers and bank accounts are complete and verified for all 248 people." />
      ) : (
        <>
          <CardGrid min="sm">
            <StatCard label="UAN missing" value={count('UAN')} drill={{ label: 'View people without UAN', href: '#uan' }} loading={loading} />
            <StatCard label="ESI IP missing" value={count('ESI')} drill={{ label: 'View people without IP number', href: '#ip' }} loading={loading} />
            <StatCard label="PAN missing or inoperative" value={count('PAN')} drill={{ label: 'View PAN issues', href: '#pan' }} loading={loading} />
            <StatCard label="Bank not verified" value={count('Bank')} drill={{ label: 'View bank issues', href: '#bank' }} loading={loading} />
          </CardGrid>
          <DataTable
            label="People with missing or invalid IDs"
            columns={[
              { key: 'n', header: 'Employee', type: 'person', value: (r: MissingIdRow) => r.name, person: (r) => ({ name: r.name, secondary: `${r.code} · ${r.dept}` }), width: 220 },
              { key: 'i', header: 'Issue', value: (r) => r.issue, groupable: true },
              { key: 'd', header: 'What it affects', value: (r) => r.detail, width: 360 },
              { key: 's', header: 'Impact', type: 'status', value: (r) => r.severity, statusTone: (v) => (String(v).startsWith('Blocks') ? 'danger' : 'warning') },
            ]}
            rows={rows}
            getRowId={(r) => r.id}
            state={loading ? 'loading' : 'ready'}
            selectable
            selectedIds={selected}
            onSelectedChange={setSelected}
            bulkActions={(ids) => (
              <>
                <Button size="sm">Ask {ids.length} to update</Button>
                {persona === 'hr' && <Button size="sm">Import from file</Button>}
              </>
            )}
            rowButtons={() => <Button size="sm">Fix</Button>}
          />
        </>
      )}
    </OpsDesk>
  );
}

/* =========================================================================================
 * CMP-08 · Statutory rules browser + labour-law updates
 * ======================================================================================= */

export interface Advisory {
  id: string;
  title: string;
  statutes: string;
  states: string;
  published: Date;
  effective: Date;
  severity: 'info' | 'action' | 'urgent';
  status: string;
  impact: string;
  reviewed: boolean;
}
export function RulesBrowserScreen({ rules, advisories, tab = 'rules', openRuleId = null, reviewId = null }: { rules: RuleSetRow[]; advisories: Advisory[]; tab?: 'rules' | 'updates'; openRuleId?: string | null; reviewId?: string | null }) {
  const [current, setCurrent] = useState(tab);
  const [open, setOpen] = useState<string | null>(openRuleId);
  const [review, setReview] = useState<string | null>(reviewId);
  const rule = rules.find((r) => r.id === open);
  const upcoming = advisories.find((a) => !a.reviewed && a.severity !== 'info');
  const sevTone = { info: 'neutral', action: 'warning', urgent: 'danger' } as const;
  return (
    <OpsDesk area="compliance" active="Rules & updates" counts={{ 'Rules & updates': advisories.filter((a) => !a.reviewed).length }}>
      <PageHeader title="Rules & updates" description="Read-only. Rates and due dates come from published, dated rules with sources. Companies choose only legal options." />
      {upcoming && (
        <PageBanner tone={upcoming.severity === 'urgent' ? 'danger' : 'warning'} action={<Button size="sm" onClick={() => setCurrent('updates')}>Read update</Button>}>
          {upcoming.title}. Effective {formatDate(upcoming.effective)}.
        </PageBanner>
      )}
      <Tabs value={current} onValueChange={(v) => setCurrent(v as 'rules' | 'updates')}>
        <TabsList aria-label="Rules sections">
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="updates" count={advisories.filter((a) => !a.reviewed).length}>
            Labour-law updates
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rules">
          <DataTable
            label="Statutory rule sets"
            columns={[
              { key: 's', header: 'Statute', type: 'id', value: (r: RuleSetRow) => r.statute },
              { key: 'j', header: 'Jurisdiction', value: (r) => r.jurisdiction, groupable: true },
              { key: 'n', header: 'Rule set', value: (r) => r.name, width: 280, render: (r) => (<span className="yx-ops-row">{r.name}{r.transitional && <Badge tone="warning">State rules pending: transitional</Badge>}</span>) },
              { key: 'v', header: 'Version', type: 'id', value: (r) => r.version },
              { key: 'f', header: 'Valid from', type: 'date', value: (r) => r.validFrom },
              { key: 'st', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'In force' ? 'success' : v === 'Upcoming' ? 'info' : 'neutral') },
            ]}
            rows={rules}
            getRowId={(r) => r.id}
            onRowClick={(r) => setOpen(r.id)}
            activeRowId={open}
          />
        </TabsContent>
        <TabsContent value="updates">
          <ul className="yx-ops-stack yx-ops-plain">
            {advisories.map((a) => (
              <li key={a.id} className="yx-ops-card">
                <div className="yx-ops-card__head">
                  <h3 className="yx-ops-card__title">{a.title}</h3>
                  <span className="yx-ops-row">
                    <Badge tone={sevTone[a.severity]}>{a.severity === 'urgent' ? 'Urgent' : a.severity === 'action' ? 'Action needed' : 'For information'}</Badge>
                    {a.reviewed && <Badge tone="success">Reviewed</Badge>}
                  </span>
                </div>
                <span className="yx-ops-card__sub">
                  {a.statutes} · {a.states} · {a.status} · effective {formatDate(a.effective)}
                </span>
                <p className="yx-ops-p">{a.impact}</p>
                <Actions>
                  <Button size="sm" icon={ExternalLink}>
                    Source
                  </Button>
                  <Button size="sm">Linked rule versions</Button>
                  {!a.reviewed && (
                    <Button size="sm" onClick={() => setReview(a.id)}>
                      Mark reviewed
                    </Button>
                  )}
                </Actions>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
      <Drawer open={!!rule} onOpenChange={(o) => !o && setOpen(null)} size="lg" title={rule ? `${rule.statute} · ${rule.name}` : ''} subtitle={rule ? `${rule.jurisdiction} · version ${rule.version}` : ''}>
        {rule && (
          <div className="yx-ops-stack">
            <DescriptionList items={[{ label: 'Valid from', value: formatDate(rule.validFrom) }, { label: 'Status', value: rule.status }, { label: 'Source', value: rule.source }, { label: 'Stored copy', value: 'PDF, checked by compliance owner and a second reviewer' }]} />
            {rule.statute === 'IN.PT' && (
              <Card title="Monthly slabs">
                <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                <table className="yx-ops-matrix">
                  <thead>
                    <tr>
                      <th scope="col">Gross monthly salary</th>
                      <th scope="col">PT</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Below {rule.version === '2026-10' ? '₹25,000' : '₹25,000'}</th>
                      <td data-num>₹0</td>
                    </tr>
                    <tr>
                      <th scope="row">₹25,000 and above</th>
                      <td data-num>₹200 (₹300 in February)</td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </Card>
            )}
            <Card title="Version history">
              <ul className="yx-ops-list">
                {rules
                  .filter((r) => r.statute === rule.statute && r.jurisdiction === rule.jurisdiction)
                  .map((r) => (
                    <li key={r.id} className="yx-ops-list__item">
                      <span>
                        {r.version} · from {formatDate(r.validFrom)}
                      </span>
                      <Badge tone={r.status === 'In force' ? 'success' : 'info'}>{r.status}</Badge>
                    </li>
                  ))}
              </ul>
            </Card>
          </div>
        )}
      </Drawer>
      <Dialog
        open={!!review}
        onOpenChange={(o) => !o && setReview(null)}
        title="Mark this update as reviewed?"
        footer={
          <>
            <Button onClick={() => setReview(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => setReview(null)}>
              Mark reviewed
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <FormField label="Note" helper="Saved with your name in the audit log">
            <TextArea rows={3} defaultValue="Checked contractor licences at Hosur; scope covers Tamil Nadu." />
          </FormField>
          <Checkbox label="Create a task" description="Assign follow-up work with a due date" />
          <Switch label="Share with HR admins" />
        </div>
      </Dialog>
    </OpsDesk>
  );
}

