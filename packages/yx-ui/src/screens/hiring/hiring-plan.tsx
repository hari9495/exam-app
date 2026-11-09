// Hiring › Headcount plan, requisitions, rediscovery, jobs, pay range, internal jobs, referrals, recruiting costs.
// HIR-01, HIR-02, HIR-26, HIR-03, HIR-24, HIR-13, HIR-12, HIR-11 (M10 §3, Q1, YX-ATS-01 / 02 / 12 / 23 / 34 / 39 / 42, P09 Q3).
import { useMemo, useState } from 'react';
import { Briefcase, ExternalLink, Plus, Send, UserPlus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { FormField, FieldRow, useTooEarly } from '../../components/field';
import { Segment } from '../../components/segment';
import { useToastIfAny } from '../../components/notify';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
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

/** The live "Request a hire" (PPL-08, HIR-02 sheet): what the manager sends; the API names the route and decides. */
export interface LiveRequisitionSheet {
  /** "Hiring manager request · Quality". */
  subtitle: string;
  /** The people who may leave and be replaced (the manager's team). */
  team: { value: string; label: string }[];
  onSend: (input: { title: string; requisitionReason: 'new' | 'replacement'; headcountPlanLineId: string | null; outsidePlan: boolean; outsidePlanReason: string | null; replacementOfEmployeeId: string | null; headcount: number; budgetAmount: number | null; targetStart: Date | null }) => Promise<void>;
}

export function RequisitionSheet({ open, onOpenChange, planLines, defaultLine = 'pl3', defaultMax = 8_40_000, live }: { open: boolean; onOpenChange: (o: boolean) => void; planLines: PlanLine[]; defaultLine?: string | null; defaultMax?: number | null; live?: LiveRequisitionSheet }) {
  const [lineId, setLineId] = useState<string | null>(defaultLine);
  const [outside, setOutside] = useState(!live && defaultLine == null);
  const [max, setMax] = useState<number | null>(defaultMax);
  const [positions, setPositions] = useState<number | null>(1);
  const [reason, setReason] = useState('');
  const [replacement, setReplacement] = useState(false);
  const [leaver, setLeaver] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<Date | null>(live ? null : new Date(2026, 11, 1));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const line = outside || (live && replacement) ? null : planLines.find((l) => l.id === lineId) ?? null;
  const leaverName = live ? live.team.find((t) => t.value === leaver)?.label ?? 'a leaver' : 'Rohit Bhat';
  const route = requisitionRoute({ planLine: line, proposedMax: max ?? 0, replacementFor: replacement ? leaverName : null });
  const needReason = outside && !(live && replacement) && !reason.trim();
  // Live: a position without a plan line (outside the plan, or a replacement) needs its name.
  const needTitle = Boolean(live) && !line && !title.trim();
  const liveIncomplete = Boolean(live) && (!positions || needTitle || (replacement ? !leaver : !outside && !line));
  const send = async () => {
    if (!live || needReason || !max || liveIncomplete) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onSend({ title: line ? line.designation : title.trim(), requisitionReason: replacement ? 'replacement' : 'new', headcountPlanLineId: line?.id ?? null, outsidePlan: !replacement && outside, outsidePlanReason: !replacement && outside ? reason.trim() : null, replacementOfEmployeeId: replacement ? leaver : null, headcount: positions!, budgetAmount: max, targetStart: start });
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New requisition"
      subtitle={live ? live.subtitle : 'Hiring manager request · Engineering'}
      dirty={reason.length > 0 || title.length > 0}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {/* Live: a manager's request is not kept as a draft yet (left out). */}
          {!live && <Button>Save draft</Button>}
          <Button variant="primary" icon={Send} disabled={needReason || !max || liveIncomplete} loading={busy} onClick={live ? () => void send() : undefined}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="yx-hire-sheet">
        <div className="yx-hire-sheet__form">
          {failed && <InlineAlert tone="danger" title={failed} />}
          <Switch className="yx-hire-switch" label="Replacement for a leaver" description="Linked to the exit; doesn't use a new plan line." checked={replacement} onChange={setReplacement} />
          {live && replacement ? (
            <FormField label="Who is leaving" required>
              <Select value={leaver} onChange={setLeaver} options={live.team} />
            </FormField>
          ) : (
            <>
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
                <FormField label="Why is this needed outside the plan?" required error={needReason && (!live || reason.length > 0) ? 'Enter a reason so the CFO can decide.' : null}>
                  <TextArea value={reason} onChange={setReason} rows={3} />
                </FormField>
              )}
            </>
          )}
          {live && !line && (
            <FormField label="Position" required helper="The job title, for example Quality Analyst.">
              <TextField value={title} onChange={setTitle} maxLength={200} />
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
            <DatePicker value={start} onChange={setStart} />
          </FormField>
        </div>
        <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="What happens">
          <Text weight="semibold">What happens</Text>
          {live && !line && !outside && !replacement ? null : route.extra ? <Badge tone="warning">{live ? 'Extra approval' : 'Extra approval: CFO'}</Badge> : <Badge tone="success">Short chain</Badge>}
          {live ? (
            <Text as="p" size="sm" tone="secondary">
              It goes to your company&apos;s requisition approvers. You follow it in Approvals.
            </Text>
          ) : (
            <ol className="yx-hire-steps">
              {route.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {(live && !line && !outside && !replacement ? [] : route.reasons).map((r) => (
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

/** A job one can refer to (the design's Job, only what the form shows). */
export type ReferJob = Pick<Job, 'id' | 'title' | 'location'>;

/** What the live page sends when someone refers a friend (the résumé as base64 PDF). */
export interface ReferInput {
  jobId: string;
  name: string;
  email: string;
  phone: string;
  resumeBase64: string | null;
  consentGiven: true;
}

/** HIR-12 live: the company's bonus policy (settings) and the refer action; rows and jobs come in as props. */
export interface LiveReferrals {
  /** Bonus (₹) for a referred hire, from the company setting. */
  bonus: number;
  /** Days the hire completes before the bonus is due, from the company setting. */
  qualifyDays: number;
  state: ListState;
  onRetry: () => void;
  /** Rejects with an Error; `status: 409` means this person was already referred for this job. */
  onRefer: (input: ReferInput) => Promise<void>;
}

function ReferralRows({ rows, today, days = 90 }: { rows: Referral[]; today: Date; days?: number }) {
  if (rows.length === 0) return <EmptyState compact title="You haven't referred anyone yet." description={`Refer a friend to an open job. You get a bonus when they complete ${days} days.`} />;
  return (
    <ul className="yx-hire-list">
      {rows.map((r) => {
        const b = referralBonusStatus(r.stage === 'Hired' ? r.joined : null, today, days);
        const bonusText =
          r.stage === 'Not selected' || (r.bonus === 0 && !r.paid)
            ? 'No bonus'
            : r.stage !== 'Hired'
              ? `Bonus after they join and complete ${days} days`
              : r.paid
                ? `${formatINR(r.bonus)} paid in payroll`
                : b.state === 'eligible'
                  ? `${formatINR(r.bonus)} eligible · paid in the next payroll`
                  : b.state === 'waiting'
                    ? `${formatINR(r.bonus)} on ${formatDate(b.eligibleOn!)} (${b.daysLeft} days to go)`
                    : `${formatINR(r.bonus)} after they join and complete ${days} days`;
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('That file could not be read. Try another.'));
    r.readAsDataURL(file);
  });

/** The live refer form: controlled, checked when Send is pressed, then sent. */
function useReferForm(jobs: ReferJob[], live: LiveReferrals | undefined, close: () => void) {
  const [job, setJob] = useState<string | null>(jobs[0]?.id ?? null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [resume, setResume] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ duplicate: boolean; text: string } | null>(null);
  const toaster = useToastIfAny();
  const chosenJob = job && jobs.some((j) => j.id === job) ? job : jobs[0]?.id ?? null;
  const early = useTooEarly([
    ...(!chosenJob ? [{ fieldId: 'rf-job', message: 'Choose the job.' }] : []),
    ...(!name.trim() ? [{ fieldId: 'rf-name', message: "Enter your friend's full name." }] : []),
    ...(!EMAIL.test(email.trim()) ? [{ fieldId: 'rf-email', message: 'Enter an email address like name@example.com.' }] : []),
    ...(!/^[6-9]\d{9}$/.test(phone.replace(/\s/g, '')) ? [{ fieldId: 'rf-phone', message: 'Enter a 10-digit mobile number.' }] : []),
    ...(!consent ? [{ fieldId: 'rf-consent', message: 'Tick this once your friend has agreed.' }] : []),
  ]);
  const send = async () => {
    if (!live || early.stop()) return;
    setBusy(true);
    setProblem(null);
    try {
      await live.onRefer({ jobId: chosenJob!, name: name.trim(), email: email.trim(), phone: `+91${phone.replace(/\s/g, '')}`, resumeBase64: resume, consentGiven: true });
      toaster?.toast({ tone: 'success', title: `${name.trim()} referred`, description: 'You can follow them here as they move through hiring.' });
      early.reset();
      setName('');
      setEmail('');
      setPhone('');
      setResume(null);
      setConsent(false);
      close();
    } catch (e) {
      setProblem({ duplicate: (e as { status?: number }).status === 409, text: e instanceof Error && e.message ? e.message : 'That did not work. Try again.' });
    } finally {
      setBusy(false);
    }
  };
  return { job: chosenJob, setJob, name, setName, email, setEmail, phone, setPhone, setResume, consent, setConsent, busy, problem, early, send };
}

function ReferForm({ jobs, duplicate, form }: { jobs: ReferJob[]; duplicate?: boolean; form?: ReturnType<typeof useReferForm> }) {
  const [sampleJob, setSampleJob] = useState<string | null>(jobs[0]?.id ?? null);
  const f = form;
  return (
    <div className="yx-hire-stack">
      <FormField id="rf-job" label="Job" required error={f?.early.errorOf('rf-job')}>
        <Select value={f ? f.job : sampleJob} onChange={f ? f.setJob : setSampleJob} options={jobs.map((j) => ({ value: j.id, label: j.title, description: j.location }))} />
      </FormField>
      <FormField id="rf-name" label="Friend's full name" required error={f?.early.errorOf('rf-name')}>
        {f ? <TextField value={f.name} onChange={f.setName} maxLength={200} autoComplete="off" /> : <TextField defaultValue={duplicate ? 'Ananya Iyer' : ''} />}
      </FormField>
      <FieldRow>
        <FormField id="rf-email" label="Email" required error={f?.early.errorOf('rf-email')}>
          {f ? <TextField type="email" value={f.email} onChange={f.setEmail} maxLength={320} autoComplete="off" /> : <TextField type="email" defaultValue={duplicate ? 'ananya.iyer@mailbox.in' : ''} />}
        </FormField>
        <FormField id="rf-phone" label="Mobile" required error={f?.early.errorOf('rf-phone')}>
          {f ? <TextField type="tel" prefix="+91" value={f.phone} onChange={f.setPhone} maxLength={11} autoComplete="off" /> : <TextField type="tel" prefix="+91" />}
        </FormField>
      </FieldRow>
      <FormField label="Résumé" optional helper={f ? 'A PDF, up to 5 MB.' : undefined}>
        <FileUpload
          upload={f ? async (file) => f.setResume(await asBase64(file)) : async () => {}}
          onItemsChange={f ? (items) => void (items.length === 0 && f.setResume(null)) : undefined}
          accept={f ? ['.pdf'] : ['.pdf', '.docx']}
          maxSize={f ? 5 * 1024 * 1024 : undefined}
          multiple={false}
        />
      </FormField>
      {(duplicate || f?.problem?.duplicate) && (
        <InlineAlert tone="warning" title="Already in our system">
          {f?.problem ? `${f.problem.text}. You can still refer them to another job.` : <>This person applied for this job in the last 90 days, so the referral can&rsquo;t be credited. You can still refer them to another job.</>}
        </InlineAlert>
      )}
      {f?.problem && !f.problem.duplicate && <InlineAlert tone="danger" title={f.problem.text} />}
      <FormField id="rf-consent-field" label="Consent" hideLabel error={f?.early.errorOf('rf-consent')}>
        {f ? <Checkbox id="rf-consent" label="My friend agreed that I can share their details" required checked={f.consent} onChange={f.setConsent} /> : <Checkbox label="My friend agreed that I can share their details" required />}
      </FormField>
    </div>
  );
}

// HIR-12
export function ReferralsScreen({ jobs, referrals, today, referOpen = false, duplicate = false, live }: { jobs: ReferJob[]; referrals: Referral[]; today: Date; referOpen?: boolean; duplicate?: boolean; live?: LiveReferrals }) {
  const [open, setOpen] = useState(referOpen);
  const form = useReferForm(jobs, live, () => setOpen(false));
  const days = live?.qualifyDays ?? 90;
  const bonus = live?.bonus ?? 25_000;
  const pending = referrals.filter((r) => r.stage === 'Hired' && !r.paid).reduce((s, r) => s + r.bonus, 0);
  const state = live?.state ?? 'ready';
  return (
    <HireFrame active="Candidates & talent CRM">
      <PageHeader
        title="Referrals"
        description={bonus > 0 ? `Refer people you know. The bonus is paid through payroll once they complete ${days} days.` : 'Refer people you know for our open jobs.'}
        actions={<Button variant="primary" icon={UserPlus} onClick={() => setOpen(true)}>Refer someone</Button>}
      />
      {state === 'loading' ? (
        <Skeleton height={240} />
      ) : state === 'error' ? (
        <ErrorState title="Couldn't load your referrals" description="Check your connection and try again." onRetry={live?.onRetry} />
      ) : (
        <>
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
            <ReferralRows rows={referrals} today={today} days={days} />
          </Card>
        </>
      )}
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Refer someone"
        subtitle={bonus > 0 ? `Referral bonus up to ${formatINR(bonus)}` : undefined}
        dirty={live ? Boolean(form.name || form.email || form.phone) : undefined}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            {/* Live: never disabled; pressed too early, it shows what is missing (founder rule). */}
            <Button variant="primary" disabled={!live && duplicate} loading={form.busy} onClick={live ? () => void form.send() : undefined}>
              Send referral
            </Button>
          </>
        }
      >
        {live && jobs.length === 0 ? <EmptyState compact title="No open jobs right now." description="Come back when a job opens. You can refer people to any open job." /> : <ReferForm jobs={jobs} duplicate={duplicate} form={live ? form : undefined} />}
      </Drawer>
    </HireFrame>
  );
}

// HIR-12 (phone)
export function ReferralsPhone({ jobs, referrals, today, referOpen = false }: { jobs: ReferJob[]; referrals: Referral[]; today: Date; referOpen?: boolean }) {
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
  /** Live: the job's id and the month (YYYY-MM), so Edit opens with them. */
  jobId?: string | null;
  month?: string;
}

/** What Add cost / Edit sends: rupees (two decimals at most) and the first day of the month. */
export interface CostInput {
  costType: 'job_board' | 'agency_fee' | 'event' | 'other';
  source: string;
  jobId: string | null;
  amount: number;
  currency: 'INR';
  period: string;
  note: string | null;
}

/** HIR-11 live: the quarter (India time) the tiles add up, the months to enter, the jobs to pick, and the actions. */
export interface LiveRecruitingCosts {
  /** e.g. "Oct–Dec 2026" and its months as YYYY-MM. */
  quarter: { label: string; months: string[] };
  /** Months a cost can be entered for, oldest first (value YYYY-MM, label e.g. "Oct"). */
  months: { value: string; label: string }[];
  jobs: { value: string; label: string }[];
  onRetry: () => void;
  /** `id` null = a new cost. */
  onSave: (input: CostInput, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onExport: (rows: CostEntry[]) => void;
}

const ENTERED_TYPES = [
  { value: 'job_board', label: 'Job board' },
  { value: 'agency_fee', label: 'Agency fee' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
] as const;
const typeValue = (label: string) => ENTERED_TYPES.find((t) => t.label === label)?.value ?? 'other';
const SAMPLE_MONTHS = [
  { value: 'aug', label: 'Aug' },
  { value: 'sep', label: 'Sep' },
];

// HIR-11
export function RecruitingCostsScreen({ rows, hires, state = 'ready', addOpen = false, live }: { rows: CostEntry[]; hires: number; state?: ListState; addOpen?: boolean; live?: LiveRecruitingCosts }) {
  const months = live?.months ?? SAMPLE_MONTHS;
  const lastMonth = months[months.length - 1]?.value ?? '';
  const [open, setOpen] = useState(addOpen);
  const [editing, setEditing] = useState<CostEntry | null>(null);
  const [deleting, setDeleting] = useState<CostEntry | null>(null);
  const [type, setType] = useState<string | null>('job_board');
  const [source, setSource] = useState('');
  const [job, setJob] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [month, setMonth] = useState<string>(lastMonth);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const toaster = useToastIfAny();
  const early = useTooEarly([
    ...(!source.trim() ? [{ fieldId: 'rc-source', message: 'Say where the money went, for example Naukri.' }] : []),
    ...(!amount || amount <= 0 ? [{ fieldId: 'rc-amount', message: 'Enter the amount in rupees.' }] : []),
  ]);
  const inQuarter = live ? rows.filter((r) => r.month && live.quarter.months.includes(r.month)) : rows;
  const total = inQuarter.reduce((s, r) => s + r.amount, 0);
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
  const openSheet = (r: CostEntry | null) => {
    setEditing(r);
    setType(r ? typeValue(r.type) : 'job_board');
    setSource(r?.source ?? '');
    setJob(r?.jobId ?? null);
    setAmount(r?.amount ?? null);
    setMonth(r?.month ?? lastMonth);
    setNote(r?.note ?? '');
    setFailed(null);
    early.reset();
    setOpen(true);
  };
  const save = async () => {
    if (!live || early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onSave({ costType: (type ?? 'other') as CostInput['costType'], source: source.trim(), jobId: job, amount: amount!, currency: 'INR', period: `${month}-01`, note: note.trim() || null }, editing?.id ?? null);
      toaster?.toast({ tone: 'success', title: editing ? 'Cost saved' : 'Cost added', description: `${formatINR(amount!)} · ${source.trim()}` });
      setOpen(false);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  // Live: an older cost keeps its own month (it is not one of the months offered for new costs).
  const monthOptions = editing?.month && !months.some((m) => m.value === editing.month) ? [{ value: editing.month, label: editing.period }, ...months] : months;
  const add = () => (live ? openSheet(null) : setOpen(true));
  return (
    <HireFrame active="Recruiting costs">
      <PageHeader title="Recruiting costs" description="Costs behind cost per hire. Referral bonuses post from payroll and assessment costs from the test settings, so they're never entered twice." actions={<Button variant="primary" icon={Plus} onClick={add}>Add cost</Button>} />
      <SummaryTiles
        label={`Cost summary, ${live?.quarter.label ?? 'Jul–Sep 2026'}`}
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
        onRetry={live?.onRetry ?? (() => {})}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        defaultGroupBy="type"
        rowActions={(r) =>
          r.origin === 'Manual' ? (
            <>
              <MenuItem onSelect={live ? () => openSheet(r) : undefined}>Edit</MenuItem>
              <MenuItem destructive onSelect={live ? () => setDeleting(r) : undefined}>
                Delete
              </MenuItem>
            </>
          ) : (
            <MenuItem disabled>Posted automatically: edit at source</MenuItem>
          )
        }
        empty={<EmptyState title="No recruiting costs this quarter." description="Add job-board fees, agency fees and events here." action={<Button variant="primary" icon={Plus} onClick={add}>Add cost</Button>} />}
        onExport={() => live?.onExport(list.rows)}
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Edit recruiting cost' : 'Add recruiting cost'}
        dirty={live ? Boolean(source || amount || note) : undefined}
        notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            {/* Never disabled (founder rule): pressed too early, it shows what is missing. */}
            <Button variant="primary" loading={busy} onClick={live ? () => void save() : undefined}>
              {editing ? 'Save cost' : 'Add cost'}
            </Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          <FormField label="Cost type" required helper="Referral bonuses and assessment costs are added automatically.">
            <Select value={type} onChange={setType} options={ENTERED_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </FormField>
          <FormField id="rc-source" label="Source" required error={early.errorOf('rc-source')}>
            <TextField value={source} onChange={setSource} maxLength={120} placeholder="e.g. Naukri, campus fair at Hosur" />
          </FormField>
          <FormField label="Job" optional helper="Leave empty for general spend.">
            <Select value={job} onChange={setJob} clearable options={live?.jobs ?? [{ value: 'j1', label: 'Senior QA Engineer' }, { value: 'j3', label: 'Accountant' }]} />
          </FormField>
          <FieldRow>
            <FormField id="rc-amount" label="Amount" required error={early.errorOf('rc-amount')}>
              <CurrencyField value={amount} onChange={setAmount} allowPaise max={1_000_000_000} />
            </FormField>
            <FormField label="Month" required>
              <Segment label="Month" value={month} onChange={setMonth} options={monthOptions} />
            </FormField>
          </FieldRow>
          <FormField label="Note" optional>
            <TextArea rows={2} value={note} onChange={setNote} maxLength={500} />
          </FormField>
        </div>
      </Drawer>
      {deleting && live && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete the ${formatINR(deleting.amount)} cost for ${deleting.source}?`}
          consequence="It comes off the totals and the cost per hire. This can't be undone."
          confirmLabel="Delete cost"
          onConfirm={async () => {
            await live.onDelete(deleting.id);
            toaster?.toast({ tone: 'success', title: 'Cost deleted', description: `${formatINR(deleting.amount)} · ${deleting.source}` });
            setDeleting(null);
          }}
        />
      )}
    </HireFrame>
  );
}
