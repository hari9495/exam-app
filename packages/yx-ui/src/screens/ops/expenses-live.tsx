// The live app's EXP-01 Expenses home, EXP-02 Claim composer and EXP-03 Claim review: the designed screens with real
// data (expenses round 1). The designs' parts are reused as they are (OpsDesk, PageHeader, Workspace, MoneyLead, the
// line card, the review table, the reduce drawer, the approval timeline); only what the real record needs is added
// (naming a new claim, reading a receipt, a line's form, the server's refusals, the finance check).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Camera, Car, Check, FileText, Plane, Plus, Receipt, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { ErrorSummary, FieldRow, FormField, useSaveErrors, useTooEarly } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { DataTable } from '../../components/table';
import { Card, DescriptionList, ObjectHeader, PageHeader } from '../../components/shell';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
import { ApprovalTimeline } from '../../components/timeline';
import { NeedsActionList, type ActionItem } from '../../components/dashboard';
import { StatCard } from '../../components/charts';
import { FileUpload } from '../../components/upload';
import { Segment } from '../../components/segment';
import { useNarrow } from '../../components/stepper';
import { formatDate } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import { errorText } from '../org/org-kit';
import { useAct } from '../growth/perf-live';
import { Actions, CardGrid, Facts, MoneyLead, OpsDesk, ReceiptImage, Workspace } from './ops-kit';
import { FLAG_TEXT, PAYMENT, PAY_MODE, STATUS, amount, approvalSteps, cutText, day, lineChecks, money, moneyInput, monthName, paise, paymentText, prevMonthOf, sumMoney, toLineInput, type LoadState } from './expenses-live-data';
import type { AdvanceSummary, ClaimDetail, ClaimLine, ClaimSummary, ExpenseCategory, ExpenseHome, LineInput, ToPayData, TripSummary } from '../expenses/live/types';

/** Where the live pages are (the Expenses menu). */
export const EXP_LINKS = {
  home: '/yx/expenses',
  claim: (id: string) => `/yx/expenses/claims/${encodeURIComponent(id)}`,
  trips: '/yx/expenses/trips',
  trip: (id: string) => `/yx/expenses/trips/${encodeURIComponent(id)}`,
  advances: '/yx/expenses/advances',
  advance: (id: string) => `/yx/expenses/advances/${encodeURIComponent(id)}`,
  toPay: '/yx/expenses/to-pay',
  approvals: '/yx/approvals',
  /** Round 2: a manager's read-only team claims; `?over=1` shows only claims with over-limit lines. */
  team: '/yx/expenses/team',
  teamOver: '/yx/expenses/team?over=1',
};

export type AddKind = 'receipt' | 'mileage' | 'perdiem' | 'bill';

export function ClaimStatusBadges({ c }: { c: Pick<ClaimSummary, 'status' | 'paymentStatus'> }) {
  const pay = PAYMENT[c.paymentStatus];
  return (
    <span className="yx-ops-row">
      <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
      {pay && c.status !== 'rejected' && <Badge tone={pay.tone}>{pay.label}</Badge>}
    </span>
  );
}

/* ================================================================== EXP-01 · Expenses home (live) */

export interface LiveHome {
  state: LoadState;
  onRetry: () => void;
  home: ExpenseHome | null;
  today: string;
  /** For people who approve: claims, trips and advances waiting for me. */
  approvals: { claims: ClaimSummary[]; trips: TripSummary[]; advances: AdvanceSummary[] } | null;
  /** My advance still open (paid, with a balance). */
  openAdvance: AdvanceSummary | null;
  /** Finance: what is to pay (expense.payout.manage), flagged claims (expense.finance.review), advances overdue. */
  finance: { toPay: ToPayData | null; flagged: ClaimSummary[] | null; advancesOverdue: number | null } | null;
  /** Starts a claim; `then` opens the composer's add-a-line sheet at once (phone "Snap a receipt", "Add mileage"). */
  onNew: (title: string, then?: AddKind) => Promise<unknown>;
  onOpen: (id: string) => void;
  onOpenTrip: (id: string) => void;
  onOpenAdvance: (id: string) => void;
  onRequestTrip: () => void;
  onGo: (href: string) => void;
  /** Opens the new-claim dialog at once (the "New expense claim" action, Ctrl K, N E). */
  startNew?: boolean;
}

type View = 'emp' | 'mgr' | 'fin';

export function NewClaimDialog({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (title: string) => Promise<unknown> }) {
  const [title, setTitle] = useState('');
  const early = useTooEarly(title.trim().length < 2 ? [{ fieldId: 'nc-title', message: 'Say what the claim is for, in at least 2 characters.' }] : []);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => !o && (early.reset(), onClose())}
      size="md"
      title="New claim"
      consequence="Name it, then add a line for each receipt, distance or per diem."
      confirmLabel="Start claim"
      onConfirm={async () => {
        if (early.stop()) return false;
        await onStart(title.trim());
        setTitle('');
      }}
    >
      <FormField id="nc-title" label="What is it for" required error={early.errorOf('nc-title')} helper="For example: Mumbai distributor meet">
        <TextField value={title} onChange={setTitle} maxLength={150} />
      </FormField>
    </ConfirmDialog>
  );
}

function ClaimTiles({ claims, onOpen }: { claims: ClaimSummary[]; onOpen: (id: string) => void }) {
  return (
    <ul className="yx-ops-stack yx-ops-plain" data-gap="sm" aria-label="My claims">
      {claims.map((c) => {
        const cut = cutText(c.currency, c.approvedTotal, c.claimedTotal, null);
        return (
          <li key={c.id} className="yx-ops-tile">
            <div className="yx-ops-tile__row">
              <Link className="yx-ops-tile__title" href={EXP_LINKS.claim(c.id)} onClick={(e) => (e.preventDefault(), onOpen(c.id))}>
                {c.title}
              </Link>
              <span className="yx-ops-tile__amount">{money(c.currency, c.status === 'rejected' ? '0' : c.netPayable)}</span>
            </div>
            <div className="yx-ops-tile__row">
              <span className="yx-ops-muted">{c.submittedAt ? `Submitted ${formatDate(day(c.submittedAt))}` : 'Not submitted yet'}</span>
              <ClaimStatusBadges c={c} />
            </div>
            {cut && <span className="yx-ops-muted">{cut}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function LiveExpensesHome({ live }: { live: LiveHome }) {
  const phone = useNarrow();
  const h = live.home;
  const views: { value: View; label: string }[] = [
    { value: 'emp', label: 'My expenses' },
    ...(h && (h.team || h.waitingForMe || (live.approvals && live.approvals.trips.length + live.approvals.advances.length > 0)) ? [{ value: 'mgr' as const, label: 'Waiting for me' }] : []),
    ...(live.finance ? [{ value: 'fin' as const, label: 'Finance' }] : []),
  ];
  const [view, setView] = useState<View>('emp');
  const [naming, setNaming] = useState<{ then?: AddKind } | null>(live.startNew ? {} : null);
  useEffect(() => {
    if (live.startNew) setNaming({});
  }, [live.startNew]);
  const shown = views.some((v) => v.value === view) ? view : 'emp';
  const switcher = views.length > 1 ? <Segment label="Show" value={shown} onChange={setView} options={views} /> : null;
  const dialog = <NewClaimDialog open={naming !== null} onClose={() => setNaming(null)} onStart={async (t) => {
    await live.onNew(t, naming?.then);
    setNaming(null);
  }} />;

  const claims = h?.claims ?? [];
  const claimList =
    live.state === 'loading' ? (
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading claims">
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    ) : live.state === 'error' || live.state === 'no-access' ? (
      <ErrorState title="We couldn't load your claims." description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />
    ) : claims.length === 0 ? (
      <EmptyState compact title="No claims yet." description="Start a claim, then snap a receipt for each line." action={<Button variant="primary" icon={Camera} onClick={() => setNaming({ then: 'receipt' })}>Snap a receipt</Button>} />
    ) : (
      <ClaimTiles claims={claims} onOpen={live.onOpen} />
    );
  const toReceive = h ? amount(h.toReceive) : 0;
  const payroll = h?.payroll ? `Approved claims are paid in the ${monthName(h.payroll.month)} payroll unless finance pays sooner.` : 'Approved claims are paid in the next payroll unless finance pays sooner.';

  if (phone)
    return (
      <PhoneFrame tab="pay" title="Expenses" back={<IconButton icon={ArrowLeft} label="Back to Pay" onClick={() => live.onGo('/yx/pay')} />}>
        <MoneyLead label="You will receive" amount={toReceive} sub={`From ${claims.filter((c) => c.paymentStatus !== 'paid' && c.status !== 'rejected' && c.status !== 'withdrawn').length} claims in progress`} />
        <Button variant="primary" icon={Camera} fullWidth onClick={() => setNaming({ then: 'receipt' })}>
          Snap a receipt
        </Button>
        <Actions>
          <Button icon={Plane} onClick={live.onRequestTrip}>Request a trip</Button>
          <Button icon={Car} onClick={() => setNaming({ then: 'mileage' })}>Add mileage</Button>
        </Actions>
        <h2 className="yx-ops-card__title">My claims</h2>
        {claimList}
        {dialog}
      </PhoneFrame>
    );

  if (shown === 'mgr' && h) {
    const a = live.approvals ?? { claims: [], trips: [], advances: [] };
    const items: ActionItem[] = [
      ...a.claims.map((c) => ({ id: `c:${c.id}`, type: 'Expense', title: `${c.title} · ${money(c.currency, c.claimedTotal)}${c.risk !== 'none' ? ' · policy flags' : ''}`, who: c.person, kind: 'review' as const })),
      ...a.trips.map((t) => ({ id: `t:${t.id}`, type: 'Trip', title: `${t.purpose}, ${formatDate(day(t.fromOn))} to ${formatDate(day(t.toOn))}${paise(t.advanceRequested) > 0 ? ` · advance ${money(t.advanceCurrency ?? t.currency, t.advanceRequested)}` : ''}`, who: t.person, kind: 'review' as const })),
      ...a.advances.map((x) => ({ id: `a:${x.id}`, type: 'Advance', title: `${x.purpose} · ${money(x.currency, x.requested)}`, who: x.person ?? '', kind: 'review' as const })),
    ];
    const open = (it: ActionItem) => {
      const [k, id] = [it.id.slice(0, 1), it.id.slice(2)];
      if (k === 'c') live.onOpen(id!);
      else if (k === 't') live.onOpenTrip(id!);
      else live.onOpenAdvance(id!);
    };
    const t = h.team;
    return (
      <OpsDesk area="expenses" active="Expenses home">
        <PageHeader title="Expenses" description="Claims and trips waiting for you, and your team's spend." />
        {switcher}
        <NeedsActionList title="Waiting for you" today={day(live.today)} viewAllHref={EXP_LINKS.approvals} total={items.length} loading={live.state === 'loading'} items={items} onReview={open} />
        {t && (
          <CardGrid min="sm">
            <StatCard label={`Team spend, ${monthName(t.month)}`} value={amount(t.spend)} money {...(t.previous !== null ? { previous: amount(t.previous), previousLabel: monthName(prevMonthOf(t.month)) } : {})} trend={t.trend.map(amount)} drill={{ label: 'View team claims', href: EXP_LINKS.team, onClick: (e) => (e.preventDefault(), live.onGo(EXP_LINKS.team)) }} />
            <StatCard label="Over-limit lines" value={t.overLimit} {...(t.overLimitPrevious !== null ? { previous: t.overLimitPrevious, previousLabel: monthName(prevMonthOf(t.month)) } : {})} drill={{ label: 'View over-limit lines', href: EXP_LINKS.teamOver, onClick: (e) => (e.preventDefault(), live.onGo(EXP_LINKS.teamOver)) }} />
          </CardGrid>
        )}
        {dialog}
      </OpsDesk>
    );
  }

  if (shown === 'fin' && h && live.finance) {
    const f = live.finance;
    const unpaid = (f.toPay?.claims ?? []).filter((c) => c.paymentStatus !== 'paid');
    const queued = h.payroll ? unpaid.filter((c) => c.route === 'payroll' && c.payMonth === h.payroll!.month).length : 0;
    const go = (href: string) => ({ href, onClick: (e: { preventDefault: () => void }) => (e.preventDefault(), live.onGo(href)) });
    return (
      <OpsDesk area="expenses" active="Expenses home" counts={{ 'To pay': unpaid.length }}>
        <PageHeader title="Expenses" description="What to pay, flagged claims and advances past their settlement window." actions={f.toPay ? <Button variant="primary" onClick={() => live.onGo(EXP_LINKS.toPay)}>Open to-pay queue</Button> : undefined} />
        {switcher}
        <CardGrid min="sm">
          {f.toPay && <StatCard label="To pay" value={amount(sumMoney(unpaid.map((c) => c.netPayable)))} money drill={{ label: `View ${unpaid.length} claims`, ...go(EXP_LINKS.toPay) }} />}
          {f.toPay && <StatCard label="Payment failed" value={unpaid.filter((c) => c.paymentStatus === 'payment_failed').length} drill={{ label: 'Re-route failed payments', ...go(EXP_LINKS.toPay) }} />}
          {f.flagged && <StatCard label="Flagged for audit" value={f.flagged.length} drill={{ label: 'Duplicates, missing GST, over limit', href: '#flagged' }} />}
          {f.advancesOverdue !== null && <StatCard label="Advances overdue" value={f.advancesOverdue} drill={{ label: 'View advances', ...go(EXP_LINKS.advances) }} />}
        </CardGrid>
        {h.payroll && (
          <Card title={`${monthName(h.payroll.month).split(' ')[0]} payroll cut-off`}>
            <p className="yx-ops-p">
              Claims approved by {formatDate(day(`${h.payroll.month}-${String(h.payroll.cutoffDay).padStart(2, '0')}`))} are paid in the {monthName(h.payroll.month)} payroll.{f.toPay ? ` ${queued} ${queued === 1 ? 'claim is' : 'claims are'} queued for it.` : ''}
            </p>
          </Card>
        )}
        {f.flagged && (
          <div id="flagged">
            <Card title="Flagged for audit">
              <DataTable
                label="Claims flagged for audit"
                columns={[
                  { key: 'p', header: 'Person', value: (c: ClaimSummary) => c.person },
                  { key: 't', header: 'Claim', value: (c) => c.title, width: 240 },
                  { key: 'a', header: 'Claimed', value: (c) => amount(c.claimedTotal), render: (c) => money(c.currency, c.claimedTotal) },
                  { key: 'r', header: 'Risk', value: (c) => c.risk, render: (c) => <Badge tone={c.risk === 'high' ? 'danger' : 'warning'}>{c.risk === 'high' ? 'High' : 'Low'}</Badge> },
                ]}
                rows={f.flagged}
                getRowId={(c) => c.id}
                rowNoun={['claim', 'claims']}
                empty={<EmptyState compact title="Nothing flagged." />}
                rowButtons={(c) => <Button size="sm" onClick={() => live.onOpen(c.id)}>Check</Button>}
              />
            </Card>
          </div>
        )}
        {dialog}
      </OpsDesk>
    );
  }

  const adv = live.openAdvance;
  return (
    <OpsDesk area="expenses" active="Expenses home">
      <PageHeader
        title="Expenses"
        description="Your claims, trips and advances."
        actions={
          <>
            <Button icon={Plane} onClick={live.onRequestTrip}>Request a trip</Button>
            <Button variant="primary" icon={Plus} onClick={() => setNaming({})}>
              New claim
            </Button>
          </>
        }
      />
      {switcher}
      <Workspace
        main={<Card title="My claims">{claimList}</Card>}
        rail={
          <>
            <MoneyLead label="You will receive" amount={toReceive} sub={payroll} />
            {adv && (
              <Card title="Open advance" actions={<Button size="sm" onClick={() => live.onOpenAdvance(adv.id)}>Open</Button>}>
                <Facts items={[{ label: 'Balance', value: money(adv.currency, adv.balance), tone: adv.overdue ? 'danger' : undefined }, { label: 'Settle by', value: adv.settleBy ? formatDate(day(adv.settleBy)) : '—' }]} />
              </Card>
            )}
          </>
        }
      />
      {dialog}
    </OpsDesk>
  );
}

/**
 * Round 2: a line's real receipt thumbnail: the stored photo (fetched once through the API, freed when it goes), or a
 * PDF tile; the drawn receipt shows while it loads or when it cannot be shown (for example before the virus check).
 */
function LineReceipt({ line, load }: { line: ClaimLine; load?: (lineId: string) => Promise<string> }) {
  const [src, setSrc] = useState<string | null>(null);
  const photo = line.receiptType !== 'pdf';
  // The page passes a new function each render; fetch again only when the line's receipt changes.
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    const load = loader.current;
    setSrc(null);
    if (!photo || !load) return;
    let gone = false;
    let url: string | null = null;
    load(line.id).then(
      (u) => (gone ? URL.revokeObjectURL(u) : ((url = u), setSrc(u))),
      () => undefined,
    );
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [line.id, line.version, photo]);
  return <ReceiptImage merchant={line.merchant ?? 'Receipt'} amount={amount(line.fx?.amount ?? line.claimed)} date={day(line.spentOn)} src={src} kind={photo ? 'image' : 'pdf'} />;
}

/* ================================================================== EXP-02 · Claim composer (live) */

export interface LiveClaim {
  state: LoadState;
  onRetry: () => void;
  claim: ClaimDetail | null;
  categories: ExpenseCategory[];
  today: string;
  /** Opens the add-a-line sheet at once with this kind (from the home's "Snap a receipt" or "Add mileage"). */
  startAdd?: AddKind | null;
  onBack: () => void;
  onOpenTrip?: (tripId: string) => void;
  onUploadReceipt: (file: File, lineId?: string) => Promise<unknown>;
  onSaveLine: (lineId: string | null, input: LineInput) => Promise<unknown>;
  onRemoveLine: (lineId: string) => Promise<unknown>;
  onSubmit: () => Promise<unknown>;
  onWithdraw: () => Promise<unknown>;
  onOpenReceipt: (lineId: string) => Promise<unknown>;
  /** Round 2: the stored receipt photo as an object URL for the thumbnail (streamed through the API's checks). */
  onReceiptUrl?: (lineId: string) => Promise<string>;
  onUploadFxProof?: (lineId: string, file: File) => Promise<unknown>;
  onOpenFxProof?: (lineId: string) => Promise<unknown>;
  /** Review (EXP-03): the approver whose turn it is, and finance. */
  onApproveAmount: (lineId: string, amount: string, reason: string) => Promise<unknown>;
  onDecide: (decision: 'approve' | 'reject' | 'send_back', reason: string) => Promise<unknown>;
  onFlag: (flagId: string, decision: 'clear' | 'confirm', note: string) => Promise<unknown>;
}

const catName = (cats: ExpenseCategory[], code: string) => {
  const c = cats.find((x) => x.code === code);
  return c?.shownName ?? c?.name ?? code;
};

function LiveLineCard({ line: l, claim, categories, editable, act, busy, onEdit, onRemove, live }: { line: ClaimLine; claim: ClaimDetail; categories: ExpenseCategory[]; editable: boolean; act: ReturnType<typeof useAct>['act']; busy: string | null; onEdit: () => void; onRemove: () => void; live: LiveClaim }) {
  const cur = claim.currency;
  const checks = lineChecks(l, cur, claim.flags);
  const [why, setWhy] = useState(l.justification ?? '');
  const whyEarly = useTooEarly(why.trim().length < 3 ? [{ fieldId: `why-${l.id}`, message: 'Add a reason so your approver can decide on the excess.' }] : []);
  const distance = Boolean(l.mileage);
  const draft = l.confirmed === false;
  const unread = Boolean(l.ocr && !l.ocr.confirmed);
  const cut = cutText(cur, l.approved, l.claimed, l.reduceReason);
  return (
    <article className="yx-ops-card" data-tone={checks.some((c) => c.tone === 'danger') ? 'danger' : checks.length ? 'warning' : undefined} aria-label={`Line ${l.lineNo}, ${catName(categories, l.categoryCode)}`}>
      <div className="yx-ops-card__head">
        <h3 className="yx-ops-card__title">
          {l.lineNo}. {catName(categories, l.categoryCode)}
        </h3>
        <span className="yx-ops-row">
          {l.ocr && <Badge tone="ai">Read from receipt</Badge>}
          {l.origin === 'field_day' && <Badge tone="info">From field visits</Badge>}
          <strong>{money(cur, l.claimed)}</strong>
          {editable && <IconButton icon={Trash2} label={`Remove line ${l.lineNo}`} onClick={onRemove} />}
        </span>
      </div>
      <div className="yx-ops-split">
        {l.hasReceipt ? (
          <div className="yx-ops-stack" data-gap="sm">
            <LineReceipt line={l} load={live.onReceiptUrl} />
            <Button size="sm" loading={busy === `v-${l.id}`} onClick={() => void act(`v-${l.id}`, () => live.onOpenReceipt(l.id))}>
              View receipt
            </Button>
          </div>
        ) : (
          <div className="yx-ops-muted">{distance ? 'Distance claim: no receipt needed' : l.perDiem ? 'Per diem: no receipt needed' : l.selfDeclared ? 'No receipt: declared as spent for work' : 'No receipt attached'}</div>
        )}
        <div className="yx-ops-stack" data-gap="sm">
          <DescriptionList
            items={[
              { label: 'Date', value: formatDate(day(l.spentOn)) },
              ...(l.merchant ? [{ label: distance ? 'Trip' : 'Merchant', value: l.merchant }] : []),
              ...(l.city ? [{ label: 'City', value: l.city }] : []),
              { label: 'Paid by', value: PAY_MODE[l.payMode] },
              ...(l.mileage ? [{ label: 'Worked out', value: `${l.mileage.km} km × ${money(cur, l.mileage.ratePerKm)} per km (${l.mileage.vehicle.replace(/_/g, ' ')})` }] : []),
              ...(l.perDiem ? [{ label: 'Worked out', value: `${l.perDiem.fullDays} full and ${l.perDiem.partialDays} part days × ${money(cur, l.perDiem.ratePerDay)} per day` }] : []),
              ...(l.policy?.limit ? [{ label: 'Policy limit', value: `${money(cur, l.policy.limit.amount)} (${l.policy.limit.kind.replace(/_/g, ' ')})` }] : []),
            ]}
          />
          {l.fx && (
            <p className="yx-ops-muted">
              {money(l.fx.currency, l.fx.amount)} at {Number(l.fx.rate).toLocaleString('en-IN', { maximumFractionDigits: 4 })} ({l.fx.source === 'manual' ? 'your card or bank rate' : 'company rate'}{l.fx.rateDate ? `, ${formatDate(day(l.fx.rateDate))}` : ''})
            </p>
          )}
          {l.fx?.source === 'manual' && l.fx.variancePct !== null && paise(l.fx.variancePct) !== 0 && <InlineAlert tone="warning">Your rate is {l.fx.variancePct} % from the reference rate. Your approver will see both. Attach the statement.</InlineAlert>}
          {l.gst && (l.gst.supplierGstin || l.gst.invoiceNo) && (
            <DescriptionList
              items={[
                ...(l.gst.supplierGstin ? [{ label: 'Supplier GSTIN', value: l.gst.supplierGstin, mono: true }] : []),
                ...(l.gst.invoiceNo ? [{ label: 'Invoice', value: l.gst.invoiceNo, mono: true }] : []),
                ...(l.gst.taxableValue ? [{ label: 'Taxable value', value: money(cur, l.gst.taxableValue) }] : []),
                { label: 'Tax', value: l.gst.igst ? `IGST ${money(cur, l.gst.igst)}` : `CGST ${money(cur, l.gst.cgst ?? '0')} · SGST ${money(cur, l.gst.sgst ?? '0')}` },
              ]}
            />
          )}
        </div>
      </div>
      {checks.map((c) => (
        <InlineAlert key={c.key} tone={c.tone}>
          {c.text}
        </InlineAlert>
      ))}
      {cut && <InlineAlert tone="info">{cut}</InlineAlert>}
      {unread && <InlineAlert tone="warning" title="Check the values read from the receipt">{l.ocr!.lowConfidence.length ? `Please check the ${l.ocr!.lowConfidence.join(', ')}: not read clearly.` : 'Confirm the category and the values before you submit.'}</InlineAlert>}
      {l.policy?.outcome === 'over_justify' && editable && (
        <div className="yx-ops-stack" data-gap="sm">
          <FormField id={`why-${l.id}`} label="Why it's over the limit" required error={whyEarly.errorOf(`why-${l.id}`)}>
            <TextArea value={why} onChange={setWhy} rows={2} maxLength={500} />
          </FormField>
          <Actions>
            <Button size="sm" loading={busy === `w-${l.id}`} onClick={() => !whyEarly.stop() && void act(`w-${l.id}`, () => live.onSaveLine(l.id, toLineInput(l, { justification: why.trim() })), 'Reason saved')}>
              Save reason
            </Button>
          </Actions>
        </div>
      )}
      {l.policy?.outcome === 'over_justify' && !editable && l.justification && <InlineAlert tone="info" title="Employee's reason">{l.justification}</InlineAlert>}
      {editable && (
        <Actions>
          {draft && distance ? (
            <>
              <Button size="sm" icon={Check} loading={busy === `c-${l.id}`} onClick={() => void act(`c-${l.id}`, () => live.onSaveLine(l.id, toLineInput(l)), 'Distance confirmed')}>
                Confirm distance
              </Button>
              <Button size="sm" onClick={onEdit}>Edit distance</Button>
            </>
          ) : (
            <Button size="sm" variant={unread || draft ? 'primary' : 'secondary'} onClick={onEdit}>
              {unread || draft ? 'Check and confirm' : 'Edit line'}
            </Button>
          )}
          {l.fx?.source === 'manual' && !l.fx.hasProof && live.onUploadFxProof && <Button size="sm" onClick={onEdit}>Add rate proof</Button>}
        </Actions>
      )}
      {l.fx?.hasProof && live.onOpenFxProof && (
        <Actions>
          <Button size="sm" loading={busy === `vf-${l.id}`} onClick={() => void act(`vf-${l.id}`, () => live.onOpenFxProof!(l.id))}>
            View rate proof
          </Button>
        </Actions>
      )}
    </article>
  );
}

const KINDS: { value: AddKind; label: string; description: string }[] = [
  { value: 'receipt', label: 'A receipt', description: 'We read merchant, date, amount and GST' },
  { value: 'mileage', label: 'Mileage', description: 'Distance × rate for your vehicle' },
  { value: 'perdiem', label: 'Per diem', description: 'Days × rate for the city tier' },
  { value: 'bill', label: 'A bill without a receipt', description: 'Type it in; you declare it was spent for work' },
];
const KIND_OF: Record<AddKind, ExpenseCategory['kind'][]> = { receipt: ['spend'], mileage: ['mileage'], perdiem: ['per_diem'], bill: ['spend', 'company_paid_only'] };

/** The design's "Add a line" sheet, and the same form to check or change a saved line. */
function LineSheet({ phone, line, start, categories, today, currency, onClose, live }: { phone: boolean; line: ClaimLine | null; start: AddKind; categories: ExpenseCategory[]; today: string; currency: string; onClose: () => void; live: LiveClaim }) {
  const [kind, setKind] = useState<AddKind>(line ? (line.mileage ? 'mileage' : line.perDiem ? 'perdiem' : 'bill') : start);
  const usable = categories.filter((x) => x.active && (line ? true : KIND_OF[kind].includes(x.kind)));
  const f = line?.ocr?.fields ?? {};
  const [code, setCode] = useState<string | null>(line?.categoryCode ?? null);
  const pickCode = code && usable.some((x) => x.code === code) ? code : usable.length === 1 ? usable[0]!.code : null;
  const cat = usable.find((x) => x.code === pickCode);
  const ck = cat?.kind ?? (kind === 'mileage' ? 'mileage' : kind === 'perdiem' ? 'per_diem' : 'spend');
  const [on, setOn] = useState<Date | null>(day(line?.spentOn ?? today));
  const [merchant, setMerchant] = useState(line?.merchant ?? '');
  const [city, setCity] = useState(line?.city ?? '');
  const [amt, setAmt] = useState(line?.fx?.amount ? String(amount(line.fx.amount)) : line && paise(line.claimed) > 0 ? line.claimed : '');
  const [billCur, setBillCur] = useState(line?.fx?.currency ?? currency);
  const [rate, setRate] = useState(line?.fx?.source === 'manual' ? line.fx.rate : '');
  const foreign = billCur !== currency;
  const [vehicle, setVehicle] = useState<string | null>(line?.mileage?.vehicle ?? 'car');
  const [km, setKm] = useState<number | null>(line?.mileage?.km ?? null);
  const [full, setFull] = useState<number | null>(line?.perDiem?.fullDays ?? 1);
  const [part, setPart] = useState<number | null>(line?.perDiem?.partialDays ?? 0);
  const [declared, setDeclared] = useState(line?.selfDeclared ?? kind === 'bill');
  const [companyPaid, setCompanyPaid] = useState(line?.payMode === 'company_paid');
  const [gstin, setGstin] = useState(line?.gst?.supplierGstin ?? '');
  const [invoice, setInvoice] = useState(line?.gst?.invoiceNo ?? '');
  const [taxable, setTaxable] = useState(line?.gst?.taxableValue ?? '');
  const [cgst, setCgst] = useState(line?.gst?.cgst ?? '');
  const [sgst, setSgst] = useState(line?.gst?.sgst ?? '');
  const [igst, setIgst] = useState(line?.gst?.igst ?? '');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useAct();
  const low = new Set(line?.ocr?.lowConfidence ?? []);
  const said = (k: string) => (low.has(k) ? 'Please check: read with low confidence' : f[k as keyof typeof f] ? 'Read from the receipt' : undefined);
  const okMoney = (x: string) => x.trim() === '' || moneyInput(x) !== null;
  const receiptOnly = !line && kind === 'receipt';
  const errors = receiptOnly
    ? []
    : [
        ...(pickCode ? [] : [{ fieldId: 'ln-cat', message: usable.length ? 'Choose what the line is for.' : 'Your company has no category for this yet. Ask HR to add one.' }]),
        ...(on ? (dayKey(on) > today ? [{ fieldId: 'ln-date', message: 'A bill cannot be dated in the future.' }] : []) : [{ fieldId: 'ln-date', message: 'Enter the date on the bill.' }]),
        ...((ck === 'spend' || ck === 'company_paid_only') && moneyInput(amt) === null ? [{ fieldId: 'ln-amount', message: 'Enter the amount on the bill, e.g. 640 or 640.50.' }] : []),
        ...(ck === 'mileage' && !(km && km > 0) ? [{ fieldId: 'ln-km', message: 'Enter the distance in km.' }] : []),
        ...(ck === 'per_diem' && !((full ?? 0) + (part ?? 0) > 0) ? [{ fieldId: 'ln-full', message: 'Enter at least one day.' }] : []),
        ...([taxable, cgst, sgst, igst].every(okMoney) ? [] : [{ fieldId: 'ln-gstin', message: 'GST amounts are numbers, e.g. 450.00.' }]),
        ...(/^[A-Z]{3}$/.test(billCur) ? [] : [{ fieldId: 'ln-cur', message: 'The currency is a 3-letter code, e.g. AED.' }]),
        ...(foreign && rate !== '' && !/^\d{1,10}(\.\d{1,8})?$/.test(rate) ? [{ fieldId: 'ln-rate', message: 'The rate is a number, e.g. 22.75.' }] : []),
      ];
  const v = useSaveErrors(errors);
  const n = (x: string) => (x.trim() ? x.trim() : null);
  const save = async () => {
    if (receiptOnly) return onClose();
    if (errors.length) {
      v.reveal();
      document.getElementById(errors[0]!.fieldId)?.focus();
      return;
    }
    setSaving(true);
    setFailed(null);
    try {
      await live.onSaveLine(line?.id ?? null, {
        categoryCode: pickCode!,
        spentOn: dayKey(on!),
        merchant: n(merchant),
        city: n(city),
        // EXP-08: a line paid by the company card (from the card statement) stays a company-card line.
        payMode: companyPaid ? 'company_paid' : line?.payMode === 'company_card' ? 'company_card' : 'personal',
        description: line?.description ?? null,
        justification: line?.justification ?? null,
        ...(ck === 'mileage' ? { mileage: { vehicle: vehicle ?? 'car', km: km! } } : ck === 'per_diem' ? { perDiem: { fullDays: full ?? 0, partialDays: part ?? 0 } } : foreign ? { fx: { currency: billCur, amount: moneyInput(amt)!, ...(rate ? { rate } : {}) } } : { amount: moneyInput(amt)! }),
        ...(line?.hasReceipt || ck === 'mileage' || ck === 'per_diem' ? {} : { selfDeclared: declared }),
        ...(cat?.gstEligible ? { gst: { supplierGstin: n(gstin.toUpperCase()), invoiceNo: n(invoice.toUpperCase()), taxableValue: n(taxable), cgst: n(cgst), sgst: n(sgst), igst: n(igst), billedToGstin: line?.gst?.billedToGstin ?? null } } : {}),
        ...(line ? { version: line.version } : {}),
      });
      toast({ tone: 'success', title: line ? (line.ocr && !line.ocr.confirmed ? 'Line confirmed' : 'Line saved') : 'Line added' });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const upload = async (file: File, lineId?: string) => {
    try {
      await live.onUploadReceipt(file, lineId);
    } catch (e) {
      throw new Error(errorText(e));
    }
    toast({ tone: 'success', title: lineId ? 'Receipt added' : 'Receipt read', description: lineId ? undefined : 'Check the values on the new line, then confirm it.' });
    if (!lineId) onClose();
  };
  const body = (
    <div className="yx-ops-stack">
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      {!line && (
        <FormField label="What are you adding?">
          <RadioGroup value={kind} onChange={(x) => (setKind(x as AddKind), setCode(null), setDeclared(x === 'bill'))} options={KINDS} />
        </FormField>
      )}
      {receiptOnly ? (
        <FormField label="Receipt" helper="A photo or PDF, up to 10 MB. Each receipt becomes a line.">
          <FileUpload accept={['.jpg', '.jpeg', '.png', '.pdf']} multiple={false} capture="environment" upload={(file) => upload(file)} />
        </FormField>
      ) : (
        <>
          {(line || usable.length !== 1) && (
            <FormField id="ln-cat" label="What is it for" required error={v.errorOf('ln-cat')}>
              <Select aria-label="What is it for" value={pickCode} onChange={setCode} options={usable.map((x) => ({ value: x.code, label: x.shownName ?? x.name }))} searchable />
            </FormField>
          )}
          <FormField id="ln-date" label="Date on the bill" required error={v.errorOf('ln-date')} helper={said('date')}>
            <DatePicker value={on} onChange={setOn} aria-label="Date on the bill" />
          </FormField>
          {ck === 'mileage' ? (
            <FieldRow>
              <FormField label="Vehicle">
                <Select aria-label="Vehicle" value={vehicle} onChange={setVehicle} options={[{ value: 'car', label: 'Car' }, { value: 'two_wheeler', label: 'Two-wheeler' }, { value: 'ev_car', label: 'Electric car' }, { value: 'ev_two_wheeler', label: 'Electric two-wheeler' }]} />
              </FormField>
              <FormField id="ln-km" label="Distance (km)" required error={v.errorOf('ln-km')} helper="The amount is worked out from your company's rate.">
                <NumberField value={km} onChange={setKm} min={0.1} max={5000} decimals />
              </FormField>
            </FieldRow>
          ) : ck === 'per_diem' ? (
            <FieldRow>
              <FormField id="ln-full" label="Full days" error={v.errorOf('ln-full')} helper="The amount is worked out from the rate for the city.">
                <NumberField value={full} onChange={setFull} min={0} max={60} />
              </FormField>
              <FormField label="Part days (first or last)">
                <NumberField value={part} onChange={setPart} min={0} max={2} />
              </FormField>
            </FieldRow>
          ) : (
            <>
              <FieldRow>
                <FormField id="ln-cur" label="Currency of the bill" error={v.errorOf('ln-cur')} helper={foreign ? `Converted to ${currency} at the company rate for the day, or your rate below.` : undefined}>
                  <TextField value={billCur} onChange={(x) => setBillCur(x.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} maxLength={3} />
                </FormField>
                <FormField id="ln-amount" label={`Amount (${billCur || currency})`} required error={v.errorOf('ln-amount')} helper={said('amount')}>
                  <TextField value={amt} onChange={(x) => setAmt(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
                </FormField>
              </FieldRow>
              {foreign && (
                <FormField id="ln-rate" label={`Rate you actually paid (${currency} per ${billCur})`} optional error={v.errorOf('ln-rate')} helper="Needs your card or forex statement. Leave it empty to use the company rate.">
                  <TextField value={rate} onChange={(x) => setRate(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={20} />
                </FormField>
              )}
            </>
          )}
          <FieldRow>
            <FormField label={ck === 'mileage' ? 'Trip' : 'Shop or supplier'} optional helper={said('merchant')}>
              <TextField value={merchant} onChange={setMerchant} maxLength={120} />
            </FormField>
            <FormField label="City" optional helper="Decides the city tier and its limits.">
              <TextField value={city} onChange={setCity} maxLength={60} />
            </FormField>
          </FieldRow>
          {line && !line.hasReceipt && ck !== 'mileage' && ck !== 'per_diem' && (
            <FormField label="Receipt" optional helper="Add the receipt if you have it. A photo or PDF, up to 10 MB.">
              <FileUpload accept={['.jpg', '.jpeg', '.png', '.pdf']} multiple={false} capture="environment" upload={(file) => upload(file, line.id)} />
            </FormField>
          )}
          {line?.fx?.source === 'manual' && !line.fx.hasProof && live.onUploadFxProof && (
            <FormField label="Statement for the rate" helper="Your card or forex statement showing the rate you paid.">
              <FileUpload accept={['.jpg', '.jpeg', '.png', '.pdf']} multiple={false} upload={async (file) => {
                try {
                  await live.onUploadFxProof!(line.id, file);
                } catch (e) {
                  throw new Error(errorText(e));
                }
                toast({ tone: 'success', title: 'Statement added' });
              }} />
            </FormField>
          )}
          {!line?.hasReceipt && ck !== 'mileage' && ck !== 'per_diem' && <Checkbox checked={declared} onChange={setDeclared} label="I have no receipt; I declare I spent this for work" />}
          <Checkbox checked={companyPaid} onChange={setCompanyPaid} label="The company paid this (card or booking): record it, do not pay me" />
          {cat?.gstEligible && (
            <Card title="GST on the bill">
              <p className="yx-ops-muted">Optional. When the bill is in the company&apos;s name, your company can claim the GST back.</p>
              <FieldRow>
                <FormField id="ln-gstin" label="Supplier GSTIN" optional helper={said('gstin')} error={v.errorOf('ln-gstin')}>
                  <TextField value={gstin} onChange={(x) => setGstin(x.toUpperCase())} maxLength={15} />
                </FormField>
                <FormField label="Invoice number" optional helper={said('invoiceNo')}>
                  <TextField value={invoice} onChange={setInvoice} maxLength={40} />
                </FormField>
              </FieldRow>
              <FieldRow>
                <FormField label="Taxable value" optional helper={said('taxableValue')}>
                  <TextField value={taxable} onChange={setTaxable} inputMode="decimal" maxLength={15} />
                </FormField>
                <FormField label="IGST" optional helper={said('igst')}>
                  <TextField value={igst} onChange={setIgst} inputMode="decimal" maxLength={15} />
                </FormField>
              </FieldRow>
              <FieldRow>
                <FormField label="CGST" optional helper={said('cgst')}>
                  <TextField value={cgst} onChange={setCgst} inputMode="decimal" maxLength={15} />
                </FormField>
                <FormField label="SGST" optional helper={said('sgst')}>
                  <TextField value={sgst} onChange={setSgst} inputMode="decimal" maxLength={15} />
                </FormField>
              </FieldRow>
            </Card>
          )}
        </>
      )}
    </div>
  );
  const title = line ? `Line ${line.lineNo}` : 'Add a line';
  const confirm = receiptOnly ? 'Done' : line?.ocr && !line.ocr.confirmed ? 'Confirm line' : line ? 'Save line' : 'Add line';
  if (phone)
    return (
      <BottomSheet open onOpenChange={(o) => !o && onClose()} title={title} footer={<Button variant="primary" fullWidth loading={saving} onClick={() => void save()}>{confirm}</Button>}>
        {body}
      </BottomSheet>
    );
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={title} subtitle={line?.ocr && !line.ocr.confirmed ? 'We read these values from the receipt. Check each one; saving confirms them.' : undefined} size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void save()}>{confirm}</Button></>}>
      {body}
    </Drawer>
  );
}

export function ReasonDialog({ title, consequence, label, confirm, destructive, onClose, onConfirm }: { title: string; consequence: string; label: string; confirm: string; destructive?: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const early = useTooEarly(reason.trim().length < 3 ? [{ fieldId: 'rs-reason', message: 'Enter a reason of at least 3 characters. The employee sees it.' }] : []);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={title}
      consequence={consequence}
      confirmLabel={confirm}
      confirmVariant={destructive ? 'danger' : 'primary'}
      onConfirm={async () => {
        if (early.stop()) return false;
        await onConfirm(reason.trim());
        onClose();
      }}
    >
      <FormField id="rs-reason" label={label} required error={early.errorOf('rs-reason')}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

function LoadingOrError({ state, onRetry, title, phone }: { state: LoadState; onRetry: () => void; title: string; phone: boolean }) {
  const inner =
    state === 'loading' ? (
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading the claim">
        <Skeleton height={96} />
        <Skeleton height={240} />
      </div>
    ) : (
      <ErrorState title="We couldn't load this claim." description="It may have been removed, or the connection dropped. Nothing has changed." onRetry={onRetry} />
    );
  if (phone) return <PhoneFrame tab="pay" title={title}>{inner}</PhoneFrame>;
  return (
    <OpsDesk area="expenses" active="Claims">
      <PageHeader title={title} />
      {inner}
    </OpsDesk>
  );
}

export function LiveClaimComposer({ live }: { live: LiveClaim }) {
  const phone = useNarrow();
  const c = live.claim;
  const { busy, act, toast } = useAct();
  const [sheet, setSheet] = useState<{ line: ClaimLine | null; kind: AddKind } | null>(live.startAdd ? { line: null, kind: live.startAdd } : null);
  const [removing, setRemoving] = useState<ClaimLine | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  if (live.state !== 'ready' || !c) return <LoadingOrError state={live.state} onRetry={live.onRetry} title="Claim" phone={phone} />;
  const editable = c.can.edit;
  const net = paise(c.netPayable);
  const lead = (
    <MoneyLead
      label={net < 0 ? 'You will return' : 'You will receive'}
      amount={Math.abs(net) / 100}
      currency={c.currency}
      tone={net < 0 ? 'warning' : 'default'}
      sub={`${money(c.currency, c.claimedTotal)} claimed${paise(c.advanceAdjusted) ? ` − ${money(c.currency, c.advanceAdjusted)} advance` : ''}. ${c.status === 'draft' || c.status === 'sent_back' ? 'Final amount after approval.' : c.payment ? paymentText(c.paymentStatus, c.payment) : ''}`}
    />
  );
  const submit = () =>
    act('submit', async () => {
      setBlockers([]);
      if (!c.lines.length) throw new Error('Add a line first: a receipt, mileage or per diem.');
      try {
        const done = (await live.onSubmit()) as ClaimDetail | undefined;
        const who = done?.route?.steps[0]?.approvers?.join(', ');
        toast({ tone: 'success', title: c.status === 'sent_back' ? 'Claim sent again' : 'Claim submitted', description: `${c.title} went to ${who || 'your approver'} for approval.${c.status === 'sent_back' ? ' Approval starts over.' : ''}` });
      } catch (e) {
        const b = (e as { body?: { blockers?: { text: string }[] } }).body?.blockers;
        if (b?.length) setBlockers(b.map((x) => x.text));
        throw e;
      }
    });
  const blocked = c.lines.some((l) => lineChecks(l, c.currency).some((x) => x.tone === 'danger'));
  const cats = live.categories;
  const body = (
    <div className="yx-ops-stack">
      {phone && lead}
      {c.decisionNote && (c.status === 'sent_back' || c.status === 'rejected') && <InlineAlert tone={c.status === 'rejected' ? 'danger' : 'warning'} title={c.status === 'rejected' ? 'Rejected' : 'Sent back to you'}>{c.decisionNote}</InlineAlert>}
      {blockers.length > 0 && (
        <InlineAlert tone="danger" title="Fix these to submit the claim">
          <ul className="yx-ops-plain">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      {c.lines.length === 0 ? (
        <EmptyState compact title="No lines yet." description="Add a receipt, mileage or per diem." />
      ) : (
        c.lines.map((l) => <LiveLineCard key={l.id} line={l} claim={c} categories={cats} editable={editable} act={act} busy={busy} live={live} onEdit={() => setSheet({ line: l, kind: 'bill' })} onRemove={() => setRemoving(l)} />)
      )}
      {editable && blocked && <InlineAlert tone="danger">Remove or fix the blocked line to submit.</InlineAlert>}
    </div>
  );
  const status = <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>;
  const overlays = (
    <>
      {sheet && <LineSheet phone={phone} line={sheet.line} start={sheet.kind} categories={cats} today={live.today} currency={c.currency} live={live} onClose={() => setSheet(null)} />}
      {removing && (
        <ConfirmDialog open onOpenChange={(o) => !o && setRemoving(null)} title={`Remove line ${removing.lineNo}?`} consequence="The line and its receipt leave this claim." confirmLabel="Remove line" destructive onConfirm={async () => {
          await live.onRemoveLine(removing.id);
          toast({ tone: 'success', title: `Line ${removing.lineNo} removed` });
        }} />
      )}
    </>
  );
  if (phone)
    return (
      <PhoneFrame tab="pay" title={c.title} back={<IconButton icon={ArrowLeft} label="Back to expenses" onClick={live.onBack} />} hideTabs>
        {body}
        {editable && (
          <div className="yx-ops-stack" data-gap="sm">
            <Button icon={Camera} fullWidth onClick={() => setSheet({ line: null, kind: 'receipt' })}>
              Add another receipt
            </Button>
            <Button variant="primary" icon={Send} fullWidth loading={busy === 'submit'} onClick={() => void submit()}>
              Submit claim
            </Button>
          </div>
        )}
        {c.can.withdraw && (
          <Button fullWidth loading={busy === 'withdraw'} onClick={() => void act('withdraw', live.onWithdraw, 'Claim withdrawn. Change it and submit it again.')}>
            Withdraw to change it
          </Button>
        )}
        {overlays}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="expenses" active="Claims">
      <PageHeader
        title={c.title}
        description={c.tripId ? 'Claim for a trip. One receipt per line; policy checks show on each line.' : 'One receipt per line; policy checks show on each line.'}
        status={status}
        actions={
          editable ? (
            <>
              <Button icon={Receipt} onClick={() => setSheet({ line: null, kind: 'receipt' })}>
                Add line
              </Button>
              <Button onClick={() => (toast({ tone: 'success', title: 'Draft saved', description: 'Every line is saved as you add it. Find the claim under My claims.' }), live.onBack())}>Save draft</Button>
              <Button variant="primary" icon={Send} loading={busy === 'submit'} onClick={() => void submit()}>
                Submit claim
              </Button>
            </>
          ) : (
            <>
              {c.tripId && live.onOpenTrip && <Button icon={Plane} onClick={() => live.onOpenTrip!(c.tripId!)}>Open trip</Button>}
              {c.can.withdraw && (
                <Button icon={RotateCcw} loading={busy === 'withdraw'} onClick={() => void act('withdraw', live.onWithdraw, 'Claim withdrawn. Change it and submit it again.')}>
                  Withdraw to change it
                </Button>
              )}
              <Button icon={ArrowLeft} onClick={live.onBack}>Back to expenses</Button>
            </>
          )
        }
      />
      <Workspace
        main={body}
        rail={
          <>
            {lead}
            {editable && cats.some((x) => x.gstEligible) && <p className="yx-ops-muted">GST capture is on for your company. Check the supplier GSTIN on each line.</p>}
            {c.route && (
              <Card title="Approvals">
                <ApprovalTimeline now={new Date()} steps={approvalSteps(c)} />
              </Card>
            )}
          </>
        }
      />
      {overlays}
    </OpsDesk>
  );
}

/* ================================================================== EXP-03 · Claim review (live) */

function ReduceDrawer({ line, currency, reject, onClose, onSave }: { line: ClaimLine; currency: string; reject: boolean; onClose: () => void; onSave: (amount: string, reason: string) => Promise<unknown> }) {
  const [newAmt, setNewAmt] = useState<number | null>(reject ? 0 : amount(line.approved ?? line.claimed));
  const [reason, setReason] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const typed = newAmt === null ? null : moneyInput(String(newAmt));
  const errs = [
    ...(typed === null ? [{ fieldId: 'cr-amount', message: 'Enter the amount to approve, with at most 2 decimals.' }] : paise(typed) > paise(line.claimed) ? [{ fieldId: 'cr-amount', message: `Enter at most ${money(currency, line.claimed)}, the amount claimed.` }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'cr-reason', message: 'Enter a reason. The employee sees it next to the amount.' }] : []),
  ];
  const early = useTooEarly(errs);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={reject ? 'Reject this line' : 'Reduce the approved amount'}
      subtitle={`${line.lineNo}. ${line.merchant ?? ''} · claimed ${money(currency, line.claimed)}`}
      notice={failed ? <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={async () => {
              if (early.stop()) return;
              setSaving(true);
              setFailed(null);
              try {
                await onSave(Number(typed).toFixed(2), reason.trim());
                onClose();
              } catch (e) {
                setFailed(errorText(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {reject ? 'Reject line' : 'Save reduction'}
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {!reject && (
          <FormField id="cr-amount" label="Approve" required error={early.errorOf('cr-amount')}>
            <CurrencyField value={newAmt} onChange={setNewAmt} allowPaise />
          </FormField>
        )}
        <FormField id="cr-reason" label="Reason" required error={early.errorOf('cr-reason')}>
          <TextField value={reason} onChange={setReason} maxLength={300} />
        </FormField>
        <InlineAlert tone="info">The employee will see: “{cutText(currency, typed ?? '0', line.claimed, reason.trim() || '…') ?? `Approved ${money(currency, line.claimed)}`}”</InlineAlert>
      </div>
    </Drawer>
  );
}

export function LiveClaimReview({ live }: { live: LiveClaim }) {
  const c = live.claim;
  const { busy, act, toast } = useAct();
  const [sel, setSel] = useState<string | null>(null);
  const [reduce, setReduce] = useState<{ line: ClaimLine; reject: boolean } | null>(null);
  const [deciding, setDeciding] = useState<'reject' | 'send_back' | null>(null);
  const [flagging, setFlagging] = useState<{ id: string; decision: 'clear' | 'confirm' } | null>(null);
  if (live.state !== 'ready' || !c) return <LoadingOrError state={live.state} onRetry={live.onRetry} title="Claim" phone={false} />;
  const cur = c.currency;
  const line = c.lines.find((l) => l.id === sel) ?? c.lines[0] ?? null;
  const flagged = c.lines.filter((l) => lineChecks(l, cur, c.flags).length > 0);
  const changed = c.lines.some((l) => l.approved !== null && paise(l.approved) < paise(l.claimed));
  const cats = live.categories;
  const openFlags = line ? c.flags.filter((f) => f.lineId === line.id && f.status === 'open') : [];
  const claimFlags = c.flags.filter((f) => f.lineId === null && f.status === 'open');
  return (
    <OpsDesk area="expenses" active="Claims">
      <ObjectHeader
        name={c.title}
        icon={FileText}
        secondary={<span>{c.person}{c.submittedAt ? ` · submitted ${formatDate(day(c.submittedAt))}` : ''}{c.tripId ? ' · on a trip' : ''}</span>}
        status={
          <>
            <ClaimStatusBadges c={c} />
            {flagged.length > 0 && <Badge tone="warning">{flagged.length} {flagged.length === 1 ? 'line' : 'lines'} flagged</Badge>}
          </>
        }
        facts={[
          { label: 'Claimed', value: money(cur, c.claimedTotal) },
          { label: 'Advance adjusted', value: money(cur, c.advanceAdjusted) },
          { label: 'Net payable', value: money(cur, c.netPayable) },
        ]}
        actions={
          c.can.decide ? (
            <>
              <Button icon={RotateCcw} onClick={() => setDeciding('send_back')}>Send back</Button>
              <Button icon={X} onClick={() => setDeciding('reject')}>Reject</Button>
              <Button variant="primary" loading={busy === 'approve'} onClick={() => void act('approve', () => live.onDecide('approve', ''), changed ? 'Claim approved with your changes' : 'Claim approved')}>
                {changed ? 'Approve with changes' : 'Approve all'}
              </Button>
            </>
          ) : (
            <Button icon={ArrowLeft} onClick={live.onBack}>Back to expenses</Button>
          )
        }
      />
      {c.can.review && <InlineAlert tone="info" title="Finance audit step">This claim has flagged lines (over limit, missing receipt, duplicates). Clear or confirm each flag before it goes to payment.</InlineAlert>}
      {c.decisionNote && <InlineAlert tone={c.status === 'rejected' ? 'danger' : 'warning'} title="Approver's note">{c.decisionNote}</InlineAlert>}
      {c.can.review && claimFlags.length > 0 && (
        <Card title="Flags on the whole claim">
          <FlagList flags={claimFlags} onFlag={(id, decision) => setFlagging({ id, decision })} />
        </Card>
      )}
      <Workspace
        main={
          <Card title="Lines">
            <DataTable
              label="Claim lines"
              columns={[
                { key: 'n', header: '#', value: (l: ClaimLine) => l.lineNo, width: 50 },
                { key: 'c', header: 'Category', value: (l) => catName(cats, l.categoryCode) },
                { key: 'd', header: 'Date', type: 'date', value: (l) => day(l.spentOn) },
                { key: 'a', header: 'Claimed', value: (l) => amount(l.claimed), render: (l) => money(cur, l.claimed) },
                {
                  key: 'f',
                  header: 'Policy',
                  value: (l) => lineChecks(l, cur, c.flags).length,
                  render: (l) => {
                    const f = lineChecks(l, cur, c.flags);
                    return f.length ? <Badge tone={f.some((x) => x.tone === 'danger') ? 'danger' : 'warning'}>{[...new Set(f.map((x) => x.short))].join(', ')}</Badge> : <Badge tone="success">Within policy</Badge>;
                  },
                  width: 180,
                },
                {
                  key: 's',
                  header: 'Decision',
                  value: (l) => (l.approved === null ? '' : l.approved),
                  render: (l) => (l.approved === null || paise(l.approved) >= paise(l.claimed) ? '—' : paise(l.approved) === 0 ? <Badge tone="danger">Rejected</Badge> : <Badge tone="warning">Reduced to {money(cur, l.approved)}</Badge>),
                },
              ]}
              rows={c.lines}
              getRowId={(l) => l.id}
              onRowClick={(l) => setSel(l.id)}
              activeRowId={line?.id}
              empty={<EmptyState compact title="No lines on this claim." />}
              rowButtons={
                c.can.changeAmounts
                  ? (l) => (
                      <>
                        <Button size="sm" onClick={() => setReduce({ line: l, reject: false })}>
                          Reduce
                        </Button>
                        <Button size="sm" onClick={() => setReduce({ line: l, reject: true })}>
                          Reject line
                        </Button>
                      </>
                    )
                  : undefined
              }
            />
          </Card>
        }
        rail={
          <>
            {line && (
              <Card title={`Line ${line.lineNo} receipt`}>
                <div className="yx-ops-stack" data-gap="sm">
                  {line.hasReceipt ? (
                    <>
                      <LineReceipt line={line} load={live.onReceiptUrl} />
                      <Button size="sm" loading={busy === `v-${line.id}`} onClick={() => void act(`v-${line.id}`, () => live.onOpenReceipt(line.id))}>
                        View receipt
                      </Button>
                    </>
                  ) : (
                    <p className="yx-ops-muted">No receipt: {line.mileage ? 'mileage is worked out from distance' : line.perDiem ? 'per diem is worked out from days' : line.selfDeclared ? 'the employee declared it was spent for work' : 'none attached'}.</p>
                  )}
                  {line.justification && <InlineAlert tone="info" title="Employee's reason">{line.justification}</InlineAlert>}
                  {line.fx?.hasProof && live.onOpenFxProof && (
                    <Button size="sm" loading={busy === `vf-${line.id}`} onClick={() => void act(`vf-${line.id}`, () => live.onOpenFxProof!(line.id))}>
                      View rate statement
                    </Button>
                  )}
                  {c.can.review && openFlags.length > 0 && <FlagList flags={openFlags} onFlag={(id, decision) => setFlagging({ id, decision })} />}
                </div>
              </Card>
            )}
            <Card title="Approvals">
              <ApprovalTimeline now={new Date()} steps={approvalSteps(c)} />
            </Card>
          </>
        }
      />
      {reduce && <ReduceDrawer line={reduce.line} currency={cur} reject={reduce.reject} onClose={() => setReduce(null)} onSave={async (a, r) => {
        await live.onApproveAmount(reduce.line.id, a, r);
        toast({ tone: 'success', title: reduce.reject ? `Line ${reduce.line.lineNo} rejected` : `Line ${reduce.line.lineNo} reduced` });
      }} />}
      {deciding && (
        <ReasonDialog
          title={deciding === 'reject' ? 'Reject this claim?' : 'Send it back?'}
          consequence={deciding === 'reject' ? 'The claim closes and the employee sees your reason.' : 'The employee changes it and submits it again; approval starts over.'}
          label={deciding === 'reject' ? 'Why not' : 'What should change'}
          confirm={deciding === 'reject' ? 'Reject claim' : 'Send back'}
          destructive={deciding === 'reject'}
          onClose={() => setDeciding(null)}
          onConfirm={async (reason) => {
            await live.onDecide(deciding, reason);
            toast({ tone: 'success', title: deciding === 'reject' ? 'Claim rejected' : `Claim sent back to ${c.person} for changes` });
          }}
        />
      )}
      {flagging && (
        <ReasonDialog
          title={flagging.decision === 'clear' ? 'Clear this flag?' : 'Confirm this flag?'}
          consequence={flagging.decision === 'clear' ? 'Recorded with your note.' : 'A confirmed duplicate pays nothing for that bill; the employee sees why.'}
          label="Note"
          confirm={flagging.decision === 'clear' ? 'Clear flag' : 'Confirm flag'}
          destructive={flagging.decision === 'confirm'}
          onClose={() => setFlagging(null)}
          onConfirm={async (note) => {
            await live.onFlag(flagging.id, flagging.decision, note);
            toast({ tone: 'success', title: flagging.decision === 'clear' ? 'Flag cleared' : 'Flag confirmed' });
          }}
        />
      )}
    </OpsDesk>
  );
}

function FlagList({ flags, onFlag }: { flags: ClaimDetail['flags']; onFlag: (id: string, decision: 'clear' | 'confirm') => void }): ReactNode {
  return (
    <ul className="yx-ops-stack yx-ops-plain" data-gap="sm" aria-label="Flags to check">
      {flags.map((f) => (
        <li key={f.id} className="yx-ops-stack" data-gap="sm">
          <InlineAlert tone="warning">{`${FLAG_TEXT[f.kind] ?? f.kind}: ${f.detail}`}</InlineAlert>
          <Actions>
            <Button size="sm" onClick={() => onFlag(f.id, 'clear')}>Clear</Button>
            <Button size="sm" variant="danger" onClick={() => onFlag(f.id, 'confirm')}>Confirm</Button>
          </Actions>
        </li>
      ))}
    </ul>
  );
}
