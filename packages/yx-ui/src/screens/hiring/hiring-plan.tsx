// Hiring › Headcount plan, requisitions, rediscovery, jobs, pay range, internal jobs, referrals, recruiting costs.
// HIR-01, HIR-02, HIR-26, HIR-03, HIR-24, HIR-13, HIR-12, HIR-11 (M10 §3, Q1, YX-ATS-01 / 02 / 12 / 23 / 34 / 39 / 42, P09 Q3).
import { useMemo, useState } from 'react';
import { Briefcase, ExternalLink, Plus, Send, UserPlus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { FormField, FieldRow } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { BottomSheet } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { ApprovalTimeline, Timeline, type ApprovalStep, type TimelineItem } from '../../components/timeline';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FileUpload } from '../../components/upload';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { PhoneFrame } from '../_kit/frames';
import {
  canPublishJob,
  payHistoryAllowed,
  payRangeIssues,
  planBudgetLeft,
  planLineFree,
  referralBonusStatus,
  requisitionRoute,
  type PayLaw,
  type PayRange,
  type PlanLine,
} from './hiring-logic';
import { ConsentBadges, HireFrame, PostingStrip, RecordLayout, SummaryTiles, useListControls, type ConsentValue, type Posting } from './hiring-kit';
import type { Job, Requisition } from './hiring-data';
import './hiring.css';

export type ListState = 'ready' | 'loading' | 'error';
const L = (n: number) => formatINR(n);

/* ================================================================== HIR-01 · Headcount plan board */

export interface HeadcountPlanScreenProps {
  fy: string;
  lines: PlanLine[];
  persona: 'hr' | 'finance' | 'hm';
  /** Department the hiring manager owns (HM persona sees only this). */
  myDepartment?: string;
  planStatus: 'Approved' | 'Revision pending' | 'Draft';
  version: number;
  revisionSteps?: ApprovalStep[];
  state?: ListState;
  now?: Date;
}

// HIR-01
export function HeadcountPlanScreen({ fy, lines, persona, myDepartment, planStatus, version, revisionSteps, state = 'ready', now }: HeadcountPlanScreenProps) {
  const shown = persona === 'hm' && myDepartment ? lines.filter((l) => l.department === myDepartment) : lines;
  const depts = Array.from(new Set(shown.map((l) => l.department)));
  const sum = (f: (l: PlanLine) => number) => shown.reduce((s, l) => s + f(l), 0);
  const budget = sum((l) => l.budget);
  const committed = sum((l) => l.committed);
  const statusTone: BadgeTone = planStatus === 'Approved' ? 'success' : planStatus === 'Draft' ? 'neutral' : 'warning';
  const actions =
    persona === 'hr' ? (
      <>
        <Button>Export</Button>
        <Button variant="primary">Revise plan</Button>
      </>
    ) : persona === 'finance' ? (
      planStatus === 'Revision pending' ? (
        <>
          <Button>Send back</Button>
          <Button variant="primary">Approve revision</Button>
        </>
      ) : (
        <Button>Export</Button>
      )
    ) : (
      <Button variant="primary" icon={Plus}>
        Open requisition
      </Button>
    );

  return (
    <HireFrame active="Headcount plan">
      <PageHeader
        title="Headcount plan"
        status={<Badge tone={statusTone}>{planStatus} · v{version}</Badge>}
        description={`${fy} · positions by designation, grade and location, with budget. Requisitions draw it down; replacement hires don't use plan lines.`}
        facts={persona === 'hm' ? `Showing ${myDepartment} only` : `${depts.length} departments · approved by HR and finance`}
        actions={actions}
      />
      {state === 'loading' ? (
        <div className="yx-hire-board" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={240} />
          ))}
        </div>
      ) : state === 'error' ? (
        <ErrorState title="Couldn't load the headcount plan" description="Check your connection and try again. Your plan is unchanged." onRetry={() => {}} reference="HC-5021" />
      ) : shown.length === 0 ? (
        <EmptyState
          title={`No headcount plan for ${fy} yet`}
          description="Add positions per department with designation, grade, location and budget. HR and finance approve the plan before requisitions can draw it down."
          action={persona === 'hr' ? <Button variant="primary" icon={Plus}>Create plan</Button> : undefined}
        />
      ) : (
        <>
          {planStatus === 'Revision pending' && revisionSteps && (
            <InlineAlert tone="warning" title={`Revision v${version} waiting for approval`}>
              Adds 2 Shift Lead positions at Hosur and ₹12,00,000 budget. Requisitions keep drawing on v{version - 1} until it is approved.
              <ApprovalTimeline steps={revisionSteps} now={now} />
            </InlineAlert>
          )}
          <SummaryTiles
            label="Plan summary"
            tiles={[
              { label: 'Approved positions', value: sum((l) => l.approved) },
              { label: 'Filled', value: sum((l) => l.filled) },
              { label: 'Open requisitions', value: sum((l) => l.open) },
              { label: 'Free to requisition', value: sum(planLineFree) },
              { label: 'Budget committed', value: L(committed), sub: `of ${L(budget)} (${Math.round((committed / budget) * 100)}%)`, tone: committed / budget > 0.9 ? 'warning' : 'default' },
            ]}
          />
          <div className="yx-hire-board" role="list" aria-label="Plan lines by department">
            {depts.map((d) => {
              const ls = shown.filter((l) => l.department === d);
              return (
                <section key={d} className="yx-hire-board__col" role="listitem" aria-label={d}>
                  <header className="yx-hire-board__head">
                    <Text weight="semibold">{d}</Text>
                    <Text size="sm" tone="secondary">
                      {ls.reduce((s, l) => s + l.filled, 0)} of {ls.reduce((s, l) => s + l.approved, 0)} filled
                    </Text>
                  </header>
                  {ls.map((l) => {
                    const free = planLineFree(l);
                    const left = planBudgetLeft(l);
                    return (
                      <article key={l.id} className="yx-hire-board__card">
                        <Text weight="semibold">{l.designation}</Text>
                        <Text size="sm" tone="secondary">
                          {l.grade} · {l.location}
                        </Text>
                        <dl className="yx-hire-mini">
                          <div>
                            <dt>Approved</dt>
                            <dd>{l.approved}</dd>
                          </div>
                          <div>
                            <dt>Filled</dt>
                            <dd>{l.filled}</dd>
                          </div>
                          <div>
                            <dt>Open</dt>
                            <dd>{l.open}</dd>
                          </div>
                          <div>
                            <dt>Free</dt>
                            <dd>{free}</dd>
                          </div>
                        </dl>
                        {persona !== 'hm' && (
                          <Meter value={l.committed} max={l.budget} label={`Budget used, ${l.designation}`} warnAt={90} valueText={`${L(l.committed)} of ${L(l.budget)}`} />
                        )}
                        {free === 0 ? <Badge tone="warning">Fully drawn: a new requisition goes outside plan</Badge> : left < 0 ? <Badge tone="danger">Over budget</Badge> : null}
                        {persona === 'hm' && free > 0 && (
                          <Button size="sm" icon={Plus}>
                            Open requisition
                          </Button>
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      )}
    </HireFrame>
  );
}

/* ================================================================== HIR-26 · Rediscovery panel */

export interface RediscoveryMatch {
  id: string;
  name: string;
  lastRole: string;
  lastStage: string;
  reasons: string[];
  consent: { email: ConsentValue; whatsapp: ConsentValue };
  retentionUntil: Date;
  pool?: string;
}

// HIR-26
export function RediscoveryPanel({ matches, viewer, onAdd }: { matches: RediscoveryMatch[]; viewer: 'recruiter' | 'hm'; onAdd?: (id: string) => void }) {
  const [added, setAdded] = useState<string[]>([]);
  return (
    <Card title="Past candidates to consider" actions={<Badge tone="info">{matches.length} suggested</Badge>}>
      <Text as="p" size="sm" tone="secondary">
        Silver medallists and pool members matched on skills and location. Only people whose consent and retention period are still valid appear here.
      </Text>
      {matches.length === 0 ? (
        <EmptyState compact title="No past candidates match this requisition." description="Suggestions refresh when the skills or location change." />
      ) : (
        <ul className="yx-hire-list">
          {matches.map((m) => (
            <li key={m.id} className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <PersonLabel name={m.name} secondary={`${m.lastRole} · reached ${m.lastStage}`} />
                <div className="yx-hire-chips">
                  {m.reasons.map((r) => (
                    <Badge key={r}>{r}</Badge>
                  ))}
                  {m.pool && <Badge tone="info">Pool: {m.pool}</Badge>}
                </div>
                <ConsentBadges email={m.consent.email} whatsapp={m.consent.whatsapp} />
                <Text size="xs" tone="muted">
                  Retention until {formatDate(m.retentionUntil)}
                </Text>
              </div>
              {viewer === 'recruiter' ? (
                <div className="yx-hire-list__actions">
                  <Button size="sm" disabled={m.consent.email !== 'opted-in' && m.consent.whatsapp !== 'opted-in'}>
                    Contact
                  </Button>
                  <Button
                    size="sm"
                    icon={added.includes(m.id) ? undefined : UserPlus}
                    disabled={added.includes(m.id)}
                    onClick={() => {
                      setAdded((a) => [...a, m.id]);
                      onAdd?.(m.id);
                    }}
                  >
                    {added.includes(m.id) ? 'Added to pipeline' : 'Add to pipeline'}
                  </Button>
                </div>
              ) : (
                <div className="yx-hire-list__actions">
                  <Button size="sm">Suggest to recruiter</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <span className="yx-visually-hidden" aria-live="polite">
        {added.length ? `${added.length} added to the pipeline` : ''}
      </span>
    </Card>
  );
}

/* ================================================================== HIR-02 · Requisitions */

export interface RequisitionsScreenProps {
  rows: Requisition[];
  planLines: PlanLine[];
  persona: 'hm' | 'recruiter';
  me?: string;
  openId?: string | null;
  sheetOpen?: boolean;
  rediscovery?: RediscoveryMatch[];
  state?: ListState;
  now?: Date;
}

const REQ_TONE: Record<Requisition['status'], BadgeTone> = { Draft: 'neutral', 'Pending approval': 'warning', Approved: 'success', 'Sent back': 'danger', Filled: 'info', Closed: 'neutral' };

// HIR-02
export function RequisitionsScreen({ rows, planLines, persona, me = 'Karthik Subramanian', openId = null, sheetOpen = false, rediscovery = [], state = 'ready', now }: RequisitionsScreenProps) {
  const base = persona === 'hm' ? rows.filter((r) => r.hiringManager === me) : rows;
  const [open, setOpen] = useState<string | null>(openId);
  const [sheet, setSheet] = useState(sheetOpen);
  const lineOf = (r: Requisition) => planLines.find((l) => l.id === r.planLineId) ?? null;
  const planText = (r: Requisition) => (r.replacementFor ? 'Replacement' : r.planLineId ? 'In plan' : 'Outside plan');
  const list = useListControls({
    rows: base,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: ['Draft', 'Pending approval', 'Approved', 'Sent back', 'Filled'].map((v) => ({ value: v, label: v })) },
      { key: 'plan', label: 'Plan', type: 'multi', options: ['In plan', 'Outside plan', 'Replacement'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.code} ${r.title} ${r.department}`,
    fieldValue: (r, k) => (k === 'status' ? r.status : planText(r)),
    views: [
      { id: 'all', name: persona === 'hm' ? 'My requisitions' : 'All requisitions' },
      { id: 'pending', name: 'Waiting for approval', shared: true },
    ],
    searchPlaceholder: 'Search requisitions',
  });
  const cols: TableColumn<Requisition>[] = [
    { key: 'code', header: 'Requisition', type: 'id', value: (r) => r.code, width: 120 },
    { key: 'title', header: 'Position', value: (r) => r.title, render: (r) => <PersonLabel name={r.title} secondary={`${r.department} · ${r.location}`} size={24} /> },
    { key: 'plan', header: 'Plan', type: 'status', value: planText, statusTone: (v) => (v === 'Outside plan' ? 'warning' : v === 'Replacement' ? 'info' : 'success') },
    { key: 'max', header: 'Pay up to', type: 'money', value: (r) => r.proposedMax },
    { key: 'positions', header: 'Positions', type: 'number', value: (r) => r.positions, total: 'sum' },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => REQ_TONE[v as Requisition['status']] },
    { key: 'waiting', header: 'Waiting on', value: (r) => r.waitingOn ?? '—' },
    { key: 'hm', header: 'Hiring manager', type: 'person', value: (r) => r.hiringManager, person: (r) => ({ name: r.hiringManager }) },
    { key: 'raised', header: 'Raised', type: 'date', value: (r) => r.raised },
  ];
  const current = base.find((r) => r.id === open) ?? null;

  return (
    <HireFrame active="Jobs & requisitions">
      <PageHeader
        title="Requisitions"
        description="Requests to hire against the headcount plan. Outside plan or above the plan budget adds an extra approval."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setSheet(true)}>
            New requisition
          </Button>
        }
      />
      <DataTable
        label="Requisitions"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={() => {}}
        errorReference="REQ-4410"
        filtered={list.filtered}
        onClearFilters={list.clear}
        toolbar={list.toolbar}
        views={list.views}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
        selectable={persona === 'recruiter'}
        bulkActions={() => <Button size="sm">Assign recruiter</Button>}
        rowActions={() => (
          <>
            <MenuItem>Open job</MenuItem>
            <MenuItem>Duplicate</MenuItem>
            <MenuItem destructive>Cancel requisition</MenuItem>
          </>
        )}
        empty={<EmptyState title="No requisitions yet." description="Open one from a free position on the headcount plan, or outside the plan with a reason." action={<Button variant="primary" icon={Plus} onClick={() => setSheet(true)}>New requisition</Button>} />}
        onExport={() => {}}
      />
      {current && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          size="lg"
          title={`${current.code} · ${current.title}`}
          subtitle={`${current.department} · ${current.location} · ${current.grade}`}
          meta={<Badge tone={REQ_TONE[current.status]}>{current.status}</Badge>}
          footer={
            persona === 'hm' && current.status === 'Sent back' ? (
              <>
                <Button onClick={() => setOpen(null)}>Close</Button>
                <Button variant="primary">Edit and resubmit</Button>
              </>
            ) : (
              <>
                <Button onClick={() => setOpen(null)}>Close</Button>
                {current.status === 'Approved' && persona === 'recruiter' && <Button variant="primary">Create job</Button>}
              </>
            )
          }
        >
          <RequisitionDetail req={current} line={lineOf(current)} now={now} />
          {persona === 'recruiter' || persona === 'hm' ? <RediscoveryPanel matches={rediscovery} viewer={persona === 'hm' ? 'hm' : 'recruiter'} /> : null}
        </Drawer>
      )}
      <RequisitionSheet open={sheet} onOpenChange={setSheet} planLines={planLines} />
    </HireFrame>
  );
}

function RequisitionDetail({ req, line, now }: { req: Requisition; line: PlanLine | null; now?: Date }) {
  const route = requisitionRoute({ planLine: line, proposedMax: req.proposedMax, replacementFor: req.replacementFor });
  const done = req.status === 'Approved' || req.status === 'Filled';
  const waitingIdx = req.waitingOn ? route.steps.indexOf(req.waitingOn) : -1;
  const steps: ApprovalStep[] = route.steps.map((s, i) => ({
    id: s,
    label: s,
    status: done ? 'done' : req.status === 'Sent back' && i === 0 ? 'rejected' : waitingIdx === -1 ? (i === 0 ? 'current' : 'pending') : i < waitingIdx ? 'done' : i === waitingIdx ? 'current' : 'pending',
    approver: s === 'Hiring manager' ? req.hiringManager : s === 'HR business partner' ? 'Lakshmi Venkatesan' : s === 'Finance' ? 'Ravi Shankar' : 'Meenakshi Sundaram',
    comment: req.status === 'Sent back' && i === 0 ? 'Add the client territory and confirm the grade.' : undefined,
  }));
  return (
    <div className="yx-hire-stack">
      {route.extra ? (
        <InlineAlert tone="warning" title="Extra approval needed">
          {route.reasons.join('. ')}. The CFO approves after finance.
        </InlineAlert>
      ) : req.replacementFor ? (
        <InlineAlert tone="info" title="Replacement hire">
          {route.reasons[0]}.
        </InlineAlert>
      ) : (
        <InlineAlert tone="success" title="Inside the approved plan">
          Short approval chain: hiring manager, HR business partner, finance.
        </InlineAlert>
      )}
      <DescriptionList
        columns={2}
        items={[
          { label: 'Plan line', value: line ? `${line.designation} · ${line.grade} · ${line.location}` : 'Outside plan' },
          { label: 'Free on line', value: line ? `${planLineFree(line)} of ${line.approved}` : '—' },
          { label: 'Budget left on line', value: line ? formatINR(planBudgetLeft(line)) : '—' },
          { label: 'Pay up to', value: formatINR(req.proposedMax) },
          { label: 'Recruiter', value: req.recruiter },
          { label: 'Raised', value: formatDate(req.raised) },
        ]}
      />
      <ApprovalTimeline steps={steps} now={now} />
    </div>
  );
}

export function RequisitionSheet({ open, onOpenChange, planLines, defaultLine = 'pl3', defaultMax = 8_40_000 }: { open: boolean; onOpenChange: (o: boolean) => void; planLines: PlanLine[]; defaultLine?: string | null; defaultMax?: number }) {
  const [lineId, setLineId] = useState<string | null>(defaultLine);
  const [outside, setOutside] = useState(defaultLine == null);
  const [max, setMax] = useState<number | null>(defaultMax);
  const [positions, setPositions] = useState<number | null>(1);
  const [reason, setReason] = useState('');
  const [replacement, setReplacement] = useState(false);
  const line = outside ? null : planLines.find((l) => l.id === lineId) ?? null;
  const route = requisitionRoute({ planLine: line, proposedMax: max ?? 0, replacementFor: replacement ? 'Rohit Bhat' : null });
  const needReason = outside && !reason.trim();
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New requisition"
      subtitle="Hiring manager request · Engineering"
      dirty={reason.length > 0}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button>Save draft</Button>
          <Button variant="primary" icon={Send} disabled={needReason || !max}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="yx-hire-sheet">
        <div className="yx-hire-sheet__form">
          <Switch className="yx-hire-switch" label="Replacement for a leaver" description="Linked to the exit; doesn't use a new plan line." checked={replacement} onChange={setReplacement} />
          <FormField label="Plan line" required helper="Only lines with a free position are listed.">
            <Select
              value={outside ? null : lineId}
              onChange={(v) => {
                setLineId(v);
                setOutside(false);
              }}
              disabled={outside}
              options={planLines.map((l) => ({ value: l.id, label: `${l.designation} · ${l.grade} · ${l.location}`, description: `${planLineFree(l)} free · ${formatINR(planBudgetLeft(l))} budget left`, disabled: planLineFree(l) === 0 }))}
            />
          </FormField>
          <Checkbox label="This hire is outside the approved plan" checked={outside} onChange={setOutside} />
          {outside && (
            <FormField label="Why is this needed outside the plan?" required error={needReason ? 'Enter a reason so the CFO can decide.' : null}>
              <TextArea value={reason} onChange={setReason} rows={3} />
            </FormField>
          )}
          <FieldRow>
            <FormField label="Positions" required>
              <NumberField value={positions} onChange={setPositions} min={1} max={20} />
            </FormField>
            <FormField label="Pay up to (annual CTC)" required helper="From the grade pay range">
              <CurrencyField value={max} onChange={setMax} />
            </FormField>
          </FieldRow>
          <FormField label="Target joining date" optional>
            <DatePicker value={new Date(2026, 11, 1)} onChange={() => {}} />
          </FormField>
        </div>
        <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="What happens">
          <Text weight="semibold">What happens</Text>
          {route.extra ? <Badge tone="warning">Extra approval: CFO</Badge> : <Badge tone="success">Short chain</Badge>}
          <ol className="yx-hire-steps">
            {route.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {route.reasons.map((r) => (
            <Text key={r} as="p" size="sm" tone="secondary">
              {r}
            </Text>
          ))}
          {line && (
            <Text as="p" size="sm" tone="secondary">
              After approval: {Math.max(0, planLineFree(line) - (positions ?? 0))} positions stay free on this line.
            </Text>
          )}
        </aside>
      </div>
    </Drawer>
  );
}

/* ================================================================== HIR-24 · Job pay range panel */

export interface JobPayRangePanelProps {
  location: string;
  law: PayLaw;
  defaultRange?: PayRange;
  defaultShowRange?: boolean;
  defaultHistoryQuestion?: boolean;
  onPublish?: () => void;
}

// HIR-24
export function JobPayRangePanel({ location, law, defaultRange = { min: null, max: null }, defaultShowRange = true, defaultHistoryQuestion = false, onPublish }: JobPayRangePanelProps) {
  const [range, setRange] = useState<PayRange>(defaultRange);
  const [show, setShow] = useState(defaultShowRange || law.rangeRequired);
  const [period, setPeriod] = useState<string | null>('year');
  const [history, setHistory] = useState(defaultHistoryQuestion && payHistoryAllowed(law));
  const issues = payRangeIssues(range, law, show);
  const ok = canPublishJob(range, law, show);
  return (
    <Card
      title="Pay range"
      actions={law.rangeRequired ? <Badge tone="info">Set by law · {location}</Badge> : <Badge>Company setting</Badge>}
      footer={
        <div className="yx-hire-row">
          <Text size="sm" tone={ok ? 'secondary' : 'danger'}>
            {ok ? 'Ready to publish.' : 'Publishing is blocked until the pay range is fixed.'}
          </Text>
          <Button variant="primary" disabled={!ok} onClick={onPublish}>
            Publish job
          </Button>
        </div>
      }
    >
      {law.rangeRequired && (
        <InlineAlert tone="info">
          {location} has a pay-transparency law ({law.source}). A pay range is required on the job ad and careers page.
        </InlineAlert>
      )}
      {issues.length > 0 && (
        <InlineAlert tone="danger" title="Fix before publishing">
          <ul className="yx-hire-plainlist">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      <FieldRow>
        <FormField label="Minimum" required={law.rangeRequired || show}>
          <CurrencyField value={range.min} onChange={(v) => setRange((r) => ({ ...r, min: v }))} />
        </FormField>
        <FormField label="Maximum" required={law.rangeRequired || show}>
          <CurrencyField value={range.max} onChange={(v) => setRange((r) => ({ ...r, max: v }))} />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Currency">
          <Select value="INR" onChange={() => {}} options={[{ value: 'INR', label: 'INR (₹)' }]} />
        </FormField>
        <FormField label="Period">
          <Select value={period} onChange={setPeriod} options={[{ value: 'year', label: 'Per year (CTC)' }, { value: 'month', label: 'Per month' }, { value: 'hour', label: 'Per hour' }]} />
        </FormField>
      </FieldRow>
      <Switch className="yx-hire-switch" label="Show pay range on the careers page and job boards" description={law.rangeRequired ? 'Required by law for this location.' : 'YukthiX starter: on. You can switch it off for this job.'} checked={show} disabled={law.rangeRequired} onChange={setShow} />
      <Switch className="yx-hire-switch"
        label="Ask applicants about their current or past pay"
        description={law.historyBanned ? `Not allowed: the law for ${location} bans pay-history questions.` : 'Off by default. Switch on only if your company needs it.'}
        checked={history}
        disabled={law.historyBanned}
        onChange={setHistory}
      />
    </Card>
  );
}

/* ================================================================== HIR-03 · Jobs list + job workspace */

const JOB_TONE: Record<Job['status'], BadgeTone> = { Open: 'success', Draft: 'neutral', 'On hold': 'warning', Closed: 'neutral' };

// HIR-03
export function JobsScreen({ rows, state = 'ready' }: { rows: Job[]; state?: ListState }) {
  const list = useListControls({
    rows,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: ['Open', 'Draft', 'On hold', 'Closed'].map((v) => ({ value: v, label: v })) },
      { key: 'type', label: 'Type', type: 'multi', options: ['Full time', 'Contract', 'Campus'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.code} ${r.title} ${r.location} ${r.client ?? ''}`,
    fieldValue: (r, k) => (k === 'status' ? r.status : r.type),
    views: [
      { id: 'mine', name: 'My open jobs' },
      { id: 'all', name: 'All jobs', shared: true },
    ],
    searchPlaceholder: 'Search jobs',
  });
  const cols: TableColumn<Job>[] = [
    { key: 'code', header: 'Job', type: 'id', value: (r) => r.code, width: 110 },
    { key: 'title', header: 'Title', value: (r) => r.title, render: (r) => <PersonLabel name={r.title} secondary={r.client ? `${r.client} · ${r.location}` : `${r.department} · ${r.location}`} /> },
    { key: 'type', header: 'Type', value: (r) => r.type, groupable: true },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => JOB_TONE[v as Job['status']] },
    { key: 'applicants', header: 'Applicants', type: 'number', value: (r) => r.applicants, total: 'sum' },
    { key: 'pipeline', header: 'In pipeline', type: 'number', value: (r) => r.inPipeline },
    { key: 'recruiter', header: 'Recruiter', type: 'person', value: (r) => r.recruiter, person: (r) => ({ name: r.recruiter }) },
    { key: 'posted', header: 'Posted', type: 'date', value: (r) => r.posted },
  ];
  return (
    <HireFrame active="Jobs & requisitions">
      <PageHeader title="Jobs" description="Jobs link to departments, designations, grades and locations. Filling or closing the requisition closes every live board posting." actions={<Button variant="primary" icon={Plus}>Create job</Button>} />
      <DataTable
        label="Jobs"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={() => {}}
        filtered={list.filtered}
        onClearFilters={list.clear}
        toolbar={list.toolbar}
        views={list.views}
        onRowClick={() => {}}
        rowActions={() => (
          <>
            <MenuItem>Copy careers link</MenuItem>
            <MenuItem>Put on hold</MenuItem>
            <MenuItem destructive>Close job</MenuItem>
          </>
        )}
        empty={<EmptyState title="No jobs yet." description="Create a job from an approved requisition." action={<Button variant="primary" icon={Plus}>Create job</Button>} />}
        onExport={() => {}}
      />
    </HireFrame>
  );
}

export interface JobWorkspaceScreenProps {
  job: Job;
  postings: Posting[];
  law: PayLaw;
  range: PayRange;
  activity: TimelineItem[];
  defaultTab?: 'overview' | 'postings' | 'pay' | 'sharing';
  now?: Date;
}

// HIR-03 (workspace)
export function JobWorkspaceScreen({ job, postings: initial, law, range, activity, defaultTab = 'overview', now }: JobWorkspaceScreenProps) {
  const [postings, setPostings] = useState(initial);
  const [msg, setMsg] = useState('');
  const act = (board: string, action: 'post' | 'refresh' | 'close') => {
    setPostings((ps) => ps.map((p) => (p.board === board ? { ...p, status: action === 'close' ? 'closed' : action === 'refresh' ? 'refreshed' : 'live', error: undefined } : p)));
    setMsg(`${board}: ${action === 'close' ? 'closed' : action === 'refresh' ? 'refreshed' : 'posted'}`);
  };
  const liveCount = postings.filter((p) => p.status === 'live' || p.status === 'refreshed').length;
  return (
    <HireFrame active="Jobs & requisitions">
      <RecordLayout
        header={
          <ObjectHeader
            name={job.title}
            icon={Briefcase}
            secondary={`${job.code} · ${job.department} · ${job.location}`}
            status={<Badge tone={JOB_TONE[job.status]}>{job.status}</Badge>}
            facts={[
              { label: 'Applicants', value: job.applicants },
              { label: 'In pipeline', value: job.inPipeline },
              { label: 'Live postings', value: liveCount },
              { label: 'Hiring manager', value: job.hiringManager },
              { label: 'Careers URL', value: `/careers/kaveri-foods/${job.slug}` },
            ]}
            actions={
              <>
                <Button icon={ExternalLink}>View careers page</Button>
                <Button variant="primary">Open pipeline</Button>
              </>
            }
            menu={
              <>
                <MenuItem>Share with vendors</MenuItem>
                <MenuItem>Put on hold</MenuItem>
                <MenuItem destructive>Close job and all postings</MenuItem>
              </>
            }
          />
        }
        aside={
          <>
            <Text weight="semibold">Activity</Text>
            <Timeline items={activity} today={now} />
          </>
        }
      >
        <Tabs defaultValue={defaultTab}>
          <TabsList aria-label="Job sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="postings" count={postings.length}>
              Job-board postings
            </TabsTrigger>
            <TabsTrigger value="pay">Pay range</TabsTrigger>
            <TabsTrigger value="sharing">Referrals & internal</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Department', value: job.department },
                { label: 'Designation · grade', value: `${job.title} · G6` },
                { label: 'Location', value: job.location },
                { label: 'Legal entity', value: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
                { label: 'Requisition', value: 'REQ-0142 · in plan', mono: true },
                { label: 'Pipeline template', value: 'Engineering, 6 stages' },
                { label: 'Scorecard', value: 'QA engineering (4 skills, pass bar 3 of 5)' },
                { label: 'Employment type', value: job.type },
              ]}
            />
          </TabsContent>
          <TabsContent value="postings">
            <div className="yx-hire-stack">
              <Text as="p" size="sm" tone="secondary">
                Posted through your company&rsquo;s own board accounts. Board fees are your contract with the board; costs flow into recruiting costs.
              </Text>
              <PostingStrip postings={postings} onAction={act} />
              <span className="yx-visually-hidden" aria-live="polite">
                {msg}
              </span>
            </div>
          </TabsContent>
          <TabsContent value="pay">
            <JobPayRangePanel location={job.location} law={law} defaultRange={range} />
          </TabsContent>
          <TabsContent value="sharing">
            <div className="yx-hire-stack">
              <Switch className="yx-hire-switch" label="Show on internal jobs" description="Employees can apply; tests taken are hidden from their current manager." defaultChecked={job.internal} />
              <Switch className="yx-hire-switch" label="Open for referrals" description="Referral bonus ₹25,000 after the hire completes 90 days." defaultChecked />
            </div>
          </TabsContent>
        </Tabs>
      </RecordLayout>
    </HireFrame>
  );
}

/* ================================================================== HIR-13 · Internal jobs */

export interface InternalApplication {
  id: string;
  job: string;
  applied: Date;
  status: 'Applied' | 'Assessment' | 'Interview' | 'Offer' | 'Not selected';
}

export interface InternalJobsProps {
  jobs: Job[];
  applications: InternalApplication[];
  applyFor?: string | null;
  eligible?: boolean;
}

function InternalJobCards({ jobs, onApply }: { jobs: Job[]; onApply: (id: string) => void }) {
  if (jobs.length === 0) return <EmptyState title="No internal openings right now." description="New internal jobs appear here and in your notifications." />;
  return (
    <ul className="yx-hire-cards" aria-label="Internal openings">
      {jobs.map((j) => (
        <li key={j.id} className="yx-hire-cards__card">
          <Text weight="semibold">{j.title}</Text>
          <Text size="sm" tone="secondary">
            {j.department} · {j.location} · {j.type}
          </Text>
          <Text size="sm">Posted {j.posted ? formatDate(j.posted) : '—'}</Text>
          <Button size="sm" onClick={() => onApply(j.id)}>
            Apply
          </Button>
        </li>
      ))}
    </ul>
  );
}

function InternalApplyForm({ job, eligible }: { job: Job; eligible: boolean }) {
  return (
    <div className="yx-hire-stack">
      {!eligible && (
        <InlineAlert tone="warning" title="You can apply after 12 months in your current role">
          You moved roles on 1 Jan 2026. Internal applications open for you on 1 Jan 2027 (company rule).
        </InlineAlert>
      )}
      <InlineAlert tone="info">
        Your manager, Karthik Subramanian, is told when you reach the offer stage. Test results for this job are visible only to its hiring manager and HR, not to your current manager.
      </InlineAlert>
      <FormField label="Why are you interested?" required>
        <TextArea rows={4} placeholder={`What you would bring to ${job.title}`} />
      </FormField>
      <FormField label="Updated résumé" optional helper="Your profile is used if you don't add one.">
        <FileUpload upload={async () => {}} accept={['.pdf', '.docx']} multiple={false} />
      </FormField>
    </div>
  );
}

const APP_TONE: Record<InternalApplication['status'], BadgeTone> = { Applied: 'neutral', Assessment: 'info', Interview: 'info', Offer: 'success', 'Not selected': 'neutral' };

// HIR-13
export function InternalJobsScreen({ jobs, applications, applyFor = null, eligible = true }: InternalJobsProps) {
  const [apply, setApply] = useState<string | null>(applyFor);
  const job = jobs.find((j) => j.id === apply);
  return (
    <HireFrame active="Jobs & requisitions">
      <PageHeader title="Internal jobs" description="Openings at Kaveri Foods you can apply for. Applying doesn't affect your current role." />
      <InternalJobCards jobs={jobs} onApply={setApply} />
      <Card title="My applications">
        {applications.length === 0 ? (
          <EmptyState compact title="You haven't applied to any internal job yet." />
        ) : (
          <ul className="yx-hire-list">
            {applications.map((a) => (
              <li key={a.id} className="yx-hire-list__item">
                <div className="yx-hire-list__main">
                  <Text weight="medium">{a.job}</Text>
                  <Text size="sm" tone="secondary">
                    Applied {formatDate(a.applied)}
                  </Text>
                </div>
                <Badge tone={APP_TONE[a.status]}>{a.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {job && (
        <Drawer
          open
          onOpenChange={(o) => !o && setApply(null)}
          title={`Apply for ${job.title}`}
          subtitle={`${job.department} · ${job.location}`}
          footer={
            <>
              <Button onClick={() => setApply(null)}>Cancel</Button>
              <Button variant="primary" disabled={!eligible}>
                Send application
              </Button>
            </>
          }
        >
          <InternalApplyForm job={job} eligible={eligible} />
        </Drawer>
      )}
    </HireFrame>
  );
}

// HIR-13 (phone)
export function InternalJobsPhone({ jobs, applications, applyFor = null, eligible = true }: InternalJobsProps) {
  const [apply, setApply] = useState<string | null>(applyFor);
  const job = jobs.find((j) => j.id === apply);
  return (
    <PhoneFrame tab="me" title="Internal jobs">
      <InternalJobCards jobs={jobs} onApply={setApply} />
      <Text weight="semibold">My applications</Text>
      {applications.map((a) => (
        <div key={a.id} className="yx-hire-row">
          <Text>{a.job}</Text>
          <Badge tone={APP_TONE[a.status]}>{a.status}</Badge>
        </div>
      ))}
      {job && (
        <BottomSheet
          open
          onOpenChange={(o) => !o && setApply(null)}
          title={`Apply for ${job.title}`}
          footer={
            <Button variant="primary" fullWidth disabled={!eligible}>
              Send application
            </Button>
          }
        >
          <InternalApplyForm job={job} eligible={eligible} />
        </BottomSheet>
      )}
    </PhoneFrame>
  );
}

/* ================================================================== HIR-12 · Referrals */

export interface Referral {
  id: string;
  name: string;
  job: string;
  referred: Date;
  stage: 'Applied' | 'In process' | 'Hired' | 'Not selected';
  joined: Date | null;
  bonus: number;
  paid?: boolean;
}

function ReferralRows({ rows, today }: { rows: Referral[]; today: Date }) {
  if (rows.length === 0) return <EmptyState compact title="You haven't referred anyone yet." description="Refer a friend to an open job. You get a bonus when they complete 90 days." />;
  return (
    <ul className="yx-hire-list">
      {rows.map((r) => {
        const b = referralBonusStatus(r.stage === 'Hired' ? r.joined : null, today);
        const bonusText =
          r.stage !== 'Hired'
            ? r.stage === 'Not selected'
              ? 'No bonus'
              : 'Bonus after they join and complete 90 days'
            : r.paid
              ? `${formatINR(r.bonus)} paid in payroll`
              : b.state === 'eligible'
                ? `${formatINR(r.bonus)} eligible · paid in the next payroll`
                : `${formatINR(r.bonus)} on ${formatDate(b.eligibleOn)} (${b.daysLeft} days to go)`;
        return (
          <li key={r.id} className="yx-hire-list__item">
            <div className="yx-hire-list__main">
              <PersonLabel name={r.name} secondary={`${r.job} · referred ${formatDate(r.referred)}`} />
              <Text size="sm" tone="secondary">
                {bonusText}
              </Text>
            </div>
            <Badge tone={r.stage === 'Hired' ? 'success' : r.stage === 'Not selected' ? 'neutral' : 'info'}>{r.stage}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

function ReferForm({ jobs, duplicate }: { jobs: Job[]; duplicate?: boolean }) {
  const [job, setJob] = useState<string | null>(jobs[0]?.id ?? null);
  return (
    <div className="yx-hire-stack">
      <FormField label="Job" required>
        <Select value={job} onChange={setJob} options={jobs.map((j) => ({ value: j.id, label: j.title, description: j.location }))} />
      </FormField>
      <FormField label="Friend's full name" required>
        <TextField defaultValue={duplicate ? 'Ananya Iyer' : ''} />
      </FormField>
      <FieldRow>
        <FormField label="Email" required>
          <TextField type="email" defaultValue={duplicate ? 'ananya.iyer@mailbox.in' : ''} />
        </FormField>
        <FormField label="Mobile" required>
          <TextField type="tel" prefix="+91" />
        </FormField>
      </FieldRow>
      <FormField label="Résumé" optional>
        <FileUpload upload={async () => {}} accept={['.pdf', '.docx']} multiple={false} />
      </FormField>
      {duplicate && (
        <InlineAlert tone="warning" title="Already in our system">
          This person applied for this job in the last 90 days, so the referral can&rsquo;t be credited. You can still refer them to another job.
        </InlineAlert>
      )}
      <Checkbox label="My friend agreed that I can share their details" required />
    </div>
  );
}

// HIR-12
export function ReferralsScreen({ jobs, referrals, today, referOpen = false, duplicate = false }: { jobs: Job[]; referrals: Referral[]; today: Date; referOpen?: boolean; duplicate?: boolean }) {
  const [open, setOpen] = useState(referOpen);
  const pending = referrals.filter((r) => r.stage === 'Hired' && !r.paid).reduce((s, r) => s + r.bonus, 0);
  return (
    <HireFrame active="Candidates & talent CRM">
      <PageHeader title="Referrals" description="Refer people you know. The bonus is paid through payroll once they complete 90 days." actions={<Button variant="primary" icon={UserPlus} onClick={() => setOpen(true)}>Refer someone</Button>} />
      <SummaryTiles
        label="My referrals"
        tiles={[
          { label: 'Referred', value: referrals.length },
          { label: 'Hired', value: referrals.filter((r) => r.stage === 'Hired').length },
          { label: 'Bonus pending', value: formatINR(pending) },
          { label: 'Bonus paid', value: formatINR(referrals.filter((r) => r.paid).reduce((s, r) => s + r.bonus, 0)) },
        ]}
      />
      <Card title="My referrals">
        <ReferralRows rows={referrals} today={today} />
      </Card>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Refer someone"
        subtitle="Referral bonus up to ₹25,000"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={duplicate}>
              Send referral
            </Button>
          </>
        }
      >
        <ReferForm jobs={jobs} duplicate={duplicate} />
      </Drawer>
    </HireFrame>
  );
}

// HIR-12 (phone)
export function ReferralsPhone({ jobs, referrals, today, referOpen = false }: { jobs: Job[]; referrals: Referral[]; today: Date; referOpen?: boolean }) {
  const [open, setOpen] = useState(referOpen);
  return (
    <PhoneFrame tab="me" title="Referrals">
      <Button variant="primary" icon={UserPlus} fullWidth onClick={() => setOpen(true)}>
        Refer someone
      </Button>
      <ReferralRows rows={referrals} today={today} />
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Refer someone"
        footer={
          <Button variant="primary" fullWidth>
            Send referral
          </Button>
        }
      >
        <ReferForm jobs={jobs} />
      </BottomSheet>
    </PhoneFrame>
  );
}

/* ================================================================== HIR-11 · Recruiting costs */

export interface CostEntry {
  id: string;
  period: string;
  job: string | null;
  source: string;
  type: 'Job board' | 'Agency fee' | 'Referral bonus' | 'Assessment' | 'Event' | 'Other';
  amount: number;
  origin: 'Manual' | 'Payroll one-time pay' | 'Assessment cost';
  enteredBy: string;
  note?: string;
}

// HIR-11
export function RecruitingCostsScreen({ rows, hires, state = 'ready', addOpen = false }: { rows: CostEntry[]; hires: number; state?: ListState; addOpen?: boolean }) {
  const [open, setOpen] = useState(addOpen);
  const [type, setType] = useState<string | null>('Job board');
  const [amount, setAmount] = useState<number | null>(null);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const list = useListControls({
    rows,
    fields: [
      { key: 'type', label: 'Cost type', type: 'multi', options: ['Job board', 'Agency fee', 'Referral bonus', 'Assessment', 'Event', 'Other'].map((v) => ({ value: v, label: v })) },
      { key: 'origin', label: 'Origin', type: 'multi', options: ['Manual', 'Payroll one-time pay', 'Assessment cost'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.source} ${r.job ?? ''} ${r.note ?? ''}`,
    fieldValue: (r, k) => (k === 'type' ? r.type : r.origin),
    views: [{ id: 'q', name: 'This quarter' }],
  });
  const cols: TableColumn<CostEntry>[] = useMemo(
    () => [
      { key: 'period', header: 'Month', value: (r) => r.period, width: 100 },
      { key: 'type', header: 'Cost type', value: (r) => r.type, groupable: true },
      { key: 'source', header: 'Source', value: (r) => r.source },
      { key: 'job', header: 'Job', value: (r) => r.job ?? 'General spend' },
      { key: 'amount', header: 'Amount', type: 'money', value: (r) => r.amount, total: 'sum' },
      { key: 'origin', header: 'Origin', type: 'status', value: (r) => r.origin, statusTone: (v) => (v === 'Manual' ? 'neutral' : 'info') },
      { key: 'by', header: 'Entered by', value: (r) => r.enteredBy },
    ],
    [],
  );
  return (
    <HireFrame active="Recruiting costs">
      <PageHeader title="Recruiting costs" description="Costs behind cost per hire. Referral bonuses post from payroll and assessment costs from the test settings, so they're never entered twice." actions={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Add cost</Button>} />
      <SummaryTiles
        label="Cost summary, Jul–Sep 2026"
        tiles={[
          { label: 'Total spend', value: formatINR(total) },
          { label: 'Hires this quarter', value: hires },
          { label: 'Cost per hire', value: hires ? formatINR(Math.round(total / hires)) : '—', sub: 'metric recruitment.cost_per_hire' },
        ]}
      />
      <DataTable
        label="Recruiting costs"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={() => {}}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        defaultGroupBy="type"
        rowActions={(r) => (r.origin === 'Manual' ? <><MenuItem>Edit</MenuItem><MenuItem destructive>Delete</MenuItem></> : <MenuItem disabled>Posted automatically: edit at source</MenuItem>)}
        empty={<EmptyState title="No recruiting costs this quarter." description="Add job-board fees, agency fees and events here." action={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Add cost</Button>} />}
        onExport={() => {}}
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Add recruiting cost"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!amount}>
              Add cost
            </Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          <FormField label="Cost type" required helper="Referral bonuses and assessment costs are added automatically.">
            <Select value={type} onChange={setType} options={['Job board', 'Agency fee', 'Event', 'Other'].map((v) => ({ value: v, label: v }))} />
          </FormField>
          <FormField label="Source" required>
            <TextField placeholder="e.g. Naukri, campus fair at Hosur" />
          </FormField>
          <FormField label="Job" optional helper="Leave empty for general spend.">
            <Select value={null} onChange={() => {}} clearable options={[{ value: 'j1', label: 'Senior QA Engineer' }, { value: 'j3', label: 'Accountant' }]} />
          </FormField>
          <FieldRow>
            <FormField label="Amount" required>
              <CurrencyField value={amount} onChange={setAmount} />
            </FormField>
            <FormField label="Month" required>
              <RadioGroup aria-label="Month" orientation="horizontal" defaultValue="sep" options={[{ value: 'aug', label: 'Aug' }, { value: 'sep', label: 'Sep' }]} />
            </FormField>
          </FieldRow>
          <FormField label="Note" optional>
            <TextArea rows={2} />
          </FormField>
        </div>
      </Drawer>
    </HireFrame>
  );
}
