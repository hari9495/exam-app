// PAY-59 · My flexible benefits and PAY-60 · Flexible benefit settlement (B8/E5, founder answers 2406, 2407, 2455,
// 2459, 2460): designed first, then live. The person's own ledger per component (given each month, carried in, claimed,
// waiting, left) and how the year was settled; payroll's settlement of what was not claimed: everyone in the March pay
// month (never before it), leavers at exit (it starts by itself when F&F is handed to payroll; a component with claims
// still waiting is settled here once they are decided). One implementation per screen: the web page passes `live`;
// stories get sample data.
import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dateText } from '../time/live/kit';
import { PayPageState, rupees, sumMoney, type PayLiveState } from './consultants';
import { monthText } from './live/periods';
import { FactRow, MyPayFrame, PayFrame, SectionTitle } from './pay-kit';
import type { LoadState } from './live/types';

/* ------------------------------------------------------------------ data (the API's shapes) */

export interface FlexSettlementView {
  kind: 'year_end' | 'exit';
  /** YYYY-MM */
  payMonth: string;
  paidTaxable: string;
  carriedOut: string;
  lapsed: string;
}

/** One component of one person's ledger for a tax year (GET /benefits/flex/me, GET /benefits/flex/ledger/:id). */
export interface FlexLedgerRowView {
  componentId: string;
  code: string;
  name: string;
  monthly: string;
  taxableIfUnclaimed: boolean;
  months: number;
  entitled: string;
  carriedIn: string;
  claimed: string;
  pending: string;
  available: string;
  settlement: FlexSettlementView | null;
}

export interface FlexLedgerView {
  taxYear: string;
  /** The company setting benefits.fbp.unclaimed: what happens in March to what is left. */
  unclaimed: 'pay' | 'carry';
  rows: FlexLedgerRowView[];
}

export interface FlexSettlementPerson {
  employeeId: string;
  name: string;
  employeeCode: string | null;
  /** The leaver's last day in the year (exit date, else the F&F last day); null for everyone else. */
  leavesOn: string | null;
  available: string;
  pending: string;
  settled: 'year_end' | 'exit' | null;
}

/** GET /benefits/flex/settlements?taxYear= */
export interface FlexOverview {
  taxYear: string;
  /** The March pay month (YYYY-MM) the year-end settlement opens with. */
  opensIn: string;
  open: boolean;
  unclaimed: 'pay' | 'carry';
  people: FlexSettlementPerson[];
}

export interface FlexSettleResult {
  settled: { employeeId: string; component: string; paidTaxable: string; carriedOut: string; lapsed: string }[];
}

/* ------------------------------------------------------------------ shared parts */

const fy = (taxYear: string) => `FY ${taxYear}`;
const settledText = (s: FlexSettlementView) => {
  const how = Number(s.paidTaxable) > 0 ? `paid ${rupees(s.paidTaxable)} as salary` : Number(s.carriedOut) > 0 ? `carried ${rupees(s.carriedOut)} forward` : Number(s.lapsed) > 0 ? `${rupees(s.lapsed)} lapsed` : 'nothing left';
  return `${s.kind === 'exit' ? 'Settled at exit' : 'Settled'} in ${monthText(s.payMonth)}: ${how}`;
};
const ROW_STATE = (r: FlexLedgerRowView): { label: string; tone: BadgeTone } =>
  r.settlement ? { label: r.settlement.kind === 'exit' ? 'Settled at exit' : 'Settled', tone: 'success' } : Number(r.pending) > 0 ? { label: 'Claims waiting', tone: 'warning' } : { label: 'Open', tone: 'info' };

/** The ledger table, the same on the person's page and in payroll's drawer. */
export function FlexLedgerTable({ ledger, label }: { ledger: FlexLedgerView; label: string }) {
  const cols: TableColumn<FlexLedgerRowView>[] = [
    { key: 'name', header: 'Component', value: (r) => r.name, width: 170 },
    { key: 'monthly', header: 'A month', type: 'money', value: (r) => Number(r.monthly), render: (r) => rupees(r.monthly), width: 100, optional: true },
    { key: 'entitled', header: 'Given so far', type: 'money', value: (r) => Number(r.entitled), render: (r) => <span title={`${r.months} months`}>{rupees(r.entitled)}</span>, width: 120 },
    { key: 'carried', header: 'Carried in', type: 'money', value: (r) => Number(r.carriedIn), render: (r) => rupees(r.carriedIn), width: 110, optional: true },
    { key: 'claimed', header: 'Claimed', type: 'money', value: (r) => Number(r.claimed), render: (r) => rupees(r.claimed), width: 100 },
    { key: 'pending', header: 'Waiting', type: 'money', value: (r) => Number(r.pending), render: (r) => rupees(r.pending), width: 100 },
    { key: 'available', header: 'Left', type: 'money', value: (r) => Number(r.available), render: (r) => <strong>{rupees(r.available)}</strong>, width: 100 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => ROW_STATE(r).label, render: (r) => <span title={r.settlement ? settledText(r.settlement) : undefined}><Badge tone={ROW_STATE(r).tone}>{ROW_STATE(r).label}</Badge></span>, width: 150 },
  ];
  return (
    <div className="yx-pay-stack">
      <FactRow
        items={[
          { label: 'Given so far', value: rupees(sumMoney(ledger.rows.map((r) => r.entitled))) },
          { label: 'Claimed', value: rupees(sumMoney(ledger.rows.map((r) => r.claimed))) },
          { label: 'Waiting for approval', value: rupees(sumMoney(ledger.rows.map((r) => r.pending))) },
          { label: 'Left to claim', value: rupees(sumMoney(ledger.rows.map((r) => r.available))) },
        ]}
      />
      <DataTable label={label} columns={cols} rows={ledger.rows} getRowId={(r) => r.componentId} cardSummary />
      <p className="yx-pay-note">
        What is left in March is {ledger.unclaimed === 'carry' ? 'carried into next year' : 'paid as taxable salary (a benefit that is not taxable lapses)'}. If you leave, it is settled with your final settlement.
      </p>
    </div>
  );
}

/* ================================================================== PAY-59 · My flexible benefits */

export interface LiveMyFlexBenefits {
  state: LoadState;
  onRetry?: () => void;
  data: FlexLedgerView | null;
  /** The tax years to pick from, this year first (e.g. ['2026-27', '2025-26']). */
  years: string[];
  year: string;
  onYear: (taxYear: string) => void;
  /** Opens My expenses to make a claim. */
  onClaim: () => void;
}

const SAMPLE_LEDGER: FlexLedgerView = {
  taxYear: '2026-27',
  unclaimed: 'pay',
  rows: [
    { componentId: 'c1', code: 'phone', name: 'Phone and internet', monthly: '1500.00', taxableIfUnclaimed: true, months: 8, entitled: '12000.00', carriedIn: '0.00', claimed: '7200.00', pending: '900.00', available: '3900.00', settlement: null },
    { componentId: 'c2', code: 'books', name: 'Books and periodicals', monthly: '1000.00', taxableIfUnclaimed: false, months: 8, entitled: '8000.00', carriedIn: '0.00', claimed: '2450.00', pending: '0.00', available: '5550.00', settlement: null },
    { componentId: 'c3', code: 'fuel', name: 'Fuel', monthly: '2500.00', taxableIfUnclaimed: true, months: 8, entitled: '20000.00', carriedIn: '0.00', claimed: '20000.00', pending: '0.00', available: '0.00', settlement: null },
  ],
};
const SAMPLE_SETTLED: FlexLedgerView = {
  taxYear: '2025-26',
  unclaimed: 'pay',
  rows: SAMPLE_LEDGER.rows.map((r) => ({ ...r, months: 12, entitled: (Number(r.monthly) * 12).toFixed(2), claimed: (Number(r.monthly) * 10).toFixed(2), pending: '0.00', available: '0.00', settlement: { kind: 'year_end', payMonth: '2026-03', paidTaxable: r.taxableIfUnclaimed ? (Number(r.monthly) * 2).toFixed(2) : '0.00', carriedOut: '0.00', lapsed: r.taxableIfUnclaimed ? '0.00' : (Number(r.monthly) * 2).toFixed(2) } })),
};

export function MyFlexBenefitsScreen({ live, state = 'ready' }: { live?: LiveMyFlexBenefits; state?: PayLiveState }) {
  const [shown, setShown] = useState(state);
  const [year, setYear] = useState('2026-27');
  const sample: LiveMyFlexBenefits = { state: shown === 'empty' ? 'ready' : shown, onRetry: () => setShown('ready'), data: shown === 'empty' ? { ...SAMPLE_LEDGER, rows: [] } : year === '2026-27' ? SAMPLE_LEDGER : SAMPLE_SETTLED, years: ['2026-27', '2025-26'], year, onYear: setYear, onClaim: () => undefined };
  const v = live ?? sample;
  return (
    <MyPayFrame page="fbp">
      <PageHeader
        title="Flexible benefits"
        description="What your company gives you each month for each benefit, what you claimed, and what is left to claim."
        actions={
          <Button variant="primary" icon={Receipt} onClick={v.onClaim}>
            Make a claim
          </Button>
        }
      />
      <div className="yx-pay-stack">
        <Segment label="Tax year" options={v.years.map((y, i) => ({ value: y, label: i === 0 ? `This year (${fy(y)})` : fy(y) }))} value={v.year} onChange={v.onYear} />
        <PayPageState state={v.state} onRetry={v.onRetry} what="your flexible benefits" grantedBy="HR">
          {!v.data?.rows.length ? (
            <EmptyState title="No flexible benefits" description="Your company has no flexible benefit plan for this year, or you were not employed in it. Ask HR if you expected one." />
          ) : (
            <section className="yx-pay-panel" aria-label={`Flexible benefits ${fy(v.data.taxYear)}`}>
              <FlexLedgerTable ledger={v.data} label="Your flexible benefits" />
              <p className="yx-pay-note">Claim a bill under the benefit’s expense category in My expenses. A claim above what is left is not accepted.</p>
            </section>
          )}
        </PayPageState>
      </div>
    </MyPayFrame>
  );
}

/* ================================================================== PAY-60 · Flexible benefit settlement (payroll) */

export interface LiveFlexSettlement {
  state: LoadState;
  onRetry?: () => void;
  data: FlexOverview | null;
  years: string[];
  year: string;
  onYear: (taxYear: string) => void;
  /** POST /benefits/flex/settlements { kind: 'year_end', taxYear }. */
  onSettleYear: () => Promise<FlexSettleResult>;
  /** POST /benefits/flex/settlements { kind: 'exit', taxYear, employeeId }. */
  onSettleExit: (employeeId: string) => Promise<FlexSettleResult>;
  /** GET /benefits/flex/ledger/:id?taxYear= */
  onLedger: (employeeId: string) => Promise<FlexLedgerView>;
}

type View = 'year' | 'leavers';

const SAMPLE_PEOPLE: FlexSettlementPerson[] = [
  { employeeId: 'e1', name: 'Aditi Rao', employeeCode: 'KF-0012', leavesOn: null, available: '9450.00', pending: '0.00', settled: null },
  { employeeId: 'e2', name: 'Arjun Mehta', employeeCode: 'KF-0031', leavesOn: null, available: '3900.00', pending: '900.00', settled: null },
  { employeeId: 'e3', name: 'Divya Nair', employeeCode: 'KF-0044', leavesOn: null, available: '0.00', pending: '0.00', settled: null },
  { employeeId: 'e4', name: 'Karthik Iyer', employeeCode: 'KF-0058', leavesOn: '2026-09-30', available: '0.00', pending: '0.00', settled: 'exit' },
  { employeeId: 'e5', name: 'Meera Pillai', employeeCode: 'KF-0063', leavesOn: '2026-11-14', available: '2400.00', pending: '1200.00', settled: null },
];
const SAMPLE_OVERVIEW: FlexOverview = { taxYear: '2026-27', opensIn: '2027-03', open: false, unclaimed: 'pay', people: SAMPLE_PEOPLE };

const PERSON_STATE = (p: FlexSettlementPerson): { label: string; tone: BadgeTone } =>
  p.settled === 'exit' ? { label: 'Settled at exit', tone: 'success' } : p.settled ? { label: 'Settled', tone: 'success' } : Number(p.pending) > 0 ? { label: 'Claims waiting', tone: 'warning' } : { label: 'To settle', tone: 'info' };

export function FlexSettlementScreen({ live, state = 'ready', view: startView = 'year', open: startOpen }: { live?: LiveFlexSettlement; state?: PayLiveState; /** Story only: which tab shows. */ view?: View; /** Story only: March has come (the button works). */ open?: boolean }) {
  const [shown, setShown] = useState(state);
  const [year, setYear] = useState('2026-27');
  const sample: LiveFlexSettlement = {
    state: shown === 'empty' ? 'ready' : shown,
    onRetry: () => setShown('ready'),
    data: shown === 'empty' ? { ...SAMPLE_OVERVIEW, people: [] } : { ...SAMPLE_OVERVIEW, taxYear: year, open: startOpen ?? false },
    years: ['2026-27', '2025-26'],
    year,
    onYear: setYear,
    onSettleYear: async () => ({ settled: [{ employeeId: 'e1', component: 'phone', paidTaxable: '9450.00', carriedOut: '0.00', lapsed: '0.00' }] }),
    onSettleExit: async (id) => ({ settled: [{ employeeId: id, component: 'phone', paidTaxable: '2400.00', carriedOut: '0.00', lapsed: '0.00' }] }),
    onLedger: async () => SAMPLE_LEDGER,
  };
  const v = live ?? sample;
  const { toast } = useToast();
  const [view, setView] = useState<View>(startView);
  const [confirm, setConfirm] = useState<{ kind: 'year' } | { kind: 'exit'; person: FlexSettlementPerson } | null>(null);
  const [ledgerOf, setLedgerOf] = useState<{ person: FlexSettlementPerson; ledger: FlexLedgerView | null; failed: boolean } | null>(null);
  const d = v.data;
  const staying = d?.people.filter((p) => !p.leavesOn) ?? [];
  const leavers = d?.people.filter((p) => p.leavesOn) ?? [];
  const toSettle = staying.filter((p) => !p.settled);
  const openLedger = (person: FlexSettlementPerson) => {
    setLedgerOf({ person, ledger: null, failed: false });
    v.onLedger(person.employeeId).then(
      (ledger) => setLedgerOf((x) => (x?.person.employeeId === person.employeeId ? { ...x, ledger } : x)),
      () => setLedgerOf((x) => (x?.person.employeeId === person.employeeId ? { ...x, failed: true } : x)),
    );
  };
  const done = (r: FlexSettleResult, who: string) => {
    const paid = sumMoney(r.settled.map((s) => s.paidTaxable));
    toast({ title: r.settled.length ? `${who}: ${r.settled.length} ${r.settled.length === 1 ? 'benefit' : 'benefits'} settled` : `${who}: nothing left to settle`, description: Number(paid) > 0 ? `${rupees(paid)} goes to payroll as taxable one-time pay.` : undefined, tone: 'success' });
  };
  const cols = (leaving: boolean): TableColumn<FlexSettlementPerson>[] => [
    { key: 'who', header: 'Person', type: 'person', value: (p) => p.name, person: (p) => ({ name: p.name, secondary: p.employeeCode ?? undefined }), width: 220 },
    ...(leaving ? [{ key: 'leaves', header: 'Last day', value: (p: FlexSettlementPerson) => p.leavesOn ?? '', render: (p: FlexSettlementPerson) => (p.leavesOn ? dateText(p.leavesOn) : ''), width: 120 }] : []),
    { key: 'available', header: 'Left', type: 'money', value: (p) => Number(p.available), render: (p) => rupees(p.available), width: 120 },
    { key: 'pending', header: 'Claims waiting', type: 'money', value: (p) => Number(p.pending), render: (p) => rupees(p.pending), width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (p) => PERSON_STATE(p).label, render: (p) => <Badge tone={PERSON_STATE(p).tone}>{PERSON_STATE(p).label}</Badge>, width: 140 },
  ];
  return (
    <PayFrame page="fbp">
      <PageHeader title="Flexible benefits" description="Settle what people did not claim: everyone in March, leavers at exit (it starts by itself at the F&F hand-off)." />
      <div className="yx-pay-stack">
        <div className="yx-pay-row">
          <Segment<View> label="Settle" options={[{ value: 'year', label: 'Year end (March)' }, { value: 'leavers', label: `Leavers (${leavers.length})` }]} value={view} onChange={setView} />
          <Segment label="Tax year" options={v.years.map((y) => ({ value: y, label: fy(y) }))} value={v.year} onChange={v.onYear} />
        </div>
        <PayPageState state={v.state} onRetry={v.onRetry} what="flexible benefit settlement">
          {!d || !d.people.length ? (
            <EmptyState title="No one to settle" description="No one in your legal entities has a flexible benefit balance for this year. Components are set up in Settings › Benefits & FBP." />
          ) : view === 'year' ? (
            <section className="yx-pay-panel" aria-label="Year-end settlement">
              <SectionTitle
                actions={
                  <Button variant="primary" onClick={() => setConfirm({ kind: 'year' })}>
                    Settle the year
                  </Button>
                }
              >
                Year end, {monthText(d.opensIn)} pay month
              </SectionTitle>
              {!d.open && <InlineAlert title={`Opens with the ${monthText(d.opensIn)} pay month`}>Until then people can still claim. Leavers are settled at exit.</InlineAlert>}
              <FactRow
                items={[
                  { label: 'People', value: String(staying.length) },
                  { label: 'Left to settle', value: rupees(sumMoney(toSettle.map((p) => p.available))) },
                  { label: 'Claims waiting', value: String(toSettle.filter((p) => Number(p.pending) > 0).length) },
                  { label: 'What is left', value: d.unclaimed === 'carry' ? 'Carried into next year' : 'Paid as taxable salary' },
                ]}
              />
              <DataTable label="Year-end settlement" columns={cols(false)} rows={staying} getRowId={(p) => p.employeeId} cardSummary onRowClick={openLedger} />
            </section>
          ) : (
            <section className="yx-pay-panel" aria-label="Leavers">
              <SectionTitle>Leavers in {fy(d.taxYear)}</SectionTitle>
              {!leavers.length ? (
                <EmptyState compact title="No leavers this year" description="A leaver shows here once their F&F is handed to payroll." />
              ) : (
                <DataTable
                  label="Leavers"
                  columns={cols(true)}
                  rows={leavers}
                  getRowId={(p) => p.employeeId}
                  cardSummary
                  onRowClick={openLedger}
                  rowButtons={(p) =>
                    p.settled ? undefined : (
                      <Button size="sm" onClick={() => setConfirm({ kind: 'exit', person: p })}>
                        Settle
                      </Button>
                    )
                  }
                />
              )}
            </section>
          )}
        </PayPageState>
      </div>
      {confirm?.kind === 'year' && d && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={`Settle ${fy(d.taxYear)} for ${toSettle.length} ${toSettle.length === 1 ? 'person' : 'people'}?`}
          consequence={`What is left (${rupees(sumMoney(toSettle.map((p) => p.available)))}) is ${d.unclaimed === 'carry' ? 'carried into next year' : 'paid as taxable salary in the March run, or lapses for a benefit that is not taxable'}. Claims still waiting must be decided first. This can’t be undone.`}
          confirmLabel="Settle the year"
          onConfirm={async () => done(await v.onSettleYear(), fy(d.taxYear))}
        />
      )}
      {confirm?.kind === 'exit' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={`Settle ${confirm.person.name}’s flexible benefits?`}
          consequence={`${rupees(confirm.person.available)} left is paid with the final settlement as taxable salary, or lapses for a benefit that is not taxable. Claims still waiting must be decided first. This can’t be undone.`}
          confirmLabel="Settle"
          onConfirm={async () => done(await v.onSettleExit(confirm.person.employeeId), confirm.person.name)}
        />
      )}
      {ledgerOf && (
        <Drawer open onOpenChange={(o) => !o && setLedgerOf(null)} title={`${ledgerOf.person.name}: flexible benefits`} subtitle={d ? fy(d.taxYear) : undefined} size="lg">
          {ledgerOf.failed ? (
            <InlineAlert tone="danger" title="We couldn't load this ledger.">Close the drawer and try again.</InlineAlert>
          ) : ledgerOf.ledger ? (
            <FlexLedgerTable ledger={ledgerOf.ledger} label={`${ledgerOf.person.name}'s flexible benefits`} />
          ) : (
            <p className="yx-pay-note" role="status">
              Loading…
            </p>
          )}
        </Drawer>
      )}
    </PayFrame>
  );
}
