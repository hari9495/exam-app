// Performance talent decisions: calibration board + 9-box (PRF-09), comp review sheet with market range,
// budget and pay-equity panel (PRF-10).
import { useMemo, useState } from 'react';
import { MoreHorizontal, MoveRight, Send } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Meter, Skeleton } from '../../components/feedback';
import { useAct } from './perf-live';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { BarChart } from '../../components/charts';
import { DataTable, tableToCsv, type TableColumn } from '../../components/table';
import { downloadText } from '../workforce/workforce-kit';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { FormField } from '../../components/field';
import { NumberField, TextArea } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '../../components/menu';
import { formatDate, formatINR } from '../../lib/format';
import { TODAY } from '../_kit/data';
import { ConfidentialTag, GrowthFrame, NineBox, SplitLayout, SuppressedNotice, type NineBoxPerson } from './growth-kit';
import { bandFor, budgetUse, checkProposal, distribution, RATING_LABELS, type Band } from './growth-logic';
import type { LoadState } from './perf-goals';
import './growth.css';

/* ================================================================== PRF-09 · Calibration board (+ 9-box) */

export interface CalibrationPerson {
  id: string;
  name: string;
  manager: string;
  team: string;
  self: number | null;
  /** Live: the manager's score and the calibrated one may be decimals (shown as they are). */
  managerRating: number;
  /** The level (1 = first band) the person sits in now. */
  rating: number;
  protectedLeave?: boolean;
  potential?: 1 | 2 | 3;
  /** Live: the scores behind the levels, e.g. 3.72. */
  managerScore?: number | null;
  score?: number | null;
}

export interface CalibrationChange {
  id: string;
  person: string;
  from: number;
  to: number;
  reason: string;
  by: string;
  at: Date;
  /** Live: the band and score words, e.g. "Meets (3.10)". */
  fromText?: string;
  toText?: string;
}

/** The app's session: levels are the cycle's bands; every change goes to the server, only the facilitator's. */
export interface LiveCalibration {
  onRetry: () => void;
  /** The bands of the cycle's scale, lowest first (they replace the five standard levels). */
  levels: string[];
  /** Shares from the server; null when the group is too small to show a chart. */
  actual: number[] | null;
  notes: string[];
  open: boolean;
  can: { change: boolean; signOff: boolean; potential: boolean };
  onMove: (personId: string, level: number, reason: string) => Promise<unknown>;
  onPotential: (personId: string, potential: 1 | 2 | 3, reason: string) => Promise<unknown>;
  onSignOff: () => Promise<unknown>;
}

export interface CalibrationProps {
  persona: 'hr' | 'mgr';
  session: { name: string; facilitator: string; group: string; date: Date };
  people: CalibrationPerson[];
  guide: number[];
  changes: CalibrationChange[];
  tab?: 'board' | 'ninebox' | 'changes';
  pendingMove?: { id: string; to: number };
  /** Manager sees only their own team as movable. */
  myTeam?: string;
  state?: LoadState;
  /** Stories: open the close-calibration question. */
  closeOpen?: boolean;
  live?: LiveCalibration;
}

/** PRF-09 Calibration (T6): ratings board by rating, distribution vs a guide only (no forced curve), change with reason (YX-PERF-08); 9-box (wave 6). */
export function CalibrationScreen({ persona, session, people: initial, guide, changes: initialChanges, tab = 'board', pendingMove, myTeam, state = 'ready', closeOpen, live }: CalibrationProps) {
  const [ownPeople, setPeople] = useState(initial);
  const [ownChanges, setChanges] = useState(initialChanges);
  const people = live ? initial : ownPeople;
  const changes = live ? initialChanges : ownChanges;
  const [pending, setPending] = useState(pendingMove ?? null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [closing, setClosing] = useState(!!closeOpen);
  const { act, toast } = useAct();
  const levels: readonly string[] = live?.levels ?? RATING_LABELS;
  const n = levels.length;
  const counted = people.filter((p) => !p.protectedLeave);
  const actual = live ? live.actual : distribution(counted.map((p) => p.rating));
  const who = pending ? people.find((p) => p.id === pending.id) : null;
  const canMove = (p: CalibrationPerson) => (live ? live.can.change : persona === 'hr' || p.team === myTeam);
  const label = (r: number) => `${r} · ${levels[r - 1] ?? ''}`;
  const scoreText = (p: CalibrationPerson) => (p.managerScore != null ? `manager ${p.managerScore.toFixed(2)}${p.score != null && p.score !== p.managerScore ? ` → ${p.score.toFixed(2)}` : ''}` : `manager ${p.managerRating}${p.rating !== p.managerRating ? ` → ${p.rating}` : ''}`);
  // Performance on the 9-box: the lower, middle and upper thirds of the levels.
  const third = (r: number) => (Math.ceil((r / n) * 3) as 1 | 2 | 3) || 1;
  const nine: NineBoxPerson[] = people.map((p) => ({ id: p.id, name: p.name, performance: live ? third(p.rating) : ((p.rating >= 4 ? 3 : p.rating >= 3 ? 2 : 1) as 1 | 2 | 3), potential: p.potential ?? 2, protectedLeave: p.protectedLeave }));

  const board = (
    <div className="yx-growth-cols" data-n={String(n)}>
      {levels.map((l, i) => {
        const r = i + 1;
        const col = people.filter((p) => p.rating === r);
        return (
          <section key={l} className="yx-growth-panel" aria-label={`${r} · ${l}: ${col.length} people`}>
            <div className="yx-growth-row" data-between="">
              <h3 className="yx-growth-h">{label(r)}</h3>
              <span className="yx-growth-num yx-growth-meta">{col.length}</span>
            </div>
            <ul className="yx-growth-list">
              {col.map((p) => (
                <li key={p.id} className="yx-growth-list__item">
                  <div className="yx-growth-list__main">
                    <span className="yx-growth-list__title">{p.name}</span>
                    <span className="yx-growth-meta">
                      {p.team} · self {p.self ?? '—'} · {scoreText(p)}
                    </span>
                    {p.protectedLeave && <Badge tone="info">Protected leave · not counted</Badge>}
                  </div>
                  {canMove(p) && (
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton icon={MoreHorizontal} label={`Change rating for ${p.name}`} size="sm" />
                      </MenuTrigger>
                      <MenuContent>
                        <MenuLabel>Move to rating</MenuLabel>
                        {levels
                          .map((_, j) => j + 1)
                          .filter((x) => x !== p.rating)
                          .map((x) => (
                            <MenuItem key={x} icon={MoveRight} onSelect={() => setPending({ id: p.id, to: x })}>
                              {label(x)}
                            </MenuItem>
                          ))}
                      </MenuContent>
                    </Menu>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
  const closed = live ? !live.open : false;
  const canClose = live ? live.can.signOff : persona === 'hr';

  return (
    <GrowthFrame area="performance" active="Calibration & comp review" persona={persona}>
      <PageHeader
        title={session.name}
        status={
          <>
            <Badge tone={closed ? 'success' : 'info'}>{closed ? 'Signed off' : 'In session'}</Badge> <ConfidentialTag />
          </>
        }
        facts={`${session.group} · facilitator ${session.facilitator} · ${formatDate(session.date)} · ${people.length} people`}
        actions={
          canClose ? (
            <Button variant="primary" onClick={() => setClosing(true)}>
              Close calibration
            </Button>
          ) : undefined
        }
      />
      <InlineAlert tone="info" title="Guide only">
        The distribution guide helps the discussion; nobody is forced into a curve. Every change needs a reason and is recorded. Employees see only their released rating.
      </InlineAlert>
      {state === 'error' ? (
        <ErrorState title="We couldn’t load this session" description="Check your connection and try again." onRetry={live?.onRetry} />
      ) : state === 'loading' ? (
        <Skeleton height={360} />
      ) : people.length === 0 ? (
        <EmptyState title="No manager ratings yet" description="Calibration opens when manager reviews are submitted for this group." />
      ) : (
        <Tabs defaultValue={tab}>
          <TabsList aria-label="Calibration views">
            <TabsTrigger value="board">Ratings board</TabsTrigger>
            <TabsTrigger value="ninebox">9-box</TabsTrigger>
            <TabsTrigger value="changes" count={changes.length}>
              Changes
            </TabsTrigger>
          </TabsList>
          <TabsContent value="board">
            <div className="yx-growth-stack">
              {actual ? (
                <BarChart
                  title="Distribution against the guide"
                  description={`${counted.length} people counted; ${people.length - counted.length} on protected leave are left out.`}
                  xLabel="Rating"
                  categories={levels.map((l, i) => `${i + 1} ${l}`)}
                  series={[{ name: 'This group, %', values: actual }, ...(guide.length === n ? [{ name: 'Guide, %', values: guide }] : [])]}
                  emphasis="This group, %"
                  height={200}
                />
              ) : (
                <Text tone="secondary">Too few people to show a distribution without pointing at someone. The board below still works.</Text>
              )}
              {live?.notes.map((x) => (
                <Text key={x} size="sm" tone="secondary">
                  {x}
                </Text>
              ))}
              {board}
            </div>
          </TabsContent>
          <TabsContent value="ninebox">
            <div className="yx-growth-stack">
              <Text tone="secondary">Performance from the calibrated rating; potential from the manager’s potential rating. Moving someone asks for a reason.{live ? ' On the 9-box you change potential; change the rating on the ratings board.' : ''}</Text>
              <NineBox
                key={live ? nine.map((x) => `${x.id}${x.performance}${x.potential}`).join() : 'sample'}
                people={nine}
                readOnly={live ? !live.can.potential : persona === 'mgr'}
                onMove={
                  live
                    ? (id, perf, pot, why) => {
                        const before = nine.find((x) => x.id === id);
                        if (before && before.performance !== perf) return void toast({ title: 'Change the rating on the Ratings board. Here you change potential only.', tone: 'error' });
                        void act('potential', () => live.onPotential(id, pot as 1 | 2 | 3, why), 'Potential changed');
                      }
                    : undefined
                }
              />
            </div>
          </TabsContent>
          <TabsContent value="changes">
            <DataTable
              label="Calibration changes"
              rows={changes}
              getRowId={(r) => r.id}
              empty={<EmptyState compact title="No changes yet" />}
              columns={[
                { key: 'person', header: 'Employee', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }), width: 200 },
                { key: 'from', header: 'From', value: (r) => r.fromText ?? label(r.from), width: 160 },
                { key: 'to', header: 'To', value: (r) => r.toText ?? label(r.to), width: 160 },
                { key: 'reason', header: 'Reason', value: (r) => r.reason, width: 320 },
                { key: 'by', header: 'By', value: (r) => r.by, width: 170 },
                { key: 'at', header: 'When', type: 'date', value: (r) => r.at, width: 120 },
              ]}
            />
          </TabsContent>
        </Tabs>
      )}
      <ConfirmDialog
        open={pending != null}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null);
            setReason('');
            setTried(false);
          }
        }}
        title={who && pending ? `Change ${who.name} from ${label(who.rating)} to ${label(pending.to)}?` : 'Change rating'}
        consequence="The before and after rating, your reason and your name are recorded. The employee sees only the released rating."
        confirmLabel="Change rating"
        onConfirm={async () => {
          setTried(true);
          if (reason.trim().length < 10) {
            document.getElementById('cal-reason')?.focus();
            return false;
          }
          if (!pending || !who) return;
          if (live) {
            await live.onMove(who.id, pending.to, reason.trim());
            toast({ title: `${who.name} moved to ${levels[pending.to - 1]}`, tone: 'success' });
          } else {
            setChanges((c) => [{ id: `c${c.length + 1}`, person: who.name, from: who.rating, to: pending.to, reason, by: persona === 'hr' ? 'Lakshmi Venkatesan' : 'Karthik Subramanian', at: TODAY }, ...c]);
            setPeople((ps) => ps.map((p) => (p.id === pending.id ? { ...p, rating: pending.to } : p)));
          }
          setPending(null);
          setReason('');
          setTried(false);
        }}
      >
        <FormField label="Reason" required id="cal-reason" rule="At least 10 characters." helper="Visible to HR and this calibration group." error={tried && reason.trim().length < 10 ? 'Enter a reason of at least 10 characters.' : null}>
          <TextArea value={reason} onChange={setReason} rows={3} />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        title={`Close ${session.name}?`}
        consequence="The calibrated ratings become final for release. Nobody can change them in this session after this. The distribution guide never blocks closing."
        confirmLabel="Close calibration"
        onConfirm={async () => {
          if (!live) return;
          await live.onSignOff();
          toast({ title: 'Calibration closed. The reviews are ready to release.', tone: 'success' });
        }}
      />
    </GrowthFrame>
  );
}

/* ================================================================== PRF-10 · Comp review sheet */

export interface CompRow {
  id: string;
  name: string;
  department: string;
  grade: string;
  /** Sample only (the pay-equity panel is worked out on the server in the app). */
  gender?: 'F' | 'M';
  score: number | null;
  ctc: number;
  gradeMid: number;
  market?: { p25: number; p50: number; p75: number };
  /** Eligibility proration (YX-PERF-21). */
  factor: number;
  eligibility: string;
  proposed: number | null;
  justification?: string;
  peerMedian: number;
  /** Live: the server's matrix cell, band, compa-ratio and checks replace the sample's worked-out ones. */
  live?: { band: string; compa: number | null; range: [number, number] | null; outOfRange: boolean; newCtc: number; increment: number; belowPeers: boolean; editable: boolean; promotionToDesignationId: string | null; promotionAmount: number; bonusAmount: number };
}

/** What a manager (or HR) changes on one proposal; the app adds the version. */
export interface CompProposalInput {
  meritPct: number;
  promotionToDesignationId: string | null;
  promotionAmount: number;
  bonusAmount: number;
  justification: string | null;
}

/** The app's comp cycle: pay is read inside the pay scope; every proposal and decision is checked on the server. */
export interface LiveCompReview {
  onRetry: () => void;
  title: string;
  facts: string;
  budgets: { department: string; amount: number; used: number; remaining: number; over: boolean }[];
  /** HR and finance: the pay gap by gender before and after; null for a manager (never shown to them). */
  equity: { dimension: string; before: string; after: string; suppressed?: boolean }[] | null;
  can: { submit: boolean; decide: boolean; budgets: boolean; open: boolean; apply: boolean };
  /** HR: budgets per department (merit and promotions, bonus pool) while the cycle is a draft. */
  departments: { value: string; label: string }[];
  designations: { value: string; label: string }[];
  equityDimension: 'gender' | 'grade' | 'location';
  onEquity: (dimension: 'gender' | 'grade' | 'location') => void;
  onPropose: (rowId: string, input: CompProposalInput) => Promise<unknown>;
  onSubmit: () => Promise<unknown>;
  onDecide: (decision: 'approve' | 'send_back', reason: string | null) => Promise<unknown>;
  onBudgets: (input: { departmentId: string; merit: number | null; bonus: number | null }) => Promise<unknown>;
  onOpenCycle: () => Promise<unknown>;
  onApply: () => Promise<unknown>;
}

const EQUITY_DIMENSIONS = [
  { value: 'gender' as const, label: 'Gender' },
  { value: 'grade' as const, label: 'Grade' },
  { value: 'location' as const, label: 'Location' },
];

function BudgetsDialog({ open, onOpenChange, live }: { open: boolean; onOpenChange: (o: boolean) => void; live?: LiveCompReview }) {
  const [dept, setDept] = useState<string | null>(null);
  const [merit, setMerit] = useState<number | null>(null);
  const [bonus, setBonus] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const { toast } = useAct();
  const missing = !dept ? 'comp-b-dept' : merit === null && bonus === null ? 'comp-b-merit' : null;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTried(false);
      }}
      title="Set a department budget"
      consequence="Proposals are checked against it. Over budget needs an extra finance approval, or is refused, as the company setting says."
      confirmLabel="Save budget"
      onConfirm={async () => {
        setTried(true);
        if (missing) {
          document.getElementById(missing)?.focus();
          return false;
        }
        if (!live) return;
        await live.onBudgets({ departmentId: dept!, merit, bonus });
        toast({ title: 'Budget saved', tone: 'success' });
      }}
    >
      <FormField label="Department" required id="comp-b-dept" error={tried && !dept ? 'Choose the department.' : null}>
        <Select value={dept} onChange={setDept} options={live?.departments ?? [{ value: 'q', label: 'Quality' }]} searchable />
      </FormField>
      <FormField label="Merit and promotions (₹ a year)" id="comp-b-merit" error={tried && dept && merit === null && bonus === null ? 'Enter a merit budget or a bonus pool.' : null}>
        <NumberField value={merit} onChange={setMerit} min={0} decimals />
      </FormField>
      <FormField label="Bonus pool (₹)" optional>
        <NumberField value={bonus} onChange={setBonus} min={0} decimals />
      </FormField>
    </ConfirmDialog>
  );
}

export interface CompReviewProps {
  persona: 'mgr' | 'hr' | 'fin';
  rows: CompRow[];
  budget: { department: string; amount: number }[];
  equity?: { dimension: string; before: string; after: string; suppressed?: boolean }[];
  benchmark?: { source: string; effective: Date; stale?: boolean } | null;
  justifyFor?: string;
  /** Stories: open the send-back question, the budget dialog or the apply question. */
  sendBackOpen?: boolean;
  budgetsOpen?: boolean;
  applyOpen?: boolean;
  state?: LoadState;
  live?: LiveCompReview;
}

/** PRF-10 Comp review sheet (T6): matrix suggestion, out-of-range justification, budget used, market P25–P75, pay-equity panel (YX-PERF-10/18/19). */
export function CompReviewScreen({ persona, rows: initial, budget, equity: sampleEquity = [], benchmark, justifyFor, sendBackOpen, budgetsOpen, applyOpen, state = 'ready', live }: CompReviewProps) {
  const [own, setRows] = useState(initial);
  const rows = live ? initial : own;
  const [justify, setJustify] = useState<string | null>(justifyFor ?? null);
  // Live: a % outside the range waits here until it has its justification.
  const [draftPct, setDraftPct] = useState<Record<string, number>>({});
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [sendingBack, setSendingBack] = useState(!!sendBackOpen);
  const [backReason, setBackReason] = useState('');
  const [triedBack, setTriedBack] = useState(false);
  const [budgeting, setBudgeting] = useState(!!budgetsOpen);
  const [applying, setApplying] = useState(!!applyOpen);
  // Live proposal drawer: merit %, a promotion and a bonus, saved together with the justification when one is needed.
  const first = initial.find((r) => r.id === justifyFor);
  const [merit, setMerit] = useState<number | null>(first?.proposed ?? null);
  const [promote, setPromote] = useState<'no' | 'yes'>(first?.live?.promotionToDesignationId ? 'yes' : 'no');
  const [desig, setDesig] = useState<string | null>(first?.live?.promotionToDesignationId ?? null);
  const [promoAmount, setPromoAmount] = useState<number | null>(first?.live?.promotionAmount || null);
  const [bonus, setBonus] = useState<number | null>(first?.live?.bonusAmount ?? null);
  const { busy, act, toast } = useAct();
  const equity = live ? (live.equity ?? []) : sampleEquity;
  const withCalc = useMemo(
    () =>
      rows.map((r) => {
        if (r.live) {
          const l = r.live;
          const check = l.range ? { range: l.range, within: !l.outOfRange, needsJustification: l.outOfRange } : null;
          return { ...r, band: l.band, compa: l.compa ?? 0, check, suggested: l.range ?? ([0, 0] as [number, number]), increment: l.increment, newCtc: l.newCtc, belowPeer: l.belowPeers, marketRatio: null as number | null };
        }
        const band = bandFor(r.score ?? 0) as Band;
        const compa = Math.round((r.ctc / r.gradeMid) * 100) / 100;
        const check = r.proposed == null ? null : checkProposal(band, compa, r.proposed);
        const suggested = checkProposal(band, compa, 0).range;
        const increment = r.proposed == null ? 0 : Math.round(r.ctc * (r.proposed / 100) * r.factor);
        const belowPeer = r.ctc < r.peerMedian * 0.9;
        return { ...r, band: band as string, compa, check, suggested, increment, newCtc: r.ctc + increment, belowPeer, marketRatio: r.market ? Math.round((r.ctc / r.market.p50) * 100) / 100 : null };
      }),
    [rows],
  );
  type Calc = (typeof withCalc)[number];
  const budgets = live ? live.budgets : budget.map((b) => ({ department: b.department, amount: b.amount, ...budgetUse(b.amount, withCalc.filter((r) => r.department === b.department).map((r) => ({ annualCost: r.increment }))) }));
  const outOfRange = withCalc.filter((r) => r.check && !r.check.within && !r.justification);
  const editable = (r: Calc) => (r.live ? r.live.editable : persona === 'mgr');
  const outside = (r: Calc, v: number) => (r.live?.range ? v < r.live.range[0] - 0.001 || v > r.live.range[1] + 0.001 : v > 0);
  const openDrawer = (r: Calc, pct?: number) => {
    if (pct !== undefined) setDraftPct((d) => ({ ...d, [r.id]: pct }));
    setMerit(pct ?? r.proposed);
    setPromote(r.live?.promotionToDesignationId ? 'yes' : 'no');
    setDesig(r.live?.promotionToDesignationId ?? null);
    setPromoAmount(r.live?.promotionAmount || null);
    setBonus(r.live?.bonusAmount ?? null);
    setText(r.justification ?? '');
    setTextError(null);
    setJustify(r.id);
  };
  const propose = (r: Calc, v: number | null) => {
    if (!live) return setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, proposed: v, justification: undefined } : x)));
    if (v == null || v < 0) return void toast({ title: 'Enter a percentage of 0 or more.', tone: 'error' });
    if (outside(r, v) || r.live?.promotionToDesignationId) return openDrawer(r, v);
    void act(`p-${r.id}`, () => live.onPropose(r.id, { meritPct: v, promotionToDesignationId: null, promotionAmount: 0, bonusAmount: r.live?.bonusAmount ?? 0, justification: null }), `${r.name}: ${v}% saved`);
  };
  const cols: TableColumn<Calc>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: [r.grade, r.department].filter(Boolean).join(' · ') }), width: 220 },
    { key: 'band', header: 'Rating', value: (r) => r.score, render: (r) => (r.score == null ? r.band || 'Not rated' : `${r.score.toFixed(2)} · ${r.band}`), width: 190 },
    { key: 'ctc', header: 'Current CTC', type: 'money', value: (r) => r.ctc, total: 'sum', width: 140 },
    { key: 'compa', header: 'Compa-ratio', type: 'number', value: (r) => r.compa, render: (r) => (r.compa ? r.compa.toFixed(2) : '—'), width: 120 },
    {
      key: 'market',
      header: 'Market P25–P75',
      value: (r) => r.marketRatio,
      render: (r) =>
        r.market ? (
          <span className="yx-growth-row" title={`P25 ${formatINR(r.market.p25)} · P50 ${formatINR(r.market.p50)} · P75 ${formatINR(r.market.p75)}`}>
            <span className="yx-growth-range" aria-hidden="true">
              <span className="yx-growth-range__band" style={{ left: '25%', width: '50%' }} />
              <span className="yx-growth-range__mark" style={{ left: `${Math.max(0, Math.min(100, 25 + ((r.ctc - r.market.p25) / (r.market.p75 - r.market.p25)) * 50))}%` }} />
            </span>
            <span className="yx-growth-num">{r.marketRatio?.toFixed(2)}</span>
          </span>
        ) : (
          'No match'
        ),
      width: 180,
    },
    { key: 'range', header: 'Suggested', value: (r) => r.suggested[0], render: (r) => (r.live && !r.live.range ? 'No matrix cell' : `${r.suggested[0]}–${r.suggested[1]}%`), width: 120 },
    { key: 'proposed', header: 'Proposed %', type: 'number', value: (r) => (r.id in draftPct ? draftPct[r.id]! : r.proposed), editable: persona === 'mgr' || (live && rows.some((x) => x.live?.editable)) ? 'number' : undefined, width: 120 },
    { key: 'factor', header: 'Proration', value: (r) => r.factor, render: (r) => (r.factor === 1 ? 'Full' : `${Math.round(r.factor * 12)}/12 · ${r.eligibility}`), width: 170 },
    { key: 'newctc', header: 'New CTC', type: 'money', value: (r) => r.newCtc, total: 'sum', width: 140 },
    {
      key: 'flags',
      header: 'Checks',
      value: (r) => (r.check && !r.check.within ? 'Out of range' : r.belowPeer ? 'Below peers' : 'OK'),
      render: (r) => (
        <span className="yx-growth-row">
          {r.check && !r.check.within && <Badge tone={r.justification ? 'info' : 'danger'}>{r.justification ? 'Justified · extra approval' : 'Needs justification'}</Badge>}
          {r.belowPeer && <Badge tone="warning">Below peer median (advisory)</Badge>}
          {(!r.check || r.check.within) && !r.belowPeer && <Badge tone="success">OK</Badge>}
        </span>
      ),
      width: 260,
    },
  ];
  const current = withCalc.find((r) => r.id === justify);
  const pct = current ? (live ? merit : (draftPct[current.id] ?? current.proposed)) : null;
  const needsWhy = Boolean(current && live && (promote === 'yes' || (pct != null && outside(current, pct))));
  const preview = current && pct != null ? Math.round(current.ctc * (pct / 100) * (current.live ? 1 : current.factor)) : (current?.increment ?? 0);
  const closeJustify = () => {
    if (current) setDraftPct(({ [current.id]: _, ...rest }) => rest);
    setJustify(null);
    setText('');
    setTextError(null);
  };
  const saveJustify = async () => {
    if (!current) return;
    if (live && (pct == null || pct < 0)) return document.getElementById('comp-merit')?.focus();
    if (live && promote === 'yes' && (!desig || !promoAmount)) return document.getElementById(!desig ? 'comp-desig' : 'comp-promo')?.focus();
    if ((!live || needsWhy) && text.trim().length < 20) {
      setTextError('Write at least 20 characters: why this person needs a different increase.');
      return document.getElementById('comp-justify')?.focus();
    }
    if (live) {
      const input = { meritPct: pct ?? 0, promotionToDesignationId: promote === 'yes' ? desig : null, promotionAmount: promote === 'yes' ? (promoAmount ?? 0) : 0, bonusAmount: bonus ?? 0, justification: text.trim() || null };
      if (await act('justify', () => live.onPropose(current.id, input), `${current.name}: proposal saved`)) closeJustify();
      return;
    }
    setRows((xs) => xs.map((x) => (x.id === current.id ? { ...x, justification: text } : x)));
    closeJustify();
  };
  const exportCsv = () => downloadText('comp-review.csv', tableToCsv(withCalc, cols.filter((c) => c.key !== 'market' && c.key !== 'flags')));
  const submit = () => {
    if (outOfRange.length) return void toast({ title: `${outOfRange.length} proposals need a justification first.`, tone: 'error' });
    if (live) void act('submit', live.onSubmit, 'Proposals sent for approval');
  };
  const hrActions = live && (
    <>
      {live.can.budgets && <Button onClick={() => setBudgeting(true)}>Budgets</Button>}
      {live.can.open && (
        <Button variant="primary" loading={busy === 'open'} onClick={() => void act('open', live.onOpenCycle, 'Cycle opened. Managers can propose now.')}>
          Open for proposals
        </Button>
      )}
      {live.can.apply && (
        <Button variant="primary" onClick={() => setApplying(true)}>
          Apply pay changes
        </Button>
      )}
    </>
  );
  const managerActions = (
    <>
      {hrActions}
      <Button onClick={exportCsv}>Export</Button>
      {(!live || live.can.submit) && (
        <Button variant="primary" icon={Send} loading={busy === 'submit'} onClick={submit}>
          Send proposals for approval
        </Button>
      )}
    </>
  );
  const approverActions =
    !live || live.can.decide ? (
      <>
        {hrActions}
        <Button onClick={() => setSendingBack(true)}>Send back</Button>
        <Button variant="approve" loading={busy === 'approve'} onClick={() => live && void act('approve', () => live.onDecide('approve', null), 'Proposals approved')}>
          Approve {rows.length} proposals
        </Button>
      </>
    ) : (
      <>
        {hrActions}
        <Button onClick={exportCsv}>Export</Button>
      </>
    );
  return (
    <GrowthFrame area="performance" active="Calibration & comp review" persona={persona === 'fin' ? 'fin' : persona}>
      <PageHeader title={live?.title ?? 'Comp review · FY 2026-27 increments'} status={<ConfidentialTag />} facts={live?.facts ?? `${persona === 'mgr' ? 'Your team' : 'Quality and Engineering'} · effective 1 Apr 2026 · matrix: rating band × compa-ratio`} actions={persona === 'mgr' ? managerActions : approverActions} />
      {outOfRange.length > 0 && (
        <InlineAlert tone="warning" title={`${outOfRange.length} proposals are outside the suggested range`} actions={<Button size="sm" onClick={() => (live ? openDrawer(outOfRange[0]!) : setJustify(outOfRange[0]!.id))}>Add justification</Button>}>
          Add a justification to each. Out-of-range proposals need an extra approval from Finance.
        </InlineAlert>
      )}
      {benchmark === null ? (
        <InlineAlert tone="info" title="No market data">
          Market ranges come from the benchmark add-on or your own salary-survey upload. Upload a survey file to compare pay with the market; no employee data is sent out.
        </InlineAlert>
      ) : benchmark?.stale ? (
        <InlineAlert tone="warning" title="Market data is older than 12 months">
          {benchmark.source}, effective {formatDate(benchmark.effective)}. Upload newer data or read the ranges with care.
        </InlineAlert>
      ) : null}
      {state === 'error' ? (
        <ErrorState title="We couldn’t load this comp cycle" description="Check your connection and try again." onRetry={live?.onRetry} />
      ) : state === 'loading' ? (
        <Skeleton height={360} />
      ) : (
        <SplitLayout
          main={
            <DataTable
              label="Comp proposals"
              columns={cols}
              rows={withCalc}
              getRowId={(r) => r.id}
              onCellEdit={(r, key, v) => key === 'proposed' && editable(r) && propose(r, v as number | null)}
              onRowClick={(r) => (live ? editable(r) && openDrawer(r) : r.check && !r.check.within && setJustify(r.id))}
              empty={<EmptyState title="No one to review" description="People appear here once ratings are released." />}
            />
          }
          side={
            <>
              <Card title="Budget">
                {budgets.length === 0 ? (
                  <Text size="sm" tone="secondary">No budget is set for this cycle.</Text>
                ) : (
                  budgets.map((b) => (
                    <div key={b.department} className="yx-growth-stack" data-gap="sm">
                      <Meter label={`${b.department} increment budget`} value={b.used} max={b.amount} valueText={`${formatINR(b.used)} of ${formatINR(b.amount)} (${b.amount > 0 ? Math.round((b.used / b.amount) * 100) : 0}%)`} />
                      <Text size="sm" tone={b.over ? 'danger' : 'secondary'}>
                        {b.over ? `Over budget by ${formatINR(-b.remaining)}. Lower proposals or ask Finance for more.` : `${formatINR(b.remaining)} left, annualised.`}
                      </Text>
                    </div>
                  ))
                )}
              </Card>
              <Card title="Pay equity" actions={<Badge tone="info">Advisory</Badge>}>
                {live && live.equity === null ? (
                  <Text size="sm" tone="secondary">
                    Pay-gap figures are for HR and finance. Your proposals are checked for them when you send.
                  </Text>
                ) : (
                  <>
                    {live && <Segment label="Pay gap by" value={live.equityDimension} onChange={live.onEquity} options={EQUITY_DIMENSIONS} />}
                    <Text size="sm" tone="secondary">
                      {persona === 'mgr' ? 'Gap for your team after your proposals.' : `${live ? EQUITY_DIMENSIONS.find((d) => d.value === live.equityDimension)!.label : 'Gender'} pay gap, median, before and after these proposals.`}
                    </Text>
                    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                      <table className="yx-growth-matrix">
                        <thead>
                          <tr>
                            <th scope="col">Group</th>
                            {persona !== 'mgr' && <th scope="col">Before</th>}
                            <th scope="col">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {equity.map((e) => (
                            <tr key={e.dimension}>
                              <th scope="row">{e.dimension}</th>
                              {e.suppressed ? (
                                <td colSpan={persona !== 'mgr' ? 2 : 1}>Suppressed (fewer than 5)</td>
                              ) : (
                                <>
                                  {persona !== 'mgr' && <td className="yx-growth-num">{e.before}</td>}
                                  <td className="yx-growth-num">{e.after}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {equity.length === 0 && <SuppressedNotice what="Pay-gap figures" />}
                  </>
                )}
              </Card>
              {benchmark && (
                <Text size="sm" tone="secondary">
                  Market: {benchmark.source}, effective {formatDate(benchmark.effective)}.
                </Text>
              )}
            </>
          }
        />
      )}
      {current && (
        <Drawer
          open
          onOpenChange={(o) => !o && closeJustify()}
          title={live ? `Proposal for ${current.name}` : `Justify ${pct}% for ${current.name}`}
          subtitle={current.live && !current.live.range ? `No matrix cell for ${current.band}: any increase needs a reason` : `Suggested ${current.suggested[0]}–${current.suggested[1]}% for ${current.band} at compa-ratio ${current.compa.toFixed(2)}`}
          footer={
            <div className="yx-growth-foot">
              <Button onClick={closeJustify}>Cancel</Button>
              <Button variant="primary" loading={busy === 'justify'} onClick={() => void saveJustify()}>
                Save justification
              </Button>
            </div>
          }
        >
          <div className="yx-growth-stack">
            <PersonLabel name={current.name} secondary={`${current.grade} · current ${formatINR(current.ctc)}`} />
            {live && (
              <>
                <FormField label="Merit increase (%)" required id="comp-merit" error={pct == null ? 'Enter the increase, 0 for none.' : null}>
                  <NumberField value={merit} onChange={setMerit} min={0} max={100} decimals />
                </FormField>
                <FormField label="Promotion">
                  <Segment label="Promotion" value={promote} onChange={setPromote} options={[{ value: 'no' as const, label: 'No promotion' }, { value: 'yes' as const, label: 'Promote' }]} />
                </FormField>
                {promote === 'yes' && (
                  <>
                    <FormField label="New designation" required id="comp-desig" error={!desig ? 'Choose the new designation.' : null}>
                      <Select value={desig} onChange={setDesig} options={live.designations} searchable />
                    </FormField>
                    <FormField label="Promotion increase (₹ a year)" required id="comp-promo" error={!promoAmount ? 'Enter the promotion increase.' : null}>
                      <NumberField value={promoAmount} onChange={setPromoAmount} min={0} decimals />
                    </FormField>
                  </>
                )}
                <FormField label="Bonus (₹)" optional>
                  <NumberField value={bonus} onChange={setBonus} min={0} decimals />
                </FormField>
              </>
            )}
            <FormField label="Justification" required={!live || needsWhy} optional={Boolean(live) && !needsWhy} id="comp-justify" helper="Finance sees this with the extra approval request." error={textError}>
              <TextArea value={text} onChange={setText} rows={4} maxLength={1000} />
            </FormField>
            <div className="yx-growth-effect">
              <span className="yx-growth-effect__title">Effect</span>
              <ul>
                <li>
                  New CTC {formatINR(current.ctc + preview)} (+{formatINR(preview)} a year{current.factor < 1 ? `, prorated ${Math.round(current.factor * 12)}/12` : ''})
                </li>
                {(!live || needsWhy) && <li>Adds an approval step: Finance</li>}
                <li>On approval, a dated compensation change and an increment letter are created</li>
              </ul>
            </div>
          </div>
        </Drawer>
      )}
      <ConfirmDialog
        open={sendingBack}
        onOpenChange={(o) => {
          setSendingBack(o);
          if (!o) setTriedBack(false);
        }}
        title="Send the proposals back?"
        consequence="They go back to draft for the manager, with your note. Nothing is approved."
        confirmLabel="Send back"
        onConfirm={async () => {
          setTriedBack(true);
          if (backReason.trim().length < 3) {
            document.getElementById('comp-back')?.focus();
            return false;
          }
          if (!live) return;
          await live.onDecide('send_back', backReason.trim());
          toast({ title: 'Proposals sent back to draft', tone: 'success' });
        }}
      >
        <FormField label="What to change" required id="comp-back" error={triedBack && backReason.trim().length < 3 ? 'Say what to change.' : null}>
          <TextArea value={backReason} onChange={setBackReason} rows={3} maxLength={1000} />
        </FormField>
      </ConfirmDialog>
      <BudgetsDialog open={budgeting} onOpenChange={setBudgeting} live={live} />
      <ConfirmDialog
        open={applying}
        onOpenChange={setApplying}
        title="Apply the approved pay changes?"
        consequence="Pay changes go into job history from the effective date, bonuses go to payroll, and letters follow. It happens once, all at once. You confirm your identity again first."
        confirmLabel="Apply pay changes"
        onConfirm={async () => {
          if (!live) return;
          await live.onApply();
          toast({ title: 'Pay changes applied', tone: 'success' });
        }}
      />
    </GrowthFrame>
  );
}
