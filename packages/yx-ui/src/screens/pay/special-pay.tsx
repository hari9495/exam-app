// Special pay types and marketplace: PAY-31 piece-rate, PAY-32 incentive / commission plan builder, PAY-34 tips pool,
// PAY-35 on-call & standby rules, PAY-36 union check-off, PAY-43 group health (licensed partner only).
import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { Button, IconButton, Link } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { ErrorSummary, FieldRow, FormField, FormSection } from '../../components/field';
import { CurrencyField, NumberField, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { FileUpload } from '../../components/upload';
import { useNarrow } from '../../components/stepper';
import { MenuItem } from '../../components/menu';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, DescriptionList } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate, formatINR, formatTime } from '../../lib/format';
import { FactRow, PartnerLink, PayFrame, PaySettingsFrame, SectionTitle, StateBlock, type ViewState } from './pay-kit';
import { BulkUploadDrawer } from './payroll-inputs';
import { DEPARTMENT_HEADS, EMPLOYEES, ENTITIES, PAY_CALENDAR, PAYROLL_ADMIN, TODAY } from '../_kit/data';
import { Segment } from '../people/people-kit';
import { DueBadge } from '../time/time-kit';
import { d, ON_CALL_RULES, SALES_COMMISSION_PLAN } from './pay-data';
import { commission, onCallPay, pieceRatePay, splitPool, type CommissionTier } from './pay-logic';

const tableState = (s: ViewState) => (s === 'loading' ? 'loading' : s === 'error' ? 'error' : 'ready');
const storyHref = (id: string) => `/?path=/story/${id}`;
const STORY = {
  incentiveStatement: 'screens-pay-pay-33-·-my-incentive-statement--default',
  standby: 'screens-time-tim-38-·-standby-and-call-out--manager',
};
const startOfToday = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

/** Saves a text file in the browser. */
function saveFile(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ================================================================== PAY-31 Piece-rate */

export interface RateCard {
  id: string;
  operation: string;
  rate: number;
  unit: string;
  from: Date | null;
}
export const RATE_CARDS: RateCard[] = [
  { id: 'r1', operation: 'Packing, 1 kg pouch', rate: 42, unit: 'per 100 pouches', from: d(1, 3) },
  { id: 'r2', operation: 'Packing, 5 kg bag', rate: 18, unit: 'per 10 bags', from: d(1, 3) },
  { id: 'r3', operation: 'Carton sealing', rate: 1.5, unit: 'per carton', from: d(1, 6) },
  { id: 'r4', operation: 'Labelling', rate: 12, unit: 'per 100 labels', from: d(1, 3) },
];
/** Plant workers for piece-rate and check-off: Hosur plant, Operations, without the department head. */
const PLANT_WORKERS = EMPLOYEES.filter((e) => e.department === 'Operations' && e.location === 'Hosur plant' && e.name !== DEPARTMENT_HEADS.Operations.name);
/** Piece-rate output was imported before the September cut-off. */
const OUTPUT_IMPORTED = d(24);

export interface PieceWorker {
  id: string;
  name: string;
  code: string;
  days: number;
  outputs: { qty: number; rate: number }[];
}
export const PIECE_WORKERS: PieceWorker[] = PLANT_WORKERS.slice(0, 10)
  .map((e, i) => ({ id: e.id, name: e.name, code: e.code, days: 26 - (i % 3), outputs: [{ qty: 180 + i * 17, rate: 42 }, { qty: 120 + i * 9, rate: 18 }, { qty: i === 2 ? 60 : 900 + i * 40, rate: 1.5 }] }));

/** PAY-31 · Piece-rate cards and output import with minimum-wage top-up check. */
export function PieceRateScreen({ tab = 'check', upload, state = 'ready' }: { tab?: 'cards' | 'output' | 'check'; upload?: boolean; state?: ViewState }) {
  const [showUpload, setShowUpload] = useState(!!upload);
  const [sent, setSent] = useState(false);
  const [cards, setCards] = useState<RateCard[]>(RATE_CARDS);
  const [editingCard, setEditingCard] = useState<RateCard | null>(null);
  const [workers, setWorkers] = useState<PieceWorker[]>(PIECE_WORKERS);
  const [imported, setImported] = useState<string | null>(null);
  const ready = state === 'ready';
  const cardBlocked = !editingCard ? null : !editingCard.operation.trim() ? 'Enter the operation.' : !(editingCard.rate > 0) ? 'Enter a rate above zero.' : !editingCard.unit.trim() ? 'Enter the unit.' : !editingCard.from ? 'Enter the valid-from date.' : null;
  const saveCard = () => {
    if (!editingCard || cardBlocked) return;
    setCards((cs) => (cs.some((c) => c.id === editingCard.id) ? cs.map((c) => (c.id === editingCard.id ? editingCard : c)) : [...cs, editingCard]));
    setEditingCard(null);
  };
  const lock = formatDate(PAY_CALENDAR.lock);
  const worker = (i: number) => `${PIECE_WORKERS[i].code} · ${PIECE_WORKERS[i].name}`;
  const dailyMinimum = 558; // Hosur zone II, unskilled, per day (P07 illustration)
  const rows = workers.map((w) => ({ ...w, ...pieceRatePay(w.outputs, dailyMinimum * w.days) }));
  const payTotal = rows.reduce((a, r) => a + r.total, 0);
  const topUpTotal = rows.reduce((a, r) => a + r.topUp, 0);
  const cols: TableColumn<(typeof rows)[number]>[] = [
    { key: 'n', header: 'Worker', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
    { key: 'days', header: 'Days worked', type: 'number', value: (r) => r.days, width: 100 },
    { key: 'earned', header: 'Piece earnings', type: 'money', value: (r) => r.earned, total: 'sum', width: 130 },
    { key: 'min', header: 'Time-rate minimum', type: 'money', value: (r) => dailyMinimum * r.days, width: 150 },
    { key: 'top', header: 'Minimum-wage top-up', type: 'money', value: (r) => r.topUp, total: 'sum', width: 170 },
    { key: 'total', header: 'Pay', type: 'money', value: (r) => r.total, total: 'sum', width: 120 },
  ];
  const exportCheck = () =>
    saveFile(
      'piece-rate-check-september-2026.csv',
      [
        'Worker,Code,Days worked,Piece earnings,Time-rate minimum,Minimum-wage top-up,Pay',
        ...rows.map((r) => [r.name, r.code, r.days, r.earned, dailyMinimum * r.days, r.topUp, r.total].join(',')),
        ['Total', `${rows.length} workers`, '', rows.reduce((a, r) => a + r.earned, 0), '', topUpTotal, payTotal].join(','),
      ].join('\n'),
    );
  const cardCols: TableColumn<RateCard>[] = [
    { key: 'op', header: 'Operation', value: (r) => r.operation, width: 220 },
    { key: 'rate', header: 'Rate', type: 'money', value: (r) => r.rate, render: (r) => `${formatINR(r.rate)} ${r.unit}`, width: 200 },
    { key: 'from', header: 'Valid from', type: 'date', value: (r) => r.from, width: 140 },
  ];
  return (
    <PayFrame page="compensation">
      <PageHeader
        title="Piece-rate pay"
        description={`Hosur plant, packing line · September 2026. Output imported ${formatDate(OUTPUT_IMPORTED)}, before the ${lock} cut-off.`}
        actions={
          <>
            {sent ? (
              <span className="yx-pay-muted">September output is locked.</span>
            ) : (
              <Button icon={Upload} onClick={() => setShowUpload(true)} disabled={!ready}>
                Import output
              </Button>
            )}
            <ConfirmDialog
              trigger={
                <Button variant="primary" disabled={sent || !ready}>
                  {sent ? 'Sent to September run' : 'Send to September run'}
                </Button>
              }
              title="Send piece-rate pay to the September run?"
              consequence={`${rows.length} workers, ${formatINR(payTotal)} in all, including ${formatINR(topUpTotal)} minimum-wage top-up. The ${lock} cut-off has passed, so this goes in as a late input for ${PAYROLL_ADMIN.name} to accept before approval. September output is locked after this.`}
              confirmLabel="Send to September run"
              onConfirm={() => setSent(true)}
            />
          </>
        }
      />
      {imported && !sent && <InlineAlert tone="success" title={imported} />}
      {sent && (
        <InlineAlert tone="success" title="Sent to the September run">
          {formatINR(payTotal)} for {rows.length} workers is in the run as piece-rate pay and minimum-wage top-up lines. September output is locked.
        </InlineAlert>
      )}
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Piece-rate">
          <TabsTrigger value="cards" count={ready ? cards.length : undefined}>
            Rate cards
          </TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="check">Earnings check</TabsTrigger>
        </TabsList>
        <TabsContent value="cards">
          <div className="yx-pay-stack">
            {ready && (
              <div className="yx-pay-row">
                <Button icon={Plus} onClick={() => setEditingCard({ id: `r${Date.now()}`, operation: '', rate: 0, unit: '', from: null })}>
                  Add rate card
                </Button>
              </div>
            )}
            <DataTable
              label="Rate cards"
              columns={cardCols}
              rows={cards}
              getRowId={(r) => r.id}
              state={tableState(state)}
              errorTitle="Couldn't load the rate cards."
              rowButtons={(r) => (
                <Button size="sm" onClick={() => setEditingCard(r)}>
                  Edit
                </Button>
              )}
            />
          </div>
        </TabsContent>
        <TabsContent value="output">
          <div className="yx-pay-stack">
            {ready && <p className="yx-pay-muted">Imported {formatDate(OUTPUT_IMPORTED)} from the Piece-rate output file.</p>}
            <DataTable
              label="Output this period"
              columns={[
                { key: 'n', header: 'Worker', type: 'person', value: (r: PieceWorker) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
                { key: 'p1', header: '1 kg pouches (×100)', type: 'number', value: (r) => r.outputs[0].qty, total: 'sum', width: 150 },
                { key: 'p5', header: '5 kg bags (×10)', type: 'number', value: (r) => r.outputs[1].qty, total: 'sum', width: 140 },
                { key: 'ct', header: 'Cartons sealed', type: 'number', value: (r) => r.outputs[2].qty, total: 'sum', width: 140 },
              ]}
              rows={workers}
              getRowId={(r) => r.id}
              state={tableState(state)}
            />
          </div>
        </TabsContent>
        <TabsContent value="check">
          <div className="yx-pay-stack">
            <InlineAlert tone="info">Where piece earnings are below the time-rate minimum wage for days worked, a named minimum-wage top-up line is added. Daily minimum {formatINR(dailyMinimum)} (Hosur, zone II, unskilled).</InlineAlert>
            <DataTable label="Piece-rate earnings check" columns={cols} rows={rows} getRowId={(r) => r.id} state={tableState(state)} errorTitle="Couldn't load the earnings check." onExport={exportCheck} />
          </div>
        </TabsContent>
      </Tabs>
      <Drawer
        open={!!editingCard}
        onOpenChange={(o) => !o && setEditingCard(null)}
        title={editingCard && cards.some((c) => c.id === editingCard.id) ? `Edit ${editingCard.operation}` : 'Add rate card'}
        footer={
          <>
            {cardBlocked && <span className="yx-pay-muted">{cardBlocked}</span>}
            <Button onClick={() => setEditingCard(null)}>Cancel</Button>
            <Button variant="primary" disabled={!!cardBlocked} onClick={saveCard}>
              Save rate card
            </Button>
          </>
        }
      >
        {editingCard && (
          <div className="yx-pay-stack">
            <FormField label="Operation" required>
              <TextField value={editingCard.operation} onChange={(v) => setEditingCard({ ...editingCard, operation: v })} />
            </FormField>
            <FieldRow>
              <FormField label="Rate" required>
                <CurrencyField allowPaise value={editingCard.rate || null} onChange={(v) => setEditingCard({ ...editingCard, rate: v ?? 0 })} />
              </FormField>
              <FormField label="Unit" required helper="For example, per 100 pouches.">
                <TextField value={editingCard.unit} onChange={(v) => setEditingCard({ ...editingCard, unit: v })} />
              </FormField>
            </FieldRow>
            <FormField label="Valid from" required>
              <DatePicker value={editingCard.from} onChange={(v) => setEditingCard({ ...editingCard, from: v })} />
            </FormField>
          </div>
        )}
      </Drawer>
      <BulkUploadDrawer
        open={showUpload}
        onOpenChange={setShowUpload}
        title="Import output for September"
        template="Piece-rate output"
        columns={['Employee ID', 'Employee name', 'Date', 'Operation', 'Quantity']}
        onImport={() => {
          // Rows 2 and 3 are 1 kg pouch packing (in hundreds) for the first two workers; rows 4 and 5 have errors.
          const add: Record<string, number> = { [PIECE_WORKERS[0].id]: 18, [PIECE_WORKERS[1].id]: 21 };
          setWorkers((ws) => ws.map((w) => (add[w.id] ? { ...w, outputs: w.outputs.map((o, i) => (i === 0 ? { ...o, qty: o.qty + add[w.id] } : o)) } : w)));
          setShowUpload(false);
          setImported('2 output rows imported into 1 kg pouches · 2 rows skipped with errors');
        }}
        results={
          upload
            ? [
                { row: 2, employee: worker(0), value: '2 Sep · Packing 1 kg · 18' },
                { row: 3, employee: worker(1), value: '3 Sep · Packing 1 kg · 21' },
                { row: 4, employee: worker(3), value: '31 Sep · Labelling · 40', error: 'Date 31 Sep does not exist. Check the date.' },
                { row: 5, employee: worker(4), value: '4 Sep · Glazing · 10', error: 'No rate card for "Glazing" on 4 Sep. Add a rate card or fix the operation name.' },
              ]
            : undefined
        }
      />
    </PayFrame>
  );
}

/* ================================================================== PAY-32 Incentive / commission plan builder */

const PLAN_NAME = SALES_COMMISSION_PLAN.name;
/** First day of the next quarter after TODAY (29 Sep 2026). */
const NEXT_QUARTER = d(1, 9);
const PLAN_SOURCES = [
  { value: 'import', label: 'Monthly import (net sales per rep)' },
  { value: 'api', label: 'API from sales system' },
  { value: 'm12', label: 'Projects billing' },
];
const DEPARTMENTS = Array.from(new Set(EMPLOYEES.map((e) => e.department))).sort();
const LOCATIONS = Array.from(new Set(EMPLOYEES.map((e) => e.location))).sort();
/** Financial-year quarter: Apr–Jun is Q1. */
const fyQuarter = (dt: Date) => Math.floor(((dt.getMonth() + 9) % 12) / 3) + 1;
/** "Q1 and Q2" for the quarters from `from` to today. ponytail: assumes both dates are in the same financial year. */
const quartersSince = (from: Date) => {
  const qs: string[] = [];
  for (let q = fyQuarter(from); q <= fyQuarter(TODAY); q++) qs.push(`Q${q}`);
  return qs.length > 1 ? `${qs.slice(0, -1).join(', ')} and ${qs[qs.length - 1]}` : qs[0];
};

/** PAY-32 · Incentive / commission plan builder: targets, slabs, accelerators, caps, clawback, effective dates. */
export function IncentivePlanScreen({ variant = 'draft', state = 'ready' }: { variant?: 'draft' | 'overlap' | 'published'; state?: ViewState }) {
  const narrow = useNarrow(599);
  const [status, setStatus] = useState<'draft' | 'published'>(variant === 'published' ? 'published' : 'draft');
  const ro = status === 'published';
  const [newVersion, setNewVersion] = useState(false);
  const [effFrom, setEffFrom] = useState<Date | null>(variant === 'published' ? d(1, 3) : NEXT_QUARTER);
  const [effTo, setEffTo] = useState<Date | null>(d(31, 2, 2027));
  const [freq, setFreq] = useState<'m' | 'q'>('q');
  const [source, setSource] = useState<string>('import');
  const [dept, setDept] = useState<string>('Sales');
  const [loc, setLoc] = useState<string>('all');
  const [showPeople, setShowPeople] = useState(false);
  const [quota, setQuota] = useState<number | null>(SALES_COMMISSION_PLAN.quota);
  const [cap, setCap] = useState<number | null>(SALES_COMMISSION_PLAN.cap);
  const [clawback, setClawback] = useState<number | null>(SALES_COMMISSION_PLAN.clawbackDays);
  const [tiers, setTiers] = useState<CommissionTier[]>(
    variant === 'overlap'
      ? [
          { fromPct: 0, ratePct: 0 },
          { fromPct: 80, ratePct: 1.5 },
          { fromPct: 80, ratePct: 2.5 },
        ]
      : SALES_COMMISSION_PLAN.tiers,
  );
  const [achieved, setAchieved] = useState<number | null>(28_80_000);
  const [confirming, setConfirming] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [focusRate, setFocusRate] = useState<number | null>(null);
  useEffect(() => {
    if (focusRate != null) document.getElementById(`tier-rate-${focusRate}`)?.focus();
  }, [focusRate]);

  const period = freq === 'q' ? 'quarter' : 'month';
  const members = EMPLOYEES.filter((e) => e.department === dept && (loc === 'all' || e.location === loc));
  const tierError = (() => {
    if (tiers[0] && tiers[0].fromPct !== 0) return { i: 0, message: `Tier 1 starts at ${tiers[0].fromPct}%. The first tier must start at 0%.` };
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].fromPct <= tiers[i - 1].fromPct) return { i, message: `Tier ${i + 1} starts at ${tiers[i].fromPct}%, which is not above tier ${i} (${tiers[i - 1].fromPct}%).` };
    }
    return null;
  })();
  const dateError = !effFrom || !effTo ? 'Enter both effective dates.' : effTo <= effFrom ? 'Effective to must be after Effective from.' : null;
  const errors = [...(tierError ? [{ fieldId: `tier-${tierError.i}`, message: tierError.message }] : []), ...(dateError ? [{ fieldId: 'plan-to', message: dateError }] : [])];
  const publishBlocked = errors.length ? 'Fix the errors above to publish.' : !members.length ? 'No one is on the plan.' : quota == null ? 'Enter a quota.' : null;
  const preview = commission(achieved ?? 0, quota ?? 0, tiers, cap ?? undefined);
  const pastStart = !ro && effFrom != null && effFrom < startOfToday;
  const tierName = (t: CommissionTier, i: number) => `Tier ${i + 1}${t.fromPct >= 100 ? ' (accelerator)' : ''}`;
  const tierRange = (i: number) => (tiers[i + 1] ? `${tiers[i].fromPct}–${tiers[i + 1].fromPct}% of quota` : `${tiers[i].fromPct}% of quota and above`);
  const setTier = (i: number, patch: Partial<CommissionTier>) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addTier = () => {
    setTiers((ts) => [...ts, { fromPct: (ts[ts.length - 1]?.fromPct ?? 0) + 25, ratePct: ts[ts.length - 1]?.ratePct ?? 0 }]);
    setFocusRate(tiers.length);
  };
  const groupLabel = `${dept} · ${loc === 'all' ? 'all locations' : loc} · ${members.length} ${members.length === 1 ? 'person' : 'people'}`;
  const sourceLabel = PLAN_SOURCES.find((s) => s.value === source)?.label ?? source;
  const previewLink = (
    <Button asChild>
      <a href={storyHref(STORY.incentiveStatement)} target="_top">
        Preview statements
      </a>
    </Button>
  );

  if (state !== 'ready')
    return (
      <PayFrame page="compensation">
        <PageHeader title={PLAN_NAME} />
        <StateBlock state={state} errorTitle="Couldn't load the plan.">
          <></>
        </StateBlock>
      </PayFrame>
    );

  return (
    <PayFrame page="compensation">
      <PageHeader
        title={PLAN_NAME}
        description={`Sales commission, paid ${freq === 'q' ? 'quarterly' : 'monthly'}.`}
        status={<Badge tone={ro ? 'success' : 'warning'}>{ro ? `Published · effective ${formatDate(effFrom)}` : newVersion ? 'Draft · new version' : 'Draft'}</Badge>}
        actions={
          ro ? (
            <>
              {previewLink}
              <Button
                variant="primary"
                onClick={() => {
                  setStatus('draft');
                  setNewVersion(true);
                  setEffFrom(NEXT_QUARTER);
                }}
              >
                Edit as new version
              </Button>
            </>
          ) : (
            <>
              {previewLink}
              {publishBlocked && <span className="yx-pay-muted">{publishBlocked}</span>}
              <Button variant="primary" disabled={!!publishBlocked} onClick={() => setConfirming(true)}>
                Publish plan
              </Button>
            </>
          )
        }
      />
      {!ro && errors.length > 0 && <ErrorSummary title="Fix these before publishing" errors={errors} />}
      {ro && (
        <InlineAlert tone="info">
          This plan is in use, so it can't be changed. Changes apply from the next quarter ({formatDate(NEXT_QUARTER)}) as a new version; {effFrom && effFrom < startOfToday ? `${quartersSince(effFrom)} results stay on these tiers.` : 'earlier results stay on these tiers.'}
        </InlineAlert>
      )}
      {newVersion && !ro && <InlineAlert tone="info">New version of the published plan. Changes apply from {formatDate(effFrom)}; results before that stay on the published tiers.</InlineAlert>}
      {pastStart && effFrom && (
        <InlineAlert tone="warning" title="Starts before today" actions={<Button size="sm" onClick={() => setEffFrom(NEXT_QUARTER)}>Start from {formatDate(NEXT_QUARTER)}</Button>}>
          {quartersSince(effFrom)} commission will be recalculated with these tiers and paid as arrears in the next run.
        </InlineAlert>
      )}
      <div className="yx-pay-split">
        <div className="yx-pay-stack">
          {ro ? (
            <>
              <SectionTitle>Plan</SectionTitle>
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Effective', value: `${formatDate(effFrom)} to ${formatDate(effTo)}` },
                  { label: 'Payout frequency', value: freq === 'q' ? 'Quarterly' : 'Monthly' },
                  { label: 'Metric source', value: sourceLabel },
                  { label: 'Who is on the plan', value: groupLabel },
                  { label: `${freq === 'q' ? 'Quarterly' : 'Monthly'} quota (per person)`, value: formatINR(quota ?? 0) },
                  { label: `Cap per ${period}`, value: cap == null ? 'No cap' : formatINR(cap) },
                  { label: 'Clawback window', value: `${clawback ?? 0} days` },
                ]}
              />
              <SectionTitle>Tiers</SectionTitle>
              <DescriptionList items={tiers.map((t, i) => ({ label: tierName(t, i), value: `${t.ratePct}% on sales from ${tierRange(i)}` }))} />
            </>
          ) : (
            <>
              <FormSection title="Plan">
                <FieldRow>
                  <FormField label="Effective from" required id="plan-from">
                    <DatePicker value={effFrom} onChange={setEffFrom} />
                  </FormField>
                  <FormField label="Effective to" required id="plan-to" error={effFrom && effTo && effTo <= effFrom ? 'Effective to must be after Effective from.' : undefined}>
                    <DatePicker value={effTo} onChange={setEffTo} />
                  </FormField>
                </FieldRow>
                <FieldRow>
                  <FormField label="Payout frequency" required>
                    <Select value={freq} onChange={(v) => v && setFreq(v as 'm' | 'q')} options={[{ value: 'm', label: 'Monthly' }, { value: 'q', label: 'Quarterly' }]} />
                  </FormField>
                  <FormField label="Metric source" required>
                    <Select value={source} onChange={(v) => v && setSource(v)} options={PLAN_SOURCES} />
                  </FormField>
                </FieldRow>
                <FieldRow>
                  <FormField label="Department" required>
                    <Select value={dept} onChange={(v) => v && setDept(v)} options={DEPARTMENTS.map((x) => ({ value: x, label: x }))} />
                  </FormField>
                  <FormField label="Location" required>
                    <Select value={loc} onChange={(v) => v && setLoc(v)} options={[{ value: 'all', label: 'All locations' }, ...LOCATIONS.map((x) => ({ value: x, label: x }))]} />
                  </FormField>
                </FieldRow>
                <div className="yx-pay-row">
                  <span className="yx-pay-muted">
                    {members.length} {members.length === 1 ? 'person is' : 'people are'} on the plan.
                  </span>
                  <Button size="sm" onClick={() => setShowPeople(true)} disabled={!members.length}>
                    See people
                  </Button>
                </div>
              </FormSection>
              <FormSection title="Quota and tiers">
                <FormField label={`${freq === 'q' ? 'Quarterly' : 'Monthly'} quota (per person)`} required>
                  <CurrencyField value={quota} onChange={setQuota} />
                </FormField>
                {narrow ? (
                  <div className="yx-pay-stack">
                    {tiers.map((t, i) => (
                      <div key={i} className="yx-pay-panel" data-state={tierError?.i === i ? 'error' : undefined}>
                        <SectionTitle actions={i > 0 && <IconButton icon={Trash2} label={`Remove tier ${i + 1}`} size="sm" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} />}>{tierName(t, i)}</SectionTitle>
                        <FieldRow>
                          <FormField label="From % of quota" id={`tier-${i}`} error={tierError?.i === i ? 'Must be above the tier before' : undefined}>
                            <NumberField value={t.fromPct} onChange={(v) => setTier(i, { fromPct: v ?? 0 })} suffix="%" />
                          </FormField>
                          <FormField label="Commission" id={`tier-rate-${i}`}>
                            <NumberField value={t.ratePct} decimals onChange={(v) => setTier(i, { ratePct: v ?? 0 })} suffix="%" />
                          </FormField>
                        </FieldRow>
                      </div>
                    ))}
                  </div>
                ) : (
                  <table className="yx-pay-table">
                    <thead>
                      <tr>
                        <th scope="col">Tier</th>
                        <th scope="col">From % of quota</th>
                        <th scope="col">Commission on sales in tier</th>
                        <th scope="col">
                          <span className="yx-visually-hidden">Remove</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((t, i) => (
                        <tr key={i} data-state={tierError?.i === i ? 'error' : undefined}>
                          <th scope="row">{tierName(t, i)}</th>
                          <td>
                            <NumberField id={`tier-${i}`} size="sm" aria-label={`Tier ${i + 1} starts at`} value={t.fromPct} onChange={(v) => setTier(i, { fromPct: v ?? 0 })} suffix="%" />
                          </td>
                          <td>
                            <NumberField id={`tier-rate-${i}`} size="sm" aria-label={`Tier ${i + 1} rate`} value={t.ratePct} decimals onChange={(v) => setTier(i, { ratePct: v ?? 0 })} suffix="%" />
                          </td>
                          <td>{i > 0 && <IconButton icon={Trash2} label={`Remove tier ${i + 1}`} size="sm" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <Button size="sm" icon={Plus} onClick={addTier}>
                  Add tier
                </Button>
              </FormSection>
              <FormSection title="Cap and clawback">
                <FieldRow>
                  <FormField label={`Cap per ${period}`} optional>
                    <CurrencyField value={cap} onChange={setCap} />
                  </FormField>
                  <FormField label="Clawback window" helper="If an order is cancelled or unpaid within this window, the commission is taken back from later payslips (up to the monthly deduction limit), or from the final settlement if the person leaves.">
                    <NumberField value={clawback} onChange={setClawback} min={0} max={365} suffix="days" />
                  </FormField>
                </FieldRow>
              </FormSection>
              <div className="yx-pay-row">
                <Button onClick={() => setSavedAt(TODAY)}>Save draft</Button>
                {savedAt && <span className="yx-pay-muted">Draft saved at {formatTime(`${savedAt.getHours()}:${savedAt.getMinutes()}`)}.</span>}
              </div>
            </>
          )}
        </div>
        <aside className="yx-pay-panel" aria-label="Preview">
          <SectionTitle>Try it</SectionTitle>
          <FormField label={`Sales achieved in the ${period}`}>
            <CurrencyField value={achieved} onChange={setAchieved} />
          </FormField>
          {tierError ? (
            <>
              <FactRow
                items={[
                  { label: 'Attainment', value: `${preview.attainment}%` },
                  { label: 'Commission', value: '—' },
                ]}
              />
              <p className="yx-pay-muted">Fix the tiers to see a result.</p>
            </>
          ) : (
            <FactRow
              items={[
                { label: 'Attainment', value: `${preview.attainment}%` },
                { label: 'Commission', value: formatINR(preview.amount) },
              ]}
            />
          )}
          {!tierError && preview.capped && cap != null && <Badge tone="warning">Capped at {formatINR(cap)}</Badge>}
          <p className="yx-pay-note">Results are approved each {period}, then paid as one-time pay in the run after the {period} closes. Commission is salary for tax.</p>
        </aside>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Publish ${PLAN_NAME} for ${members.length} ${members.length === 1 ? 'person' : 'people'} from ${formatDate(effFrom)}?`}
        consequence={`${freq === 'q' ? `Q${effFrom ? fyQuarter(effFrom) : ''}` : effFrom ? effFrom.toLocaleString('en-IN', { month: 'long' }) : ''} results will be calculated with these tiers and paid as one-time pay in the run after the ${period} closes.`}
        confirmLabel="Publish plan"
        onConfirm={() => {
          setStatus('published');
          setNewVersion(false);
        }}
      />
      <Drawer open={showPeople} onOpenChange={setShowPeople} title={`On the plan · ${members.length} ${members.length === 1 ? 'person' : 'people'}`} subtitle={groupLabel}>
        <ul className="yx-pay-stack">
          {members.map((m) => (
            <li key={m.id}>
              <PersonLabel name={m.name} secondary={`${m.code} · ${m.role} · ${m.location}`} />
            </li>
          ))}
        </ul>
      </Drawer>
    </PayFrame>
  );
}

/* ================================================================== PAY-34 Tips pool */

type TipBasis = 'points' | 'shifts' | 'hours';
interface TipStaff {
  name: string;
  code: string;
  points: number;
  shifts: number;
  hours: number;
}
interface TipPool {
  id: string;
  outlet: string;
  period: string;
  collected: number;
  /** Cash tips paid directly by customers: recorded for statements only. */
  cashTips: number;
  basis: TipBasis;
  status: string;
  staff: TipStaff[];
}
/** Café staff: Operations people outside the plant, without the department head. */
const CAFE_STAFF: TipStaff[] = EMPLOYEES.filter((e) => e.department === 'Operations' && e.location !== 'Hosur plant' && e.name !== DEPARTMENT_HEADS.Operations.name)
  .slice(0, 10)
  .map((e, i) => ({ name: e.name, code: e.code, points: i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1, shifts: 22 + (i % 5), hours: (22 + (i % 5)) * 8 }));
const MG_ROAD_STAFF = CAFE_STAFF.slice(0, 3);
export const TIP_POOLS: TipPool[] = [
  { id: 't1', outlet: 'Kaveri Café, MG Road', period: 'September 2026', collected: 30_000, cashTips: 8_200, basis: 'points', status: 'Ready to send', staff: MG_ROAD_STAFF },
  { id: 't2', outlet: 'Kaveri Café, Indiranagar', period: 'September 2026', collected: 52_400, cashTips: 14_600, basis: 'hours', status: 'Collecting', staff: CAFE_STAFF.slice(3, 10) },
  { id: 't3', outlet: 'Kaveri Café, MG Road', period: 'August 2026', collected: 27_600, cashTips: 7_400, basis: 'points', status: 'Paid in run', staff: MG_ROAD_STAFF },
];

const TIP_OUTLETS = Array.from(new Set(TIP_POOLS.map((p) => p.outlet)));
const BASIS_LABEL: Record<TipBasis, string> = { points: 'Points', shifts: 'Per shift', hours: 'Hours' };
const BASIS_OPTIONS = (Object.keys(BASIS_LABEL) as TipBasis[]).map((k) => ({ value: k, label: BASIS_LABEL[k] }));

/** Pick-one basis: joined Segment on wide screens, a dropdown on phones (R11). */
function BasisChoice({ value, onChange, narrow }: { value: TipBasis; onChange: (v: TipBasis) => void; narrow: boolean }) {
  return narrow ? <Select value={value} onChange={(v) => v && onChange(v as TipBasis)} options={BASIS_OPTIONS} /> : <Segment label="Distribution basis" value={value} onChange={onChange} options={BASIS_OPTIONS} />;
}

/** PAY-34 · Tips pool: pool period, collections, distribution basis, shares, send to run. */
export function TipsPoolScreen({ openId, state = 'ready' }: { openId?: string; state?: ViewState }) {
  const narrow = useNarrow(599);
  const [pools, setPools] = useState<TipPool[]>(state === 'empty' ? [] : TIP_POOLS);
  const [openPoolId, setOpenPoolId] = useState<string | null>(openId ?? null);
  const open = pools.find((p) => p.id === openPoolId) ?? null;
  const setOpen = (p: TipPool | null) => setOpenPoolId(p?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [sentPool, setSentPool] = useState<TipPool | null>(null);
  const [draft, setDraft] = useState<{ outlet: string; period: string; basis: TipBasis }>({ outlet: TIP_OUTLETS[0], period: 'October 2026', basis: 'points' });
  const shownState: ViewState = state === 'empty' && pools.length ? 'ready' : state;
  const duplicate = pools.some((p) => p.outlet === draft.outlet && p.period === draft.period);
  const createPool = () => {
    const staff = pools.find((p) => p.outlet === draft.outlet)?.staff ?? [];
    setPools((ps) => [{ id: `t${ps.length + 1}-${Date.now()}`, outlet: draft.outlet, period: draft.period, collected: 0, cashTips: 0, basis: draft.basis, status: 'Collecting', staff }, ...ps]);
    setCreating(false);
  };
  const setBasis = (b: TipBasis) => open && setPools((ps) => ps.map((p) => (p.id === open.id ? { ...p, basis: b } : p)));
  const basis: TipBasis = open?.basis ?? 'points';
  const sendBlocked = !open
    ? null
    : open.status === 'Collecting'
      ? 'Still collecting tips. Close the pool before sending it.'
      : open.status === 'Paid in run'
        ? `Already paid in the ${open.period.split(' ')[0]} run.`
        : open.status === 'In September run'
          ? 'Already in the September run.'
          : null;
  const newPoolButton = (
    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
      New pool
    </Button>
  );
  const staff = open?.staff ?? [];
  const shares = splitPool(open?.collected ?? 0, staff.map((s) => (basis === 'points' ? s.points : basis === 'shifts' ? s.shifts : s.hours)));
  const basisLocked = !!open && (open.status === 'Paid in run' || open.status === 'In September run');
  const poolCols: TableColumn<TipPool>[] = [
    { key: 'outlet', header: 'Outlet', value: (p) => p.outlet, width: 200 },
    { key: 'period', header: 'Period', value: (p) => p.period, width: 140 },
    { key: 'collected', header: 'Collected', type: 'money', value: (p) => p.collected, width: 120 },
    { key: 'basis', header: 'Basis', value: (p) => BASIS_LABEL[p.basis], width: 100, optional: true },
    { key: 'people', header: 'People', type: 'number', value: (p) => p.staff.length, render: (p) => (narrow ? `${p.staff.length} people` : p.staff.length), width: 90, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: (p) => p.status, statusTone: (v) => (v === 'Paid in run' ? 'success' : v === 'Collecting' ? 'neutral' : 'info'), width: 150 },
  ];
  return (
    <PayFrame page="compensation" persona="hr">
      <PageHeader title="Tips and service charge" description="Pools per outlet and period. Amounts paid through payroll are a named line; tips paid directly by customers are recorded for statements only." actions={shownState === 'ready' ? newPoolButton : undefined} />
      {sentPool && (
        <InlineAlert tone="success" title={`${sentPool.outlet} tips sent to the September run`}>
          {formatINR(sentPool.collected)} is split across {sentPool.staff.length} people on the {BASIS_LABEL[sentPool.basis]} basis and paid as a named tips line.
        </InlineAlert>
      )}
      <StateBlock state={shownState} errorTitle="Couldn't load tip pools." empty={<EmptyState title="No tip pools yet." description="Create a pool for an outlet and period, then add collections." action={newPoolButton} />}>
        <DataTable
          label="Tip pools"
          columns={poolCols}
          rows={pools}
          getRowId={(p) => p.id}
          activeRowId={openPoolId}
          cardSummary
          rowButtons={(p) => (
            <Button size="sm" onClick={() => setOpen(p)}>
              Open pool
            </Button>
          )}
        />
      </StateBlock>
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? `${open.outlet} · ${open.period}` : ''}
        size="lg"
        footer={
          <>
            {sendBlocked && <span className="yx-pay-muted">{sendBlocked}</span>}
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" disabled={!!sendBlocked} onClick={() => setConfirmingSend(true)}>
              Send to September run
            </Button>
          </>
        }
      >
        {open && (
          <div className="yx-pay-stack">
            <FactRow
              items={[
                { label: 'Card and UPI tips collected', value: formatINR(open.collected) },
                { label: 'Cash tips paid directly (record only)', value: formatINR(open.cashTips) },
              ]}
            />
            <FormField label="Distribution basis" helper={basisLocked ? undefined : 'Hours come from attendance.'}>
              {basisLocked ? <p className="yx-pay-muted">{BASIS_LABEL[basis]} · can't be changed after the pool is sent.</p> : <BasisChoice value={basis} onChange={setBasis} narrow={narrow} />}
            </FormField>
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-pay-table">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col" data-num>
                    {basis === 'points' ? 'Points' : basis === 'shifts' ? 'Shifts' : 'Hours'}
                  </th>
                  <th scope="col" data-num>
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s, i) => (
                  <tr key={s.code}>
                    <th scope="row">
                      <PersonLabel name={s.name} secondary={s.code} />
                    </th>
                    <td data-num>{basis === 'points' ? s.points : basis === 'shifts' ? s.shifts : s.hours}</td>
                    <td data-num>{formatINR(shares[i])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td />
                  <td data-num>{formatINR(shares.reduce((a, s) => a + s, 0))}</td>
                </tr>
              </tfoot>
            </table>
            </div>
            <p className="yx-pay-note">Treatment in payroll (PF, ESI, tax) follows the central statutory rules for tips paid through payroll.</p>
          </div>
        )}
      </Drawer>
      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="New tip pool"
        footer={
          <>
            {duplicate && <span className="yx-pay-muted">A pool for this outlet and period already exists.</span>}
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" disabled={duplicate} onClick={createPool}>
              Create pool
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          <FormField label="Outlet" required>
            <Select value={draft.outlet} onChange={(v) => v && setDraft((x) => ({ ...x, outlet: v }))} options={TIP_OUTLETS.map((o) => ({ value: o, label: o }))} />
          </FormField>
          <FormField label="Period" required>
            <Select value={draft.period} onChange={(v) => v && setDraft((x) => ({ ...x, period: v }))} options={['September 2026', 'October 2026'].map((o) => ({ value: o, label: o }))} />
          </FormField>
          <FormField label="Distribution basis" helper="Hours come from attendance.">
            <BasisChoice value={draft.basis} onChange={(v) => setDraft((x) => ({ ...x, basis: v }))} narrow={narrow} />
          </FormField>
        </div>
      </Dialog>
      {open && (
        <ConfirmDialog
          open={confirmingSend}
          onOpenChange={setConfirmingSend}
          title={`Send ${open.outlet} tips to the September run?`}
          consequence={`${formatINR(open.collected)} split across ${open.staff.length} people on the ${BASIS_LABEL[open.basis]} basis is added as a named tips line. The basis can't be changed after this.`}
          confirmLabel="Send to September run"
          onConfirm={() => {
            setPools((ps) => ps.map((p) => (p.id === open.id ? { ...p, status: 'In September run' } : p)));
            setSentPool(open);
            setOpen(null);
          }}
        />
      )}
    </PayFrame>
  );
}

/* ================================================================== PAY-35 On-call & standby pay rules */

interface OnCallSlot {
  id: string;
  slot: string;
  standby: number;
  rate: number;
  minHours: number;
  normal: number;
  holiday: number;
}
/** Slot types set up in Time › Roster. Rates come from ON_CALL_RULES, the one source shared with TIM-38. */
export const ON_CALL_SLOTS: OnCallSlot[] = [
  { id: 'hosur-maint', slot: 'Hosur maintenance standby', standby: ON_CALL_RULES.standbyPerSlot, rate: ON_CALL_RULES.hourlyRate, minHours: ON_CALL_RULES.minimumHours, normal: ON_CALL_RULES.weekdayMultiplier, holiday: ON_CALL_RULES.holidayMultiplier },
];
const slotErrors = (s: OnCallSlot) => ({
  standby: s.standby > 0 ? undefined : 'Enter standby pay above zero.',
  rate: s.rate > 0 ? undefined : 'Enter a call-out rate above zero.',
  minHours: s.minHours > 0 ? undefined : 'Enter at least 0.5 h.',
  holiday: s.holiday >= s.normal ? undefined : `Must be at least the normal-day multiplier (${s.normal}×).`,
});
/** "Standby ₹300 → ₹350" lines for each changed rate. */
const slotChanges = (before: OnCallSlot[], after: OnCallSlot[]) =>
  after.flatMap((s) => {
    const b = before.find((x) => x.id === s.id);
    if (!b) return [];
    const parts = [
      b.standby !== s.standby && `standby ${formatINR(b.standby)} to ${formatINR(s.standby)}`,
      b.rate !== s.rate && `call-out rate ${formatINR(b.rate)}/h to ${formatINR(s.rate)}/h`,
      b.minHours !== s.minHours && `minimum ${b.minHours} h to ${s.minHours} h`,
      b.normal !== s.normal && `normal day ${b.normal}× to ${s.normal}×`,
      b.holiday !== s.holiday && `holiday ${b.holiday}× to ${s.holiday}×`,
    ].filter(Boolean);
    return parts.length ? [`${s.slot}: ${parts.join(', ')}`] : [];
  });

/** PAY-35 · On-call & standby rules: rates per slot and call-out, minimum paid hours, link to the roster slot type. */
export function OnCallRulesScreen({ variant = 'default', state = 'ready' }: { variant?: 'default' | 'holiday'; state?: ViewState }) {
  const narrow = useNarrow(599);
  const [slots, setSlots] = useState<OnCallSlot[]>(state === 'empty' ? [] : ON_CALL_SLOTS);
  const [savedSlots, setSavedSlots] = useState<OnCallSlot[]>(slots);
  const [slotId, setSlotId] = useState<string>(ON_CALL_SLOTS[0].id);
  const [actual, setActual] = useState<number | null>(1);
  const [payStandby, setPayStandby] = useState(true);
  const [countOvertime, setCountOvertime] = useState(true);
  const [appliesFrom, setAppliesFrom] = useState<Date | null>(NEXT_QUARTER);
  const [editing, setEditing] = useState<OnCallSlot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dayType, setDayType] = useState<'normal' | 'holiday'>(variant === 'holiday' ? 'holiday' : 'normal');
  const [savedFlags, setSavedFlags] = useState({ payStandby: true, countOvertime: true });
  const changes = [
    ...slotChanges(savedSlots, slots),
    ...(payStandby !== savedFlags.payStandby ? [payStandby ? 'Standby is paid even when called out' : 'Standby is not paid when called out'] : []),
    ...(countOvertime !== savedFlags.countOvertime ? [countOvertime ? 'Call-out hours count towards the 48 h weekly limit' : 'Call-out hours no longer count towards the 48 h weekly limit'] : []),
  ];
  const saveBlocked = !changes.length ? 'No changes to save.' : !appliesFrom ? 'Enter the date the rules apply from.' : null;
  const editErrors = editing ? slotErrors(editing) : null;
  const editBlocked = editErrors && Object.values(editErrors).some(Boolean) ? 'Fix the highlighted rates.' : null;
  const row = slots.find((s) => s.id === slotId) ?? slots[0];
  const calledOut = (actual ?? 0) > 0;
  const mult = row ? (dayType === 'holiday' ? row.holiday : row.normal) : 1;
  const standby = row && (payStandby || !calledOut) ? row.standby : 0;
  const ex = row ? onCallPay(standby, actual ?? 0, row.minHours, row.rate, mult) : null;
  const shownState: ViewState = state === 'empty' || (state === 'ready' && !slots.length) ? 'empty' : state;
  const cols: TableColumn<OnCallSlot>[] = [
    {
      key: 'slot',
      header: 'Roster slot type',
      value: (r) => r.slot,
      render: (r) => (
        <Link href={storyHref(STORY.standby)} target="_top">
          {r.slot}
        </Link>
      ),
      width: 220,
    },
    { key: 'standby', header: 'Standby pay', type: 'money', value: (r) => r.standby, render: (r) => `${formatINR(r.standby)} a slot`, width: 120 },
    { key: 'rate', header: 'Call-out rate', type: 'money', value: (r) => r.rate, render: (r) => `${formatINR(r.rate)}/h`, width: 120 },
    { key: 'min', header: 'Minimum', type: 'number', value: (r) => r.minHours, render: (r) => `${r.minHours} h paid`, width: 100 },
    { key: 'normal', header: 'Normal day', type: 'number', value: (r) => r.normal, render: (r) => `${r.normal}×`, width: 90 },
    { key: 'holiday', header: 'Holiday', type: 'number', value: (r) => r.holiday, render: (r) => `${r.holiday}×`, width: 90, optional: true },
  ];
  const openRoster = (
    <Button asChild>
      <a href={storyHref(STORY.standby)} target="_top">
        Open roster
      </a>
    </Button>
  );
  return (
    <PayFrame page="compensation">
      <PageHeader
        title="On-call and standby pay"
        description="Pay for people on standby and for each call-out. Slot types come from the Time roster."
        actions={
          shownState === 'ready' ? (
            <>
              <span className="yx-pay-muted">{saveBlocked ?? 'Unsaved changes.'}</span>
              <Button variant="primary" disabled={!!saveBlocked} onClick={() => setConfirming(true)}>
                Save rules
              </Button>
            </>
          ) : undefined
        }
      />
      {saved && appliesFrom && (
        <InlineAlert tone="success" title="Rules saved">
          New on-call rates apply to call-outs from {formatDate(appliesFrom)} <DueBadge date={appliesFrom} />.
        </InlineAlert>
      )}
      <StateBlock state={shownState} errorTitle="Couldn't load the on-call slot types." empty={<EmptyState title="No on-call slot types yet." description="Add them in Time › Roster first." action={openRoster} />}>
        {row && ex && (
          <div className="yx-pay-stack">
          <DataTable
            label="On-call pay per slot type"
            columns={cols}
            rows={slots}
            getRowId={(r) => r.id}
            rowActions={(r) => <MenuItem onSelect={() => setEditing(r)}>Edit rates</MenuItem>}
          />
          <div className="yx-pay-split">
            <div className="yx-pay-stack">
              <Checkbox label="Pay standby even when the person is called out" checked={payStandby} onChange={setPayStandby} />
              <Checkbox label="Count call-out hours towards the 48 h weekly limit" checked={countOvertime} onChange={setCountOvertime} />
              <FormField label="Applies from" required helper="The September run keeps the old rates.">
                <div className="yx-pay-row">
                  <DatePicker value={appliesFrom} onChange={setAppliesFrom} min={NEXT_QUARTER} />
                  {appliesFrom && <DueBadge date={appliesFrom} />}
                </div>
              </FormField>
            </div>
            <aside className="yx-pay-panel" aria-label="Worked example">
              <SectionTitle>Worked example</SectionTitle>
              <FormField label="Slot type">
                <Select value={row.id} onChange={(v) => v && setSlotId(v)} options={slots.map((s) => ({ value: s.id, label: s.slot }))} />
              </FormField>
              <FormField label="Call-out on">
                {narrow ? (
                  <Select value={dayType} onChange={(v) => v && setDayType(v as 'normal' | 'holiday')} options={[{ value: 'normal', label: 'Normal day' }, { value: 'holiday', label: 'Public holiday' }]} />
                ) : (
                  <Segment label="Call-out on" value={dayType} onChange={setDayType} options={[{ value: 'normal', label: 'Normal day' }, { value: 'holiday', label: 'Public holiday' }]} />
                )}
              </FormField>
              <FormField label="Actual call-out hours">
                <NumberField value={actual} onChange={setActual} min={0} max={12} decimals />
              </FormField>
              <DescriptionList
                items={[
                  { label: 'Paid hours', value: calledOut ? `${ex.paidHours} h (minimum ${row.minHours} h)` : '0 h (not called out)' },
                  {
                    label: 'Call-out',
                    value: (
                      <>
                        {formatINR(ex.callOut)}
                        <p className="yx-pay-note">
                          {ex.paidHours} h × {formatINR(row.rate)} × {mult}
                        </p>
                      </>
                    ),
                  },
                  { label: 'Standby', value: standby === 0 ? `${formatINR(0)} (not paid when called out)` : formatINR(standby) },
                  { label: 'Total for the slot', value: formatINR(ex.total) },
                ]}
              />
              {countOvertime && calledOut && <p className="yx-pay-note">{ex.paidHours} h added to the person&apos;s weekly hours (48 h limit).</p>}
            </aside>
          </div>
          </div>
        )}
      </StateBlock>
      <Drawer
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `Edit ${editing.slot}` : ''}
        footer={
          <>
            {editBlocked && <span className="yx-pay-muted">{editBlocked}</span>}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!!editBlocked}
              onClick={() => {
                if (!editing) return;
                setSlots((ss) => ss.map((s) => (s.id === editing.id ? editing : s)));
                setSaved(false);
                setEditing(null);
              }}
            >
              Done
            </Button>
          </>
        }
      >
        {editing && (
          <div className="yx-pay-stack">
            <FieldRow>
              <FormField label="Standby pay per slot" required error={editErrors?.standby}>
                <CurrencyField value={editing.standby} onChange={(v) => setEditing({ ...editing, standby: v ?? 0 })} />
              </FormField>
              <FormField label="Call-out hourly rate" required error={editErrors?.rate}>
                <CurrencyField value={editing.rate} onChange={(v) => setEditing({ ...editing, rate: v ?? 0 })} />
              </FormField>
            </FieldRow>
            <FormField label="Minimum paid hours" required error={editErrors?.minHours}>
              <NumberField value={editing.minHours} onChange={(v) => setEditing({ ...editing, minHours: v ?? 0 })} min={0} max={12} decimals suffix="h" />
            </FormField>
            <FieldRow>
              <FormField label="Normal day multiplier" required>
                <NumberField value={editing.normal} onChange={(v) => setEditing({ ...editing, normal: v ?? 1 })} min={1} max={4} decimals suffix="×" />
              </FormField>
              <FormField label="Public holiday multiplier" required error={editErrors?.holiday}>
                <NumberField value={editing.holiday} onChange={(v) => setEditing({ ...editing, holiday: v ?? 1 })} min={1} max={4} decimals suffix="×" />
              </FormField>
            </FieldRow>
            <p className="yx-pay-note">Done updates the table and the worked example. Nothing is kept until you select Save rules.</p>
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Save on-call rules?"
        consequence={`${changes.join('. ')}. These apply to call-outs from ${formatDate(appliesFrom)}; the September run keeps the old rates.`}
        confirmLabel="Save rules"
        onConfirm={() => {
          setSavedSlots(slots);
          setSavedFlags({ payStandby, countOvertime });
          setSaved(true);
        }}
      />
    </PayFrame>
  );
}

/* ================================================================== PAY-36 Union check-off */

export interface CheckoffRow {
  id: string;
  name: string;
  code: string;
  union: string;
  signed: Date | null;
  dues: number;
  status: 'Authorised' | 'Withdrawn' | 'No authorisation';
  /** When a withdrawal takes effect. */
  withdrawnFrom?: Date;
}
export const CHECKOFF: CheckoffRow[] = PLANT_WORKERS.slice(0, 12).map((e, i) => ({
  id: e.id,
  name: e.name,
  code: e.code,
  union: i % 3 === 2 ? 'Hosur Plant Mazdoor Sangh' : 'Kaveri Foods Workers Union',
  signed: i === 5 ? null : d(3 + i, 2),
  dues: i % 3 === 2 ? 50 : 75,
  status: i === 5 ? 'No authorisation' : i === 9 ? 'Withdrawn' : 'Authorised',
  withdrawnFrom: i === 9 ? d(1) : undefined,
}));
/** September dues are remitted to each union by the 10th of the next month. */
const REMIT_DUE = d(10, 9);
interface Remittance {
  union: string;
  members: number;
  total: number;
  remitted: { on: Date; reference: string } | null;
}
const CO_TONE: Record<CheckoffRow['status'], BadgeTone> = { Authorised: 'success', Withdrawn: 'neutral', 'No authorisation': 'warning' };
const UNIONS = Array.from(new Set(CHECKOFF.map((c) => c.union)));
const UNION_DUES: Record<string, number> = Object.fromEntries(CHECKOFF.map((c) => [c.union, c.dues]));

/** PAY-36 · Union check-off: authorisations, monthly deduction list, remittance per union. */
export function UnionCheckoffScreen({ tab = 'auth', state = 'ready' }: { tab?: 'auth' | 'deductions' | 'remit'; state?: ViewState }) {
  const [rows, setRows] = useState<CheckoffRow[]>(CHECKOFF);
  const [adding, setAdding] = useState<{ id: string | null; union: string; signed: Date | null; file: boolean } | null>(null);
  const deducting = rows.filter((c) => c.status === 'Authorised');
  const noAuth = rows.filter((c) => c.status === 'No authorisation').length;
  const withdrawn = rows.filter((c) => c.status === 'Withdrawn').length;
  const candidates = rows.filter((c) => c.status !== 'Authorised');
  const startAdding = (r?: CheckoffRow) => setAdding({ id: r?.id ?? candidates[0]?.id ?? null, union: r?.union ?? UNIONS[0], signed: null, file: false });
  const addBlocked = !adding ? null : !adding.id ? 'Choose a worker.' : !adding.signed ? 'Enter the date it was signed.' : !adding.file ? 'Upload the signed form.' : null;
  const saveAuth = () => {
    if (!adding || addBlocked) return;
    setRows((rs) => rs.map((r) => (r.id === adding.id ? { ...r, union: adding.union, signed: adding.signed, dues: UNION_DUES[adding.union] ?? r.dues, status: 'Authorised' } : r)));
    setAdding(null);
  };
  const [remitted, setRemitted] = useState<Record<string, { on: Date; reference: string }>>({});
  const [marking, setMarking] = useState<{ union: string; on: Date | null; reference: string } | null>(null);
  const paid = startOfToday >= PAY_CALENDAR.payDate;
  const unions: Remittance[] = useMemo(
    () => Array.from(new Set(deducting.map((c) => c.union))).map((u) => ({ union: u, members: deducting.filter((c) => c.union === u).length, total: deducting.filter((c) => c.union === u).reduce((a, c) => a + c.dues, 0), remitted: remitted[u] ?? null })),
    [deducting, remitted],
  );
  const ready = state === 'ready';
  const cols: TableColumn<CheckoffRow>[] = [
    { key: 'n', header: 'Worker', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
    { key: 'u', header: 'Union', value: (r) => r.union, groupable: true, width: 200 },
    { key: 'dues', header: 'Monthly dues', type: 'money', value: (r) => r.dues, width: 110, optional: true },
    {
      key: 'st',
      header: 'Status',
      type: 'status',
      value: (r) => r.status,
      statusTone: (v) => CO_TONE[v as CheckoffRow['status']],
      render: (r) => (
        <div>
          <Badge tone={CO_TONE[r.status]}>{r.status}</Badge>
          {r.status === 'Withdrawn' && r.withdrawnFrom ? <p className="yx-pay-note">From {formatDate(r.withdrawnFrom)}</p> : r.signed ? <p className="yx-pay-note">Signed {formatDate(r.signed)}</p> : null}
        </div>
      ),
      width: 170,
    },
  ];
  const remitCols: TableColumn<Remittance>[] = [
    { key: 'union', header: 'Union', value: (u) => u.union, width: 220 },
    { key: 'members', header: 'Members', type: 'number', value: (u) => u.members, total: 'sum', width: 100 },
    { key: 'total', header: 'Amount', type: 'money', value: (u) => u.total, total: 'sum', width: 110 },
    {
      key: 'due',
      header: 'Due by',
      value: () => REMIT_DUE,
      render: (u) => (u.remitted ? formatDate(REMIT_DUE) : <span className="yx-pay-row">{formatDate(REMIT_DUE)} <DueBadge date={REMIT_DUE} /></span>),
      width: 190,
    },
    {
      key: 'status',
      header: 'Status',
      type: 'status',
      value: (u) => (u.remitted ? 'Remitted' : 'Not remitted'),
      render: (u) =>
        u.remitted ? (
          <div>
            <Badge tone="success">Remitted</Badge>
            <p className="yx-pay-note">
              {formatDate(u.remitted.on)} · {u.remitted.reference}
            </p>
          </div>
        ) : (
          <Badge tone="neutral">Not remitted</Badge>
        ),
      width: 150,
    },
  ];
  const markBlocked = !marking ? null : !marking.on ? 'Enter the date it was paid.' : !marking.reference.trim() ? 'Enter the payment reference.' : null;
  return (
    <PayFrame page="onetime" persona="hr">
      <PageHeader title="Union check-off" description="Dues are deducted only with the worker's written authorisation and remitted to each union every month." actions={
          <>
            {!candidates.length && <span className="yx-pay-muted">Every worker on the list has an authorisation.</span>}
            <Button variant="primary" icon={Upload} disabled={!candidates.length || state !== 'ready'} onClick={() => startAdding()}>
              Add authorisation
            </Button>
          </>
        }
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Check-off">
          <TabsTrigger value="auth" count={ready ? rows.length : undefined}>
            Authorisations
          </TabsTrigger>
          <TabsTrigger value="deductions" count={ready ? deducting.length : undefined}>
            September deductions
          </TabsTrigger>
          <TabsTrigger value="remit">Remittance</TabsTrigger>
        </TabsList>
        <TabsContent value="auth">
          <DataTable label="Check-off authorisations" columns={cols} rows={rows} getRowId={(r) => r.id} state={tableState(state)} errorTitle="Couldn't load check-off authorisations." rowButtons={(r) => (r.status === 'No authorisation' ? <Button size="sm" onClick={() => startAdding(r)}>Upload authorisation</Button> : null)} />
        </TabsContent>
        <TabsContent value="deductions">
          <div className="yx-pay-stack">
            {ready && (noAuth > 0 || withdrawn > 0) && (
              <InlineAlert tone="info">
                {[
                  noAuth > 0 && `${noAuth} ${noAuth === 1 ? 'member has' : 'members have'} no authorisation on file, so no dues are deducted.`,
                  withdrawn > 0 && `${withdrawn} ${withdrawn === 1 ? 'withdrawal takes' : 'withdrawals take'} effect from September.`,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </InlineAlert>
            )}
            <DataTable
              label="September check-off deductions"
              columns={cols.filter((c) => c.key !== 'st').map((c) => (c.key === 'dues' ? { ...c, total: 'sum' as const } : c))}
              rows={deducting}
              getRowId={(r) => r.id}
              state={tableState(state)}
              rowNoun={['member', 'members']}
            />
          </div>
        </TabsContent>
        <TabsContent value="remit">
          <div className="yx-pay-stack">
            {ready && !paid && (
              <InlineAlert tone="info">
                September dues are deducted on the {formatDate(PAY_CALENDAR.payDate)} pay day. Remit each union's total by {formatDate(REMIT_DUE)}; you can mark it remitted after pay day.
              </InlineAlert>
            )}
            <DataTable
              label="Remittance per union, September 2026"
              columns={remitCols}
              rows={unions}
              getRowId={(u) => u.union}
              state={tableState(state)}
              rowNoun={['union', 'unions']}
              rowButtons={(u) => (
                <>
                  <Button
                    size="sm"
                    icon={Download}
                    onClick={() =>
                      saveFile(
                        `check-off-${u.union.toLowerCase().replace(/[^a-z]+/g, '-')}-september-2026.csv`,
                        ['Code,Name,Monthly dues', ...deducting.filter((c) => c.union === u.union).map((c) => `${c.code},${c.name},${c.dues}`), `Total,${u.members} members,${u.total}`].join('\n'),
                      )
                    }
                  >
                    Statement
                  </Button>
                  {!u.remitted && (
                    <Button size="sm" disabled={!paid} onClick={() => setMarking({ union: u.union, on: null, reference: '' })}>
                      Mark remitted
                    </Button>
                  )}
                </>
              )}
            />
          </div>
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={!!marking}
        onOpenChange={(o) => !o && setMarking(null)}
        title={marking ? `Mark ${marking.union} dues remitted?` : ''}
        consequence={marking ? `${formatINR(unions.find((u) => u.union === marking.union)?.total ?? 0)} for September 2026.` : undefined}
        confirmLabel="Mark remitted"
        confirmDisabled={!!markBlocked}
        onConfirm={() => {
          if (!marking?.on) return;
          setRemitted((r) => ({ ...r, [marking.union]: { on: marking.on as Date, reference: marking.reference.trim() } }));
          setMarking(null);
        }}
      >
        {marking && (
          <div className="yx-pay-stack">
            <FormField label="Paid on" required>
              <DatePicker value={marking.on} onChange={(v) => setMarking({ ...marking, on: v })} min={PAY_CALENDAR.payDate} max={TODAY} />
            </FormField>
            <FormField label="Payment reference" required helper={markBlocked ?? undefined}>
              <TextField value={marking.reference} onChange={(v) => setMarking({ ...marking, reference: v })} />
            </FormField>
          </div>
        )}
      </ConfirmDialog>
      <Drawer
        open={!!adding}
        onOpenChange={(o) => !o && setAdding(null)}
        title="Add check-off authorisation"
        footer={
          <>
            {addBlocked && <span className="yx-pay-muted">{addBlocked}</span>}
            <Button onClick={() => setAdding(null)}>Cancel</Button>
            <Button variant="primary" disabled={!!addBlocked} onClick={saveAuth}>
              Save authorisation
            </Button>
          </>
        }
      >
        {adding && (
          <div className="yx-pay-stack">
            <FormField label="Worker" required>
              <Select value={adding.id} onChange={(v) => setAdding({ ...adding, id: v })} options={candidates.map((c) => ({ value: c.id, label: `${c.name} · ${c.code} · ${c.status}` }))} />
            </FormField>
            <FormField label="Union" required helper={`Monthly dues ${formatINR(UNION_DUES[adding.union] ?? 0)}, deducted from the next run.`}>
              <Select value={adding.union} onChange={(v) => v && setAdding({ ...adding, union: v })} options={UNIONS.map((u) => ({ value: u, label: u }))} />
            </FormField>
            <FormField label="Signed on" required>
              <DatePicker value={adding.signed} onChange={(v) => setAdding({ ...adding, signed: v })} max={TODAY} />
            </FormField>
            <FormField label="Signed authorisation form" required>
              <FileUpload upload={async () => {}} accept={['.pdf', '.jpg', '.png']} multiple={false} onItemsChange={(items) => setAdding((a) => a && { ...a, file: items.some((x) => x.status === 'done') })} />
            </FormField>
          </div>
        )}
      </Drawer>
    </PayFrame>
  );
}

/* ================================================================== PAY-43 Benefits › Group health */

export interface Quote {
  id: string;
  insurer: string;
  sumInsured: number;
  roomRent: string;
  waiting: string;
  copay: string;
  perMember: number;
}
export const QUOTES: Quote[] = [
  { id: 'q1', insurer: 'Sahyadri General Insurance', sumInsured: 3_00_000, roomRent: '1% of sum insured a day', waiting: '30 days; pre-existing covered from day 1', copay: 'None', perMember: 4_180 },
  { id: 'q2', insurer: 'Narmada Health Insurance', sumInsured: 3_00_000, roomRent: 'Single private room', waiting: '30 days; pre-existing after 1 year', copay: '10% for parents', perMember: 3_920 },
  { id: 'q3', insurer: 'Godavari Assurance', sumInsured: 5_00_000, roomRent: '2% of sum insured a day', waiting: '30 days; pre-existing covered from day 1', copay: 'None', perMember: 5_460 },
];

interface Endorsement {
  id: string;
  title: string;
  people: string;
  sent: Date | null;
  status: 'Endorsed' | 'With insurer' | 'Not sent';
}
/** Names stay out of the list (family events are private); the partner's site has the detail. */
const ENDORSEMENTS: Endorsement[] = [
  { id: 'e1', title: 'Additions: September joiners', people: '4 employees, 6 dependants', sent: d(26), status: 'Endorsed' },
  { id: 'e2', title: 'Deletions: September leavers', people: '2 employees, 3 dependants', sent: d(28), status: 'With insurer' },
  { id: 'e3', title: 'Dependant change', people: '1 employee, 1 dependant', sent: null, status: 'Not sent' },
];
/** When the disclosure for Suraksha Insurance Brokers was acknowledged (before the policy was bought). */
const DISCLOSURE_ACK = d(12, 2);

export type GroupHealthVariant ='quotes' | 'disclosure' | 'not-eligible' | 'licence-expired' | 'active';

/** PAY-43 · Benefits › Group health: eligibility, licensed partner, disclosure, neutral quotes, buy on partner, endorsements. */
export function GroupHealthScreen({ variant = 'quotes' }: { variant?: GroupHealthVariant }) {
  const [sort, setSort] = useState<string>('insurer');
  const [ack, setAck] = useState(variant !== 'disclosure');
  const [showDisclosure, setShowDisclosure] = useState(variant !== 'active');
  const [handedOff, setHandedOff] = useState<string | null>(null);
  const [endorsements, setEndorsements] = useState<Endorsement[]>(ENDORSEMENTS);
  const sorted = [...QUOTES].sort((a, b) => (sort === 'sumInsured' ? b.sumInsured - a.sumInsured : sort === 'insurer' ? a.insurer.localeCompare(b.insurer) : a.perMember - b.perMember));
  const tn = ENTITIES[1];
  const quoteCols: TableColumn<Quote>[] = [
    { key: 'insurer', header: 'Insurer', value: (q) => q.insurer, width: 180 },
    { key: 'sum', header: 'Sum insured', type: 'money', value: (q) => q.sumInsured, width: 120 },
    { key: 'room', header: 'Room rent', value: (q) => q.roomRent, width: 150 },
    { key: 'waiting', header: 'Waiting periods', value: (q) => q.waiting, width: 200 },
    { key: 'copay', header: 'Co-pay', value: (q) => q.copay, width: 110 },
    { key: 'cost', header: 'Cost per member a year', type: 'money', value: (q) => q.perMember, width: 130 },
  ];
  const endorsementCols: TableColumn<Endorsement>[] = [
    { key: 'title', header: 'Endorsement', value: (e) => e.title, width: 220 },
    { key: 'people', header: 'People', value: (e) => e.people, width: 190 },
    { key: 'sent', header: 'Sent', type: 'date', value: (e) => e.sent, width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (e) => e.status, statusTone: (v) => (v === 'Endorsed' ? 'success' : v === 'With insurer' ? 'info' : 'neutral'), width: 130 },
  ];
  const disclosure = (
    <section className="yx-pay-disclosure" aria-label="Distribution disclosure">
      <p>
        <strong>Before you ask for quotes</strong>
      </p>
      <ul>
        <li>Suraksha Insurance Brokers is the licensed intermediary. YukthiX is neither the insurer nor an insurance intermediary and does not recommend a quote.</li>
        <li>Quotes show the same fields with no ranking. The premium is paid to the partner or insurer, not to YukthiX.</li>
        <li>Commission or fee received by YukthiX is disclosed as the regulator permits.</li>
        <li>Shared with the partner: name, date of birth, gender, relationship and sum insured. Health declarations are filled on the partner&apos;s screen and not stored here.</li>
        <li>Complaints: the partner, then the insurer, then the regulator&apos;s grievance channel or the Insurance Ombudsman.</li>
      </ul>
      <Checkbox checked={ack} onChange={setAck} label="I have read this disclosure (recorded once per partner)" disabled={variant !== 'disclosure'} />
    </section>
  );
  const partner = (
    <DescriptionList
      columns={2}
      items={[
        { label: 'Partner', value: 'Suraksha Insurance Brokers Pvt Ltd' },
        { label: 'Category', value: 'Direct broker (life and general)' },
        { label: 'IRDAI registration', value: 'IRDAI/DB 1187/2021', mono: true },
        { label: 'Licence valid to', value: variant === 'licence-expired' ? <Badge tone="danger">Expired 28 Sep 2026</Badge> : '14 Mar 2028' },
      ]}
    />
  );
  return (
    <PaySettingsFrame page="4.11" entityId={variant === 'not-eligible' ? tn.id : undefined}>
      <PageHeader title="Group health insurance" description="Quotes and purchase happen only through a licensed broker. YukthiX is not an insurer or intermediary and gives no advice." />
      {variant === 'not-eligible' ? (
        <EmptyState
          title="Group health quotes need at least 7 employees."
          description={`${tn.name} has 5 employees on payroll. Once it has 7, quotes appear here. The insurer's minimum may differ; the partner can confirm it.`}
          action={<PartnerLink>Ask the partner to confirm</PartnerLink>}
        />
      ) : variant === 'licence-expired' ? (
        <div className="yx-pay-stack">
          {partner}
          <InlineAlert tone="warning" title="Quotes are hidden" actions={<PartnerLink>Contact Suraksha Insurance Brokers</PartnerLink>}>
            The partner&apos;s licence expired on 28 Sep 2026, so no quotes are shown until it is renewed.
          </InlineAlert>
        </div>
      ) : (
        <div className="yx-pay-stack">
          {partner}
          {variant === 'active' && (
            <div className="yx-pay-row">
              <span className="yx-pay-muted">Disclosure acknowledged on {formatDate(DISCLOSURE_ACK)}.</span>
              <Button size="sm" onClick={() => setShowDisclosure((s) => !s)}>
                {showDisclosure ? 'Hide disclosure' : 'View disclosure'}
              </Button>
            </div>
          )}
          {showDisclosure && disclosure}
          {variant === 'active' ? (
            <section className="yx-pay-panel" aria-label="Policy and endorsements">
              <SectionTitle actions={<PartnerLink>Manage on the partner's site</PartnerLink>}>Policy GMC/0042/2026 · Narmada Health Insurance</SectionTitle>
              <DataTable
                label="Endorsements"
                columns={endorsementCols}
                rows={endorsements}
                getRowId={(e) => e.id}
                cardSummary
                rowButtons={(e) =>
                  e.status === 'Not sent' ? (
                    <Button size="sm" onClick={() => setEndorsements((es) => es.map((x) => (x.id === e.id ? { ...x, status: 'With insurer', sent: startOfToday } : x)))}>
                      Send to partner
                    </Button>
                  ) : null
                }
              />
            </section>
          ) : (
            <section className="yx-pay-stack" aria-label="Quotes">
              <SectionTitle actions={ack && <Select size="sm" aria-label="Sort quotes by" value={sort} onChange={(v) => v && setSort(v)} options={[{ value: 'insurer', label: 'Sort by insurer name' }, { value: 'perMember', label: 'Sort by cost per member' }, { value: 'sumInsured', label: 'Sort by sum insured' }]} />}>
                Quotes for 164 employees and 312 dependants
              </SectionTitle>
              {handedOff && (
                <InlineAlert tone="info" title={`${handedOff} quote sent to the partner`} actions={<PartnerLink>Open Suraksha Insurance Brokers</PartnerLink>}>
                  Finish the purchase on Suraksha Insurance Brokers&apos; site. The policy appears here once the partner confirms it.
                </InlineAlert>
              )}
              {!ack ? (
                <p className="yx-pay-muted">Read and acknowledge the disclosure above to request quotes.</p>
              ) : (
                <>
                  <DataTable
                    label="Quotes"
                    columns={quoteCols}
                    rows={sorted}
                    getRowId={(q) => q.id}
                    rowButtons={(q) => (
                      <ConfirmDialog
                        trigger={<Button size="sm">Buy on partner&apos;s site</Button>}
                        title={`Continue to Suraksha Insurance Brokers for ${q.insurer}?`}
                        consequence="You buy the policy and pay the premium on the partner's site. Shared with the partner: name, date of birth, gender, relationship and sum insured for 164 employees and 312 dependants."
                        confirmLabel="Continue to partner's site"
                        onConfirm={() => setHandedOff(q.insurer)}
                      />
                    )}
                  />
                  <p className="yx-pay-note">Quotes valid until {formatDate(d(15, 9))}. After purchase, the policy appears in Benefits with enrolment and endorsements synced with the partner.</p>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </PaySettingsFrame>
  );
}
