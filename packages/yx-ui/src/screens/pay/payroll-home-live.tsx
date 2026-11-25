// PAY-01 · Payroll home, PAY-29 · run list and PAY-30 · coverage, live: the designed screens (payroll-run.tsx) with the
// API's runs, the month's run checks, the pay group's calendar and the daily coverage check. Same header, stage track,
// "What needs attention" list, totals, chart, frequency tabs and coverage table as the stories; the New run drawer
// (monthly or off-cycle, pay group, month, pay period for weekly groups) is kept from the old live page. The API checks
// every call again (keys, entity scope).
import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Plus } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { Icon } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { useToast, ToastProvider } from '../../components/notify';
import { Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { LineChart, StatCard } from '../../components/charts';
import { formatDate, groupIndian } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { DueBadge } from '../time/time-kit';
import { dateText } from '../time/live/kit';
import { DueDateStrip, RunStageTrack, SectionTitle, StateBlock, type DueItem, type RunStage } from './pay-kit';
import { CoveragePanel, FrequencyRunsScreen, GroupRunRows, type CoverageRow as DesignCoverageRow } from './payroll-run';
import { RunStatusBadge, runName } from './live/runs';
import { statuteText } from './live/setup';
import type { LoadState } from './live/types';
import type { CoverageRow, SetupEntity } from './live/types-5b';
import { periodsOf, type HubCard, type OffcycleKind, type PayGroupRef, type PayRun, type RunReadiness, type RunStatus, type StatutoryHub } from './live/types-5j';

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const num = (v: string | null | undefined) => Number(v ?? 0);
const plural = (n: number, one: string, many = `${one}s`) => `${groupIndian(n)} ${n === 1 ? one : many}`;

/** The design's six stages from the API's nine statuses (Void and Reopened show as their badge). */
export const stageOf = (s: RunStatus, published: boolean): RunStage =>
  published ? 'Published' : s === 'paid' ? 'Paid' : s === 'approved' ? 'Approved and locked' : s === 'submitted' || s === 'in_review' || s === 'reopened' ? 'In review' : s === 'calculated' ? 'Calculated' : 'Draft';

/** Loading, error and no-access for a live pay page; the design's StateBlock draws the skeleton. */
function LiveStates({ state, onRetry, what, children }: { state: LoadState; onRetry?: () => void; what: string; children: React.ReactNode }) {
  if (state === 'loading') return <StateBlock state="loading" rows={6}>{null}</StateBlock>;
  if (state === 'error') return <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />;
  if (state === 'no-access') return <NoAccessState grantedBy="your payroll admin" what={what} />;
  return <>{children}</>;
}

/* ================================================================== PAY-01 Payroll home */

/** GET /statutory/home-dues: each legal entity's hub for this month and the three before it, the two oldest only while unfiled (statutory.filing.view). */
export type HomeDues = Omit<StatutoryHub, 'cards'> & { entity: string; cards: Omit<HubCard, 'filingId' | 'verifyDueDate'>[] };
const STATUTE: Record<string, string> = { 'IN.PF': 'PF', 'IN.ESI': 'ESI', 'IN.PT': 'Professional tax', 'IN.LWF': 'Labour welfare fund' };
const WHAT: Record<string, string> = { 'IN.PF': 'PF return and payment', 'IN.ESI': 'ESI contribution', 'IN.PT': 'Professional tax return', 'IN.LWF': 'Labour welfare fund' };

/**
 * PAY-01 "Due this month" from the statutory hubs: what falls due in `month`, and anything still late (read back three
 * months). Nothing owed (zero, not filed) is left out; filed items show as Filed. PT and LWF fall due by the state's
 * calendar; a state without one has no date and is counted apart.
 */
export function homeDueItems(dues: HomeDues[], month: string, href: string): { items: DueItem[]; undated: number } {
  const several = new Set(dues.map((d) => d.entityId)).size > 1;
  const items: DueItem[] = [];
  let undated = 0;
  for (const d of dues) {
    const of = `for ${monthLabel(d.month).split(' ')[0]}${several ? ` · ${d.entity}` : ''}`;
    const add = (id: string, statute: string, what: string, amount: string, dueOn: string | null, done: boolean, late: boolean, penalty?: string | null) => {
      if (!done && num(amount) <= 0) return;
      if (!dueOn) {
        if (!done) undated++;
        return;
      }
      if (dueOn.slice(0, 7) !== month && !(late && !done)) return;
      items.push({ id, statute, what: `${what} ${of}`, due: day(dueOn), status: done ? 'done' : late ? 'overdue' : 'due', ...(late && penalty ? { penalty: num(penalty) } : {}), ...(done ? {} : { action: { label: 'Open statutory hub', href } }) });
    };
    for (const c of d.cards) add(`${d.entityId}-${d.month}-${c.statute}-${c.state ?? ''}`, `${STATUTE[c.statute] ?? c.label}${c.state ? ` (${c.state})` : ''}`, WHAT[c.statute] ?? c.label, c.amount, c.dueOn, c.status === 'filed', c.late, c.penaltyEstimate);
    add(`${d.entityId}-${d.month}-tds`, 'TDS', 'TDS challan', d.tds.amount, d.tds.dueOn, d.tds.challanStatus === 'deposited', d.tds.late);
  }
  return { items: items.sort((a, b) => a.due.getTime() - b.due.getTime()), undated };
}

export interface LivePayrollHome {
  state: LoadState;
  onRetry?: () => void;
  /** The latest runs, every month (newest first). */
  runs: PayRun[] | null;
  /** Null when the person may not read pay groups (then "set up" cannot be told). */
  groups: PayGroupRef[] | null;
  /** The month chosen in the top bar, "2026-10". */
  month: string;
  /** Today in India, "2026-10-29". */
  today: string;
  /** Checks of this month's run (null when there is none or they did not load). */
  readiness: RunReadiness | null;
  /** Checks of every pay group's run this month, by run id (several pay groups). */
  readinessByRun?: Record<string, RunReadiness>;
  /** Statutory dues (GET /statutory/home-dues); undefined without statutory.filing.view, null while loading. */
  dues?: HomeDues[] | null;
  /** Cut-off and pay date of this month's run, from its pay group's calendar. */
  calendar: { cutOff: string; payDate: string } | null;
  canPrepare: boolean;
  canOffcycle: boolean;
  canApprove: boolean;
  setupHref: string;
  statutoryHref: string;
  /** Link to one run's page (the stat cards' drill links). */
  runHref: (id: string) => string;
  onCreate: (payGroupId: string, month: string, offcycleKind: Exclude<OffcycleKind, 'fnf'> | null, subPeriod?: number | null) => Promise<{ id: string }>;
  onOpen: (id: string) => void;
  /** PAY-11: "Start off-cycle run" opens the designed off-cycle run page (else the drawer's off-cycle choice). */
  onNewOffcycle?: () => void;
  /** Answer 2283: late corrections of people who have left, paid by their full and final settlement (until settled). */
  waitingForFnf?: { id: string; name: string; on: string; month: string; fnfId: string | null; state?: 'waiting' | 'settled' }[] | null;
  /** Answer 2300: the F&F was settled first: one click adds the correction to an off-cycle correction run (its id). */
  onAddToOffcycle?: (correctionId: string) => Promise<{ runId: string }>;
  /** Opens the leaver's full and final settlement. */
  fnfHref?: (fnfId: string) => string;
}

/** This month's run: the first regular run of the month that is not void (the top bar narrows it to one company). */
export const currentRun = (runs: PayRun[], month: string) => runs.find((r) => r.month === month && r.runType === 'regular' && r.status !== 'void') ?? null;

/** Each pay group's run this month (the latest period of a weekly group); groups with no run yet come last. */
export function groupRuns(runs: PayRun[], groups: PayGroupRef[] | null, month: string): { groupId: string; run: PayRun | null }[] {
  const out = new Map<string, PayRun | null>();
  for (const r of runs) if (r.month === month && r.runType === 'regular' && r.status !== 'void' && !out.has(r.payGroupId)) out.set(r.payGroupId, r);
  for (const g of groups ?? []) if (!out.has(g.id)) out.set(g.id, null);
  return [...out].map(([groupId, run]) => ({ groupId, run }));
}

export function LivePayrollHomeScreen({ live }: { live: LivePayrollHome }) {
  return (
    <ToastProvider>
      <LiveHome live={live} />
    </ToastProvider>
  );
}

function LiveHome({ live }: { live: LivePayrollHome }) {
  // A row's Start run opens on that row's pay group; the page buttons on the first group.
  const [creating, setCreating] = useState<{ kind: 'regular' | 'offcycle'; groupId?: string } | null>(null);
  const [help, setHelp] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const { toast } = useToast();
  const addToOffcycle = async (id: string, name: string) => {
    setAdding(id);
    try {
      const r = await live.onAddToOffcycle!(id);
      toast({ tone: 'success', title: `${name}: added to an off-cycle correction run`, description: 'Calculate and approve that run to pay it.' });
      live.onOpen(r.runId);
    } catch (e) {
      toast({ tone: 'error', title: 'Not added', description: e instanceof Error ? e.message : 'Try again.' });
    } finally {
      setAdding(null);
    }
  };
  const runs = live.runs ?? [];
  const cur = currentRun(runs, live.month);
  const groupOf = (r: PayRun) => live.groups?.find((g) => g.id === r.payGroupId)?.name;
  const isFin = !live.canPrepare && live.canApprove;
  const notSetUp = live.groups !== null && live.groups.length === 0;
  const perGroup = groupRuns(runs, live.groups, live.month);
  const several = perGroup.length > 1;
  const readinessOf = (id: string) => live.readinessByRun?.[id] ?? (live.readiness?.run.id === id ? live.readiness : undefined);
  // Several pay groups: what needs attention covers every group's run; each check opens its own run.
  const sources = several ? perGroup.flatMap((g) => (g.run && readinessOf(g.run.id) ? [readinessOf(g.run.id)!] : [])) : live.readiness ? [live.readiness] : [];
  const checks = sources.flatMap((x) => x.checks.map((c) => ({ ...c, runId: x.run.id }))).filter((c) => !c.waived && c.severity !== 'info');
  const blockingOf = (id: string) => (readinessOf(id)?.checks ?? []).filter((c) => !c.waived && c.severity === 'block').length;
  const due = live.dues ? homeDueItems(live.dues, live.month, live.statutoryHref) : null;
  // One line per kind of check; a check about many people names the first and counts the rest.
  const findings = Object.values(
    checks.reduce<Record<string, typeof checks>>((a, c) => ({ ...a, [c.checkKey]: [...(a[c.checkKey] ?? []), c] }), {}),
  ).sort((a, b) => (a[0].severity === b[0].severity ? 0 : a[0].severity === 'block' ? -1 : 1));
  const blocking = checks.filter((c) => c.severity === 'block').length;
  const stage = cur ? stageOf(cur.status, Boolean(cur.publishedAt)) : null;
  const waiting = runs.filter((r) => r.status === 'submitted');
  // Totals: the last regular run with totals that is approved or later, against the one before it in the same pay group.
  const done = runs.filter((r) => r.runType === 'regular' && r.totals && ['approved', 'paid'].includes(r.status));
  const last = done[0];
  const history = last ? done.filter((r) => r.payGroupId === last.payGroupId).slice(0, 12).reverse() : [];
  const prev = history.length > 1 ? history[history.length - 2] : undefined;
  const open = (r: PayRun, label: string) => ({ label, href: live.runHref(r.id), onClick: (e: { preventDefault: () => void }) => (e.preventDefault(), live.onOpen(r.id)) });
  const primary = !cur ? (
    live.canPrepare && !notSetUp ? (
      <Button variant="primary" icon={Plus} onClick={() => setCreating({ kind: 'regular' })}>
        Start {monthLabel(live.month).split(' ')[0]} payroll
      </Button>
    ) : null
  ) : (
    <Button variant="primary" onClick={() => live.onOpen(cur.id)}>
      {cur.status === 'submitted' && live.canApprove && !cur.preparedByMe
        ? 'Review and approve'
        : cur.status === 'approved'
          ? 'Release bank file'
          : cur.status === 'paid' && !cur.publishedAt
            ? 'Publish payslips'
            : 'Open run workspace'}
    </Button>
  );
  return (
    <div className="yx-auth__page yx-pay-stack">
      <PageHeader
        title="Payroll"
        description={isFin ? 'Runs waiting for your approval, payments and statutory dues.' : 'Current run, what blocks it, and what is due this month.'}
        facts={
          live.state === 'ready' && cur
            ? [groupOf(cur) ?? cur.entityName, cur.totals ? plural(cur.totals.people, 'employee') : null, live.calendar ? `Cut-off ${formatDate(day(live.calendar.cutOff))}` : null, live.calendar ? `Pay date ${formatDate(day(live.calendar.payDate))}` : null]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        actions={
          live.state === 'ready' ? (
            <>
              {live.canOffcycle && !notSetUp && <Button onClick={() => (live.onNewOffcycle ? live.onNewOffcycle() : setCreating({ kind: 'offcycle' }))}>Start off-cycle run</Button>}
              {primary}
            </>
          ) : undefined
        }
      />
      <Dialog
        open={help}
        onOpenChange={setHelp}
        title="What you need before you start"
        description="Keep these at hand. You can save the set-up and come back to it."
        footer={
          <>
            <Button onClick={() => setHelp(false)}>Close</Button>
            <Button variant="primary" asChild>
              <a href={live.setupHref}>Set up payroll</a>
            </Button>
          </>
        }
      >
        <ul className="yx-pay-stack">
          <li>PF, ESI and professional tax registration numbers for the entity</li>
          <li>Pay group, pay day and the monthly attendance cut-off</li>
          <li>Salary structure: the components and how each is worked out</li>
          <li>The salary account and the bank's bulk upload format</li>
          <li>Pay already given this tax year, if you are moving from another system mid-year</li>
        </ul>
      </Dialog>
      <LiveStates state={live.state} onRetry={live.onRetry} what="payroll">
        {notSetUp ? (
          <EmptyState
            title="Payroll isn't set up for this entity yet."
            description="Set up registrations, pay group, salary template and bank format. It takes about 30 minutes; you can save and come back."
            action={
              <Button variant="primary" asChild>
                <a href={live.setupHref}>Set up payroll</a>
              </Button>
            }
            help={<Button size="sm" onClick={() => setHelp(true)}>What you need before you start</Button>}
          />
        ) : (
          <>
            {waiting.length > 0 && (
              <InlineAlert tone="info" title={`${plural(waiting.length, 'run is', 'runs are')} waiting for approval`}>
                Open a run to see who approves it next. Approvers decide on the run's own page.
              </InlineAlert>
            )}
            {several ? (
              <section className="yx-pay-stack" aria-label="Runs this month">
                <SectionTitle>{`${monthLabel(live.month).split(' ')[0]} runs · ${plural(perGroup.length, 'pay group')}`}</SectionTitle>
                <GroupRunRows
                  rows={perGroup.map(({ groupId, run: r }) => ({
                    id: groupId,
                    group: live.groups?.find((g) => g.id === groupId)?.name ?? (r ? runName(r) : 'Pay group'),
                    run: r ? runName(r) : null,
                    stage: r ? stageOf(r.status, Boolean(r.publishedAt)) : null,
                    blocking: r ? blockingOf(r.id) : 0,
                    status: r && ['void', 'reopened', 'calculating', 'submitted'].includes(r.status) ? <RunStatusBadge status={r.status} /> : undefined,
                    action: r ? (
                      <Button size="sm" onClick={() => live.onOpen(r.id)}>
                        Open run
                      </Button>
                    ) : live.canPrepare ? (
                      <Button size="sm" onClick={() => setCreating({ kind: 'regular', groupId })}>
                        Start run
                      </Button>
                    ) : null,
                  }))}
                />
              </section>
            ) : (
            <section className="yx-pay-stack" aria-label="Current run">
              <SectionTitle actions={cur ? <RunStatusBadge status={cur.status} /> : undefined}>{cur ? runName(cur) : `Payroll · ${monthLabel(live.month)}`}</SectionTitle>
              {cur && stage ? (
                <>
                  <RunStageTrack current={stage} complete={stage === 'Published'} blocked={blocking && (stage === 'Draft' || stage === 'In review') ? `${plural(blocking, 'check')} ${blocking === 1 ? 'blocks' : 'block'} the run` : undefined} />
                  {cur.status === 'reopened' && <p className="yx-pay-muted">This run was reopened after approval. It is checked and approved again.</p>}
                </>
              ) : (
                <p className="yx-pay-muted">
                  No payroll run for {monthLabel(live.month)} yet.{live.canPrepare ? ' Start it when the month\'s inputs are in.' : ''}
                </p>
              )}
            </section>
            )}
            <div className="yx-pay-grid">
              <div data-span="7" className="yx-pay-panel">
                <SectionTitle>What needs attention</SectionTitle>
                {!cur || findings.length === 0 ? (
                  <p className="yx-pay-muted">{cur ? `Nothing is blocking ${several ? 'these runs' : 'this run'}.` : 'Nothing to check until the run is started.'}</p>
                ) : (
                  <ul className="yx-pay-findings">
                    {findings.slice(0, 4).map((g) => {
                      const block = g[0].severity === 'block';
                      return (
                        <li key={g[0].checkKey} data-sev={block ? 'block' : 'warn'}>
                          <Icon icon={block ? AlertCircle : AlertTriangle} label={block ? 'Blocks' : 'Warning'} />
                          <div>
                            <p className="yx-pay-findings__title">{g.length > 1 ? `${g[0].message} And ${plural(g.length - 1, 'more')}.` : g[0].message}</p>
                            <p className="yx-pay-findings__desc">
                              <Badge tone={block ? 'danger' : 'warning'}>{block ? (g[0].blocks === 'approval' ? 'Blocks approval' : 'Blocks calculation') : 'Warning'}</Badge> {g[0].waivable ? 'Fix it, or waive it with a reason in the run checks.' : 'Fix it before the run goes on.'}
                            </p>
                          </div>
                          <div className="yx-pay-findings__acts">
                            <Button size="sm" onClick={() => live.onOpen(g[0].runId)}>
                              Open run checks
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                    {findings.length > 4 && <li className="yx-pay-muted">{plural(findings.length - 4, 'more kind of check', 'more kinds of check')} in the run.</li>}
                  </ul>
                )}
                {(live.waitingForFnf ?? []).length > 0 && (
                  <ul className="yx-pay-findings" aria-label="Waiting for F&F">
                    {live.waitingForFnf!.map((x) => (
                      <li key={x.id} data-sev="warn">
                        <Icon icon={AlertTriangle} label="Waiting" />
                        <div>
                          <p className="yx-pay-findings__title">{`${x.name}: late correction for ${x.on}`}</p>
                          {x.state === 'settled' ? (
                            <p className="yx-pay-findings__desc">
                              <Badge tone="warning">F&F settled</Badge> {`Their settlement (${monthLabel(x.month)}) was settled first: pay it in an off-cycle correction run.`}
                            </p>
                          ) : (
                            <p className="yx-pay-findings__desc">
                              <Badge tone="warning">Waiting for F&F</Badge> {`They have left: their full and final settlement (${monthLabel(x.month)}) pays it.`}
                            </p>
                          )}
                        </div>
                        {x.state === 'settled' && live.onAddToOffcycle ? (
                          <div className="yx-pay-findings__acts">
                            <Button size="sm" loading={adding === x.id} onClick={() => void addToOffcycle(x.id, x.name)}>
                              Add to an off-cycle run
                            </Button>
                          </div>
                        ) : x.fnfId && live.fnfHref ? (
                          <div className="yx-pay-findings__acts">
                            <Link href={live.fnfHref(x.fnfId)}>Open F&F</Link>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div data-span="5" className="yx-pay-panel">
                <SectionTitle>Due this month</SectionTitle>
                {live.calendar && !several ? (
                  <ul className="yx-pay-stack" aria-label="Pay dates">
                    {[
                      { what: 'Attendance and inputs cut-off', on: live.calendar.cutOff },
                      { what: 'Salaries paid', on: live.calendar.payDate },
                    ].map((x) => (
                      <li key={x.what} className="yx-pay-row">
                        <span>{x.what}</span>
                        <span className="yx-pay-muted">{formatDate(day(x.on))}</span>
                        <DueBadge date={day(x.on)} today={day(live.today)} />
                      </li>
                    ))}
                  </ul>
                ) : !several ? (
                  <p className="yx-pay-muted">The cut-off and pay date show once this month's run has a pay group calendar.</p>
                ) : null}
                {due && due.items.length > 0 && <DueDateStrip items={due.items} today={day(live.today)} />}
                {due && due.items.length === 0 && <p className="yx-pay-muted">No statutory dues fall due in {monthLabel(live.month)}.</p>}
                {due && due.undated > 0 && <p className="yx-pay-muted">Professional tax and labour welfare fund dates depend on the state. See them in the statutory hub.</p>}
                {live.dues === null && <p className="yx-pay-muted">Loading statutory dues…</p>}
                {(live.dues === undefined || due?.items.length === 0 || (due?.undated ?? 0) > 0) && (
                  <Button size="sm" asChild>
                    <a href={live.statutoryHref}>PF, ESI, TDS and PT dues</a>
                  </Button>
                )}
              </div>
            </div>
            {last?.totals && (
              <section aria-label="Last run totals" className="yx-pay-grid">
                <div data-span="3">
                  <StatCard label={`Net pay, ${monthLabel(last.month)}`} value={num(last.totals.net)} money previous={prev?.totals ? num(prev.totals.net) : undefined} previousLabel={prev ? monthLabel(prev.month) : undefined} trend={history.map((r) => num(r.totals!.net))} drill={open(last, `View ${plural(last.totals.people, 'payslip')}`)} />
                </div>
                <div data-span="3">
                  <StatCard label={`Gross pay, ${monthLabel(last.month)}`} value={num(last.totals.gross)} money previous={prev?.totals ? num(prev.totals.gross) : undefined} previousLabel={prev ? monthLabel(prev.month) : undefined} drill={open(last, 'View gross pay by person')} />
                </div>
                <div data-span="3">
                  <StatCard label={`Cost to company, ${monthLabel(last.month)}`} value={num(last.totals.employerCost)} money previous={prev?.totals ? num(prev.totals.employerCost) : undefined} previousLabel={prev ? monthLabel(prev.month) : undefined} drill={open(last, 'View employer cost by person')} />
                </div>
                <div data-span="3">
                  <StatCard label={`Employees paid, ${monthLabel(last.month)}`} value={last.totals.people} previous={prev?.totals?.people} previousLabel={prev ? monthLabel(prev.month) : undefined} drill={open(last, 'View employees paid')} />
                </div>
                {history.length > 1 && (
                  <div data-span="12">
                    <LineChart
                      title="Gross and net pay, recent months"
                      description={`Monthly runs for ${groupOf(last) ?? last.entityName ?? 'this pay group'}.`}
                      categories={history.map((r) => shortMonth(r.month))}
                      series={[
                        { name: 'Gross', values: history.map((r) => num(r.totals!.gross)) },
                        { name: 'Net', values: history.map((r) => num(r.totals!.net)) },
                      ]}
                      money
                      xLabel="Month"
                      height={200}
                    />
                  </div>
                )}
              </section>
            )}
            <FrequencyRunsScreen live={{ runs, groups: live.groups ?? [], onOpen: live.onOpen }} />
          </>
        )}
      </LiveStates>
      {creating && <NewRunDrawer live={live} groups={live.groups ?? []} initial={creating.kind} initialGroup={creating.groupId} onClose={() => setCreating(null)} />}
    </div>
  );
}

/** New run: monthly payroll or an off-cycle run (the F&F run starts from the settlement); weekly groups pick a period. */
function NewRunDrawer({ live, groups, initial, initialGroup, onClose }: { live: LivePayrollHome; groups: PayGroupRef[]; initial: 'regular' | 'offcycle'; initialGroup?: string; onClose: () => void }) {
  const [kind, setKind] = useState<'regular' | 'offcycle'>(live.canPrepare ? initial : 'offcycle');
  const [off, setOff] = useState<Exclude<OffcycleKind, 'fnf'>>('bonus');
  const [group, setGroup] = useState<string | null>(initialGroup ?? groups[0]?.id ?? null);
  const [month, setMonth] = useState(live.month);
  const [period, setPeriod] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const g = groups.find((x) => x.id === group);
  // PAY-9.01: a weekly or fortnightly group's regular run is for one period of the month.
  const periods = kind === 'regular' && g?.frequency && g.frequency !== 'monthly' && g.anchorDate && /^\d{4}-\d{2}$/.test(month) ? periodsOf(g.frequency, g.anchorDate, month) : null;
  const errors = [...(!group ? [{ fieldId: 'nr-group', message: 'Choose a pay group.' }] : []), ...(!/^\d{4}-\d{2}$/.test(month) ? [{ fieldId: 'nr-month', message: 'Choose the month.' }] : []), ...(periods && !periods.some((x) => String(x.k) === period) ? [{ fieldId: 'nr-period', message: 'Choose the pay period.' }] : [])];
  const save = useTooEarly(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={kind === 'regular' ? 'Start a payroll run' : 'Start an off-cycle run'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'create'}
            onClick={() => {
              if (save.stop()) return;
              void run('create', async () => {
                const r = await live.onCreate(group!, month, kind === 'regular' ? null : off, periods ? Number(period) : null);
                toast({ title: 'Run created', tone: 'success' });
                live.onOpen(r.id);
              });
            }}
          >
            Create run
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        {error && (
          <InlineAlert tone="danger" title="Not created">
            {error}
          </InlineAlert>
        )}
        {live.canPrepare && live.canOffcycle && !live.onNewOffcycle && (
          <Segment
            label="Kind of run"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'regular', label: 'Monthly payroll' },
              { value: 'offcycle', label: 'Off-cycle' },
            ]}
          />
        )}
        {kind === 'offcycle' && (
          <Segment
            label="Pays"
            value={off}
            onChange={setOff}
            options={[
              { value: 'bonus', label: 'Bonus' },
              { value: 'arrears', label: 'Arrears' },
              { value: 'correction', label: 'Correction' },
              { value: 'payment', label: 'Payment' },
            ]}
          />
        )}
        <FormField id="nr-group" label="Pay group" required error={save.errorOf('nr-group')}>
          <Select value={group} onChange={setGroup} options={groups.map((x) => ({ value: x.id, label: x.name }))} placeholder="Choose a pay group" />
        </FormField>
        <FormField id="nr-month" label="Month" required error={save.errorOf('nr-month')} helper="The month the run pays.">
          <TextField type="month" value={month} onChange={setMonth} />
        </FormField>
        {periods && (
          <FormField id="nr-period" label="Pay period" required error={save.errorOf('nr-period')} helper="The month's items, PT and TDS go in the run that ends the month.">
            <Select value={period} onChange={setPeriod} placeholder="Choose the pay period" options={periods.map((x) => ({ value: String(x.k), label: `${dateText(x.from)} to ${dateText(x.to)}` }))} />
          </FormField>
        )}
        {kind === 'offcycle' && (
          <InlineAlert tone="info" title="An off-cycle run pays only what you add to it">
            It never changes the month's regular payslip and can run after the month is locked. Tax on it is the extra tax the payment adds for the year. A full and final run starts from the settlement.
          </InlineAlert>
        )}
      </div>
    </Drawer>
  );
}

/* ================================================================== PAY-29 run list per frequency */

export interface LiveRunList {
  runs: PayRun[];
  groups: PayGroupRef[];
  onOpen: (id: string) => void;
}
type Freq = 'Monthly' | 'Weekly' | 'Fortnightly';
const FREQ: Record<string, Freq> = { monthly: 'Monthly', weekly: 'Weekly', fortnightly: 'Fortnightly' };

/** The PAY-29 frequency tabs and table, under Payroll home: every run (all nine statuses), opened by a click. */
export function LiveRunListPanel({ live }: { live: LiveRunList }) {
  const group = (r: PayRun) => live.groups.find((g) => g.id === r.payGroupId);
  const freqOf = (r: PayRun): Freq => FREQ[group(r)?.frequency ?? 'monthly'] ?? 'Monthly';
  const byFreq = useMemo(() => {
    const out: Record<Freq, PayRun[]> = { Monthly: [], Weekly: [], Fortnightly: [] };
    for (const r of live.runs) out[freqOf(r)].push(r);
    return out;
  }, [live.runs, live.groups]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = (['Monthly', 'Weekly', 'Fortnightly'] as const).find((f) => byFreq[f].length) ?? 'Monthly';
  const cols: TableColumn<PayRun>[] = [
    { key: 'period', header: 'Run', value: (r) => runName(r), width: 280 },
    { key: 'group', header: 'Pay group', value: (r) => group(r)?.name ?? r.entityName ?? '', width: 220, optional: true },
    { key: 'emp', header: 'Employees', type: 'number', value: (r) => r.totals?.people ?? null, width: 100 },
    { key: 'net', header: 'Net pay', type: 'money', value: (r) => (r.totals ? num(r.totals.net) : null), width: 140 },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <RunStatusBadge status={r.status} />, width: 170 },
  ];
  return (
    <section className="yx-pay-stack" aria-label="Pay runs">
      <SectionTitle>Pay runs</SectionTitle>
      <Tabs defaultValue={first}>
        <TabsList aria-label="Frequency">
          {(['Monthly', 'Weekly', 'Fortnightly'] as const).map((f) => (
            <TabsTrigger key={f} value={f} count={byFreq[f].length}>
              {f}
            </TabsTrigger>
          ))}
        </TabsList>
        {(['Monthly', 'Weekly', 'Fortnightly'] as const).map((f) => (
          <TabsContent key={f} value={f}>
            <DataTable
              label={`${f} runs`}
              columns={cols}
              rows={byFreq[f]}
              getRowId={(r) => r.id}
              cardSummary
              onRowClick={(r) => live.onOpen(r.id)}
              empty={<EmptyState title={f === 'Monthly' ? 'No payroll runs yet' : `No ${f.toLowerCase()} runs yet.`} description={f === 'Monthly' ? "Start this month's payroll for a pay group. Its people, salaries and attendance are checked before anything is calculated." : `Add a pay group with a ${f.toLowerCase()} calendar in Settings › Pay groups & calendars.`} />}
            />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

/* ================================================================== PAY-30 coverage, live */

export interface LiveCoverage {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  rows: CoverageRow[] | null;
  setupHref: string;
  /** PAY-30 Crossed: switch the law on (registration number and start) or record it as applied for; needs payroll.statutory.setup. */
  onSettle?: (row: CoverageRow, x: { applied: boolean; registrationNo?: string; from: string }) => Promise<unknown>;
}
const COVER_STATUS: Record<CoverageRow['status'], DesignCoverageRow['status']> = { not_covered: 'Below', approaching: 'Approaching', covered: 'Covered', crossed: 'Crossed: set-up needed' };

/** The API's daily coverage rows in the design's shape: entity, statute, head count against the threshold. */
export const coverageRows = (rows: CoverageRow[], entities: SetupEntity[]): DesignCoverageRow[] =>
  rows.map((r) => ({
    entity: entities.find((e) => e.id === r.legalEntityId)?.name ?? '',
    statute: statuteText(r.statute),
    basis: 'Employees',
    headcount: r.headcount,
    threshold: r.threshold,
    status: COVER_STATUS[r.status],
    due: r.status === 'covered' ? `${r.registration === 'applied_awaited' ? 'Applied, number awaited' : r.crossedOn ? `Covered since ${dateText(r.crossedOn)}; stays covered` : 'Covered'}` : r.status === 'crossed' ? `Crossed${r.crossedOn ? ` on ${dateText(r.crossedOn)}` : ''}: switch it on or record it as applied for` : r.status === 'approaching' ? `Checked ${dateText(r.evaluatedAt.slice(0, 10))}` : undefined,
    source: r,
  }));

/** Payroll › Statutory coverage (PAY-30): the coverage panel, read only; switching a law on is done in statutory set-up. */
export function LiveCoverageScreen({ live }: { live: LiveCoverage }) {
  return (
    <div className="yx-auth__page yx-pay-stack">
      <PageHeader title="Statutory coverage" description="Head count of each legal entity against the legal thresholds, checked every day. Once covered, an establishment stays covered." />
      <LiveStates state={live.state} onRetry={live.onRetry} what="statutory coverage">
        <CoveragePanel key={JSON.stringify(live.rows)} rows={coverageRows(live.rows ?? [], live.entities)} setupHref={live.setupHref} onSettle={live.onSettle && ((r, x) => live.onSettle!(r.source as CoverageRow, x))} />
      </LiveStates>
    </div>
  );
}
