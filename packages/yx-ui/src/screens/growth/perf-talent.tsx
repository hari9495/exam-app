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
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
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

const share = (ratings: number[], n: number) => {
  const counts = Array.from({ length: n }, () => 0);
  for (const r of ratings) counts[Math.min(n, Math.max(1, Math.round(r))) - 1]! += 1;
  return counts.map((c) => Math.round((c / (ratings.length || 1)) * 100));
};

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
  gender: 'F' | 'M';
  score: number;
  ctc: number;
  gradeMid: number;
  market?: { p25: number; p50: number; p75: number };
  /** Eligibility proration (YX-PERF-21). */
  factor: number;
  eligibility: string;
  proposed: number | null;
  justification?: string;
  peerMedian: number;
}

export interface CompReviewProps {
  persona: 'mgr' | 'hr' | 'fin';
  rows: CompRow[];
  budget: { department: string; amount: number }[];
  equity?: { dimension: string; before: string; after: string; suppressed?: boolean }[];
  benchmark?: { source: string; effective: Date; stale?: boolean } | null;
  justifyFor?: string;
  state?: LoadState;
}

/** PRF-10 Comp review sheet (T6): matrix suggestion, out-of-range justification, budget used, market P25–P75, pay-equity panel (YX-PERF-10/18/19). */
export function CompReviewScreen({ persona, rows: initial, budget, equity = [], benchmark, justifyFor, state = 'ready' }: CompReviewProps) {
  const [rows, setRows] = useState(initial);
  const [justify, setJustify] = useState<string | null>(justifyFor ?? null);
  const [text, setText] = useState('');
  const withCalc = useMemo(
    () =>
      rows.map((r) => {
        const band = bandFor(r.score) as Band;
        const compa = Math.round((r.ctc / r.gradeMid) * 100) / 100;
        const check = r.proposed == null ? null : checkProposal(band, compa, r.proposed);
        const suggested = checkProposal(band, compa, 0).range;
        const increment = r.proposed == null ? 0 : Math.round(r.ctc * (r.proposed / 100) * r.factor);
        const belowPeer = r.ctc < r.peerMedian * 0.9;
        return { ...r, band, compa, check, suggested, increment, newCtc: r.ctc + increment, belowPeer, marketRatio: r.market ? Math.round((r.ctc / r.market.p50) * 100) / 100 : null };
      }),
    [rows],
  );
  type Calc = (typeof withCalc)[number];
  const dept = budget[0];
  const use = budgetUse(dept.amount, withCalc.filter((r) => r.department === dept.department).map((r) => ({ annualCost: r.increment })));
  const outOfRange = withCalc.filter((r) => r.check && !r.check.within && !r.justification);
  const cols: TableColumn<Calc>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: `${r.grade} · ${r.department}` }), width: 220 },
    { key: 'band', header: 'Rating', value: (r) => r.score, render: (r) => `${r.score.toFixed(2)} · ${r.band}`, width: 190 },
    { key: 'ctc', header: 'Current CTC', type: 'money', value: (r) => r.ctc, total: 'sum', width: 140 },
    { key: 'compa', header: 'Compa-ratio', type: 'number', value: (r) => r.compa, render: (r) => r.compa.toFixed(2), width: 120 },
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
    { key: 'range', header: 'Suggested', value: (r) => r.suggested[0], render: (r) => `${r.suggested[0]}–${r.suggested[1]}%`, width: 110 },
    { key: 'proposed', header: 'Proposed %', type: 'number', value: (r) => r.proposed, editable: persona === 'mgr' ? 'number' : undefined, width: 120 },
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
  return (
    <GrowthFrame area="performance" active="Calibration & comp review" persona={persona === 'fin' ? 'fin' : persona}>
      <PageHeader
        title="Comp review · FY 2026-27 increments"
        status={<ConfidentialTag />}
        facts={`${persona === 'mgr' ? 'Your team' : 'Quality and Engineering'} · effective 1 Apr 2026 · matrix: rating band × compa-ratio`}
        actions={
          persona === 'mgr' ? (
            <>
              <Button>Export</Button>
              <Button variant="primary" icon={Send} disabled={outOfRange.length > 0}>
                Send proposals for approval
              </Button>
            </>
          ) : (
            <>
              <Button>Send back</Button>
              <Button variant="primary">Approve {rows.length} proposals</Button>
            </>
          )
        }
      />
      {outOfRange.length > 0 && (
        <InlineAlert tone="warning" title={`${outOfRange.length} proposals are outside the suggested range`} actions={<Button size="sm" onClick={() => setJustify(outOfRange[0].id)}>Add justification</Button>}>
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
      {state === 'loading' ? (
        <Skeleton height={360} />
      ) : (
        <SplitLayout
          main={
            <DataTable
              label="Comp proposals"
              columns={cols}
              rows={withCalc}
              getRowId={(r) => r.id}
              onCellEdit={(r, key, v) => key === 'proposed' && setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, proposed: v as number | null, justification: undefined } : x)))}
              onRowClick={(r) => r.check && !r.check.within && setJustify(r.id)}
              empty={<EmptyState title="No one to review" description="People appear here once ratings are released." />}
            />
          }
          side={
            <>
              <Card title="Budget">
                <Meter label={`${dept.department} increment budget`} value={use.used} max={dept.amount} valueText={`${formatINR(use.used)} of ${formatINR(dept.amount)} (${use.pct}%)`} />
                <Text size="sm" tone={use.over ? 'danger' : 'secondary'}>
                  {use.over ? `Over budget by ${formatINR(-use.remaining)}. Lower proposals or ask Finance for more.` : `${formatINR(use.remaining)} left, annualised.`}
                </Text>
              </Card>
              <Card title="Pay equity" actions={<Badge tone="info">Advisory</Badge>}>
                <Text size="sm" tone="secondary">
                  {persona === 'mgr' ? 'Gap for your team after your proposals.' : 'Gender pay gap, median, before and after these proposals.'}
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
          onOpenChange={(o) => !o && setJustify(null)}
          title={`Justify ${current.proposed}% for ${current.name}`}
          subtitle={`Suggested ${current.suggested[0]}–${current.suggested[1]}% for ${current.band} at compa-ratio ${current.compa.toFixed(2)}`}
          footer={
            <div className="yx-growth-foot">
              <Button onClick={() => setJustify(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={text.trim().length < 20}
                onClick={() => {
                  setRows((xs) => xs.map((x) => (x.id === current.id ? { ...x, justification: text } : x)));
                  setJustify(null);
                  setText('');
                }}
              >
                Save justification
              </Button>
            </div>
          }
        >
          <div className="yx-growth-stack">
            <PersonLabel name={current.name} secondary={`${current.grade} · current ${formatINR(current.ctc)}`} />
            <FormField label="Justification" required helper="Finance sees this with the extra approval request.">
              <TextArea value={text} onChange={setText} rows={4} />
            </FormField>
            <div className="yx-growth-effect">
              <span className="yx-growth-effect__title">Effect</span>
              <ul>
                <li>
                  New CTC {formatINR(current.newCtc)} (+{formatINR(current.increment)} a year{current.factor < 1 ? `, prorated ${Math.round(current.factor * 12)}/12` : ''})
                </li>
                <li>Adds an approval step: Finance</li>
                <li>On approval, a dated compensation change and an increment letter are created</li>
              </ul>
            </div>
          </div>
        </Drawer>
      )}
    </GrowthFrame>
  );
}
