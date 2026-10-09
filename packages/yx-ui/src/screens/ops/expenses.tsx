// Expenses screens (M05), under Pay: EXP-01 expenses home, EXP-02 claim composer, EXP-03 claim review, EXP-04 trip,
// EXP-05 advance card + request.
import { useState } from 'react';
import { ArrowLeft, Camera, Car, Check, FileText, Plane, Plus, Receipt, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { RadioGroup, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { DataTable } from '../../components/table';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { BottomSheet } from '../../components/overlay';
import { ApprovalTimeline } from '../../components/timeline';
import { NeedsActionList } from '../../components/dashboard';
import { StatCard } from '../../components/charts';
import { formatDate, formatINR } from '../../lib/format';
import { Actions, CameraFrame, CardGrid, Facts, MoneyLead, OpsDesk, ReceiptImage, StatusTrail, Workspace, type CameraState } from './ops-kit';
import { checkLine, flagText, fxFlagged, fxVariancePct, mileageAmount, perDiemAmount, recoveryInstalments, reductionText, settlement } from './ops-rules';
import type { ListState } from './helpdesk';
import type { ApprovalStatus, Claim, ExpenseLine, PaymentStatus } from './expenses-data';

export type Device = 'desk' | 'phone';
export type ExpPersona = 'emp' | 'mgr' | 'fin';

export const lineApproved = (l: ExpenseLine) => l.approved ?? l.amount;
export function claimTotals(c: Claim) {
  const claimed = c.lines.reduce((s, l) => s + l.amount, 0);
  const approved = c.lines.reduce((s, l) => s + lineApproved(l), 0);
  return { claimed, approved, ...settlement(approved, c.advanceAdjusted) };
}
const STATUS_TONE: Record<ApprovalStatus, BadgeTone> = { Draft: 'neutral', Submitted: 'info', Approved: 'success', 'Partly approved': 'warning', Rejected: 'danger', 'Sent back': 'warning' };
const PAY_TONE: Record<PaymentStatus, BadgeTone> = { 'Not due': 'neutral', 'Approved, unpaid': 'warning', 'In October payroll': 'info', Paid: 'success', 'Payment failed': 'danger', 'Direct payout queued': 'info' };
export function ClaimBadges({ c }: { c: Claim }) {
  return (
    <span className="yx-ops-row">
      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
      {c.status !== 'Rejected' && c.status !== 'Draft' && c.status !== 'Submitted' && <Badge tone={PAY_TONE[c.payment]}>{c.payment === 'In October payroll' ? 'Payment in October payroll' : c.payment}</Badge>}
    </span>
  );
}

/* =========================================================================================
 * EXP-01 · Expenses home (T6, D+M, Emp / Mgr / Fin)
 * ======================================================================================= */

export interface ExpensesHomeProps {
  device?: Device;
  persona?: ExpPersona;
  claims: Claim[];
  toPay: Claim[];
  today: Date;
  state?: ListState;
}
export function ExpensesHomeScreen({ device = 'desk', persona = 'emp', claims, toPay, today, state = 'ready' }: ExpensesHomeProps) {
  const pending = claims.filter((c) => c.status === 'Submitted' || (c.status !== 'Rejected' && c.payment !== 'Paid' && c.payment !== 'Not due'));
  const toReceive = claims.filter((c) => c.status === 'Submitted' || (c.status !== 'Rejected' && c.payment !== 'Paid')).reduce((s, c) => s + claimTotals(c).netPayable, 0);
  const claimList =
    state === 'loading' ? (
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading claims">
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    ) : state === 'error' ? (
      <ErrorState title="We couldn't load your claims." description="Try again in a moment." onRetry={() => {}} reference="EXP-HOME-118" />
    ) : state === 'empty' || claims.length === 0 ? (
      <EmptyState compact title="No claims yet." description="Snap a receipt to start one. Each receipt becomes a line." action={<Button variant="primary" icon={Camera}>Snap a receipt</Button>} />
    ) : (
      <ul className="yx-ops-stack yx-ops-plain" data-gap="sm" aria-label="My claims">
        {claims.map((c) => {
          const t = claimTotals(c);
          const cut = c.lines.find((l) => l.approved != null && l.approved < l.amount);
          return (
            <li key={c.id} className="yx-ops-tile">
              <div className="yx-ops-tile__row">
                <span className="yx-ops-tile__title">{c.title}</span>
                <span className="yx-ops-tile__amount">{c.status === 'Rejected' ? formatINR(0) : formatINR(t.netPayable)}</span>
              </div>
              <div className="yx-ops-tile__row">
                <span className="yx-ops-muted">
                  <span className="yx-ops-mono">{c.id}</span> · {c.lines.length} {c.lines.length === 1 ? 'line' : 'lines'} · {formatDate(c.submitted)}
                </span>
                <ClaimBadges c={c} />
              </div>
              {cut && <span className="yx-ops-muted">{reductionText(lineApproved(cut), cut.amount, cut.reason)}</span>}
              {c.status === 'Rejected' && <span className="yx-ops-muted">Rejected: {c.lines[0].reason}</span>}
            </li>
          );
        })}
      </ul>
    );

  if (device === 'phone')
    return (
      <PhoneFrame tab="pay" title="Expenses" back={<IconButton icon={ArrowLeft} label="Back to Pay" />}>
        <MoneyLead label="You will receive" amount={toReceive} sub={`From ${pending.length} claims in progress`} />
        <Button variant="primary" icon={Camera} fullWidth>
          Snap a receipt
        </Button>
        <Actions>
          <Button icon={Plane}>Request a trip</Button>
          <Button icon={Car}>Add mileage</Button>
        </Actions>
        <h2 className="yx-ops-card__title">My claims</h2>
        {claimList}
      </PhoneFrame>
    );

  if (persona === 'mgr')
    return (
      <OpsDesk area="expenses" active="Expenses home">
        <PageHeader title="Expenses" description="Claims and trips waiting for you, and your team's spend." />
        <NeedsActionList
          title="Waiting for you"
          today={today}
          viewAllHref="#approvals"
          total={4}
          loading={state === 'loading'}
          items={[
            { id: 'a1', type: 'Expense', title: `Mumbai distributor meet · ${formatINR(19794)} · 2 policy flags`, who: 'Vikram Rao', due: new Date(2026, 8, 30), kind: 'review' },
            { id: 'a2', type: 'Trip', title: 'Dubai trade show, 2–6 Nov · advance USD 500', who: 'Sana Nizami', due: new Date(2026, 9, 1), kind: 'review' },
            { id: 'a3', type: 'Expense', title: `Internet, Sep · ${formatINR(999)}`, who: 'Priya Menon', due: new Date(2026, 9, 2), kind: 'approve' },
          ]}
          onApprove={() => {}}
          onReview={() => {}}
        />
        <CardGrid min="sm">
          <StatCard label="Team spend, September" value={184320} money previous={162400} previousLabel="August" trend={[140200, 151900, 170300, 162400, 184320]} drill={{ label: 'View team claims', href: '#team' }} />
          <StatCard label="Over-limit lines" value={3} previous={5} previousLabel="August" drill={{ label: 'View over-limit lines', href: '#over' }} />
        </CardGrid>
      </OpsDesk>
    );

  if (persona === 'fin') {
    const unpaid = toPay.filter((c) => c.payment !== 'Paid');
    return (
      <OpsDesk area="expenses" active="Expenses home" counts={{ 'To pay': unpaid.length }}>
        <PageHeader title="Expenses" description="What to pay, flagged claims and advances past their settlement window." actions={<Button variant="primary">Open to-pay queue</Button>} />
        <CardGrid min="sm">
          <StatCard label="To pay" value={unpaid.reduce((s, c) => s + claimTotals(c).netPayable, 0)} money drill={{ label: `View ${unpaid.length} claims`, href: '#topay' }} />
          <StatCard label="Payment failed" value={toPay.filter((c) => c.payment === 'Payment failed').length} drill={{ label: 'Re-route failed payments', href: '#failed' }} />
          <StatCard label="Flagged for audit" value={4} drill={{ label: 'Duplicates, missing GST, over limit', href: '#audit' }} />
          <StatCard label="Advances overdue" value={3} drill={{ label: 'View advance ageing', href: '#ageing' }} />
        </CardGrid>
        <Card title="October payroll cut-off">
          <p className="yx-ops-p">Claims approved by 23 Oct 2026 are paid in the October payroll. {unpaid.filter((c) => c.route !== 'Direct payout').length} claims are queued for it.</p>
        </Card>
      </OpsDesk>
    );
  }

  return (
    <OpsDesk area="expenses" active="Expenses home">
      <PageHeader
        title="Expenses"
        description="Your claims, trips and advances."
        actions={
          <>
            <Button icon={Plane}>Request a trip</Button>
            <Button variant="primary" icon={Plus}>
              New claim
            </Button>
          </>
        }
      />
      <Workspace
        main={<Card title="My claims">{claimList}</Card>}
        rail={
          <>
            <MoneyLead label="You will receive" amount={toReceive} sub="Approved claims are paid in the next payroll unless finance pays sooner" />
            <Card title="Open advance">
              <Facts items={[{ label: 'ADV-0087 balance', value: formatINR(0) }, { label: 'Settle by', value: '16 Oct 2026' }]} />
            </Card>
          </>
        }
      />
    </OpsDesk>
  );
}

/* =========================================================================================
 * EXP-02 · Claim composer (T4 / T8, D+M, Emp)
 * ======================================================================================= */

export function LineCard({ line, index, onRemove, gstOn, editable = true }: { line: ExpenseLine; index: number; onRemove?: () => void; gstOn?: boolean; editable?: boolean }) {
  const [justification, setJustification] = useState(line.justification ?? '');
  const [confirmed, setConfirmed] = useState(line.kind !== 'field-draft');
  const [entered, setEntered] = useState<number | null>(line.fx?.entered ?? null);
  const amount = line.kind === 'mileage' || line.kind === 'field-draft' ? mileageAmount(line.km ?? 0, line.rate ?? 0) : line.kind === 'per-diem' ? perDiemAmount(line.days ?? 0, line.rate ?? 0) : line.fx ? Math.round(line.fx.amount * (entered ?? line.fx.rate)) : line.amount;
  const flags = checkLine({ amount, hasReceipt: line.receipt, duplicateOf: line.duplicateOf }, { perLine: line.limit, receiptAbove: 500, hardBlock: line.hardBlock });
  const over = flags.find((f) => f.kind === 'over-limit');
  return (
    <article className="yx-ops-card" data-tone={flags.some((f) => (f.kind === 'over-limit' && f.blocked) || f.kind === 'duplicate') ? 'danger' : flags.length ? 'warning' : undefined} aria-label={`Line ${index + 1}, ${line.category}`}>
      <div className="yx-ops-card__head">
        <h3 className="yx-ops-card__title">
          {index + 1}. {line.category}
        </h3>
        <span className="yx-ops-row">
          {line.ocr && <Badge tone="ai">Read from receipt</Badge>}
          {line.kind === 'field-draft' && <Badge tone="info">From field visits</Badge>}
          <strong>{formatINR(amount)}</strong>
          {editable && onRemove && <IconButton icon={Trash2} label={`Remove line ${index + 1}`} onClick={onRemove} />}
        </span>
      </div>
      <div className="yx-ops-split">
        {line.receipt ? <ReceiptImage merchant={line.merchant} amount={line.fx ? line.fx.amount : line.amount} date={line.date} /> : <div className="yx-ops-muted">{line.kind === 'mileage' || line.kind === 'field-draft' ? 'Distance claim: no receipt needed' : line.kind === 'per-diem' ? 'Per diem: no receipt needed' : 'No receipt attached'}</div>}
        <div className="yx-ops-stack" data-gap="sm">
          <DescriptionList
            items={[
              { label: 'Date', value: formatDate(line.date) },
              { label: line.kind === 'mileage' || line.kind === 'field-draft' ? 'Trip' : 'Merchant', value: line.merchant },
              { label: 'City', value: `${line.city} (${line.tier})` },
              { label: 'Paid by', value: line.mode },
              ...(line.kind === 'mileage' || line.kind === 'field-draft' ? [{ label: 'Worked out', value: `${line.km} km × ₹${line.rate} per km (car)` }] : []),
              ...(line.kind === 'per-diem' ? [{ label: 'Worked out', value: `${line.days} days × ${formatINR(line.rate ?? 0)} per day` }] : []),
              ...(line.limit ? [{ label: 'Policy limit', value: `${formatINR(line.limit)} for your grade in ${line.tier}` }] : []),
            ]}
          />
          {line.fx && (
            <div className="yx-ops-stack" data-gap="sm">
              <p className="yx-ops-muted">
                {line.fx.currency} {line.fx.amount.toLocaleString('en-IN')} at {line.fx.rate} ({line.fx.source}, {formatDate(line.fx.rateDate)})
              </p>
              <FormField label="Rate you actually paid" optional helper="Needs your card or forex statement">
                <NumberField value={entered} onChange={setEntered} decimals />
              </FormField>
              {entered != null && fxFlagged(entered, line.fx.rate) && <InlineAlert tone="warning">Your rate is {fxVariancePct(entered, line.fx.rate)} % above the reference rate. Your approver will see both. Attach the statement.</InlineAlert>}
            </div>
          )}
          {gstOn && line.gst && (
            <DescriptionList
              items={[
                { label: 'Supplier GSTIN', value: line.gst.gstin, mono: true },
                { label: 'Invoice', value: line.gst.invoice, mono: true },
                { label: 'Taxable value', value: formatINR(line.gst.taxable) },
                { label: 'Tax', value: line.gst.igst ? `IGST ${formatINR(line.gst.igst)}` : `CGST ${formatINR(line.gst.cgst)} · SGST ${formatINR(line.gst.sgst)}` },
              ]}
            />
          )}
        </div>
      </div>
      {flags.map((f) => (
        <InlineAlert key={f.kind} tone={(f.kind === 'over-limit' && f.blocked) || f.kind === 'duplicate' ? 'danger' : 'warning'}>
          {f.kind === 'duplicate' ? `${flagText(f)}. Exact duplicates can't be submitted.` : flagText(f)}
        </InlineAlert>
      ))}
      {over && !over.blocked && (
        <FormField label="Why it's over the limit" required error={justification.trim() ? null : 'Add a reason so your approver can decide on the excess.'}>
          <TextArea value={justification} onChange={setJustification} rows={2} />
        </FormField>
      )}
      {line.kind === 'field-draft' && !confirmed && (
        <Actions>
          <Button size="sm" icon={Check} onClick={() => setConfirmed(true)}>
            Confirm distance
          </Button>
          <Button size="sm">Edit distance</Button>
        </Actions>
      )}
    </article>
  );
}

export interface ClaimComposerProps {
  device?: Device;
  title: string;
  lines: ExpenseLine[];
  advance: number;
  gstOn?: boolean;
  camera?: CameraState | null;
  submitted?: boolean;
  trip?: string;
}
export function ClaimComposerScreen({ device = 'desk', title, lines: initial, advance, gstOn, camera = null, submitted, trip }: ClaimComposerProps) {
  const [lines, setLines] = useState(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState('receipt');
  const [km, setKm] = useState<number | null>(42);
  const total = lines.reduce((s, l) => s + (l.kind === 'mileage' || l.kind === 'field-draft' ? mileageAmount(l.km ?? 0, l.rate ?? 0) : l.kind === 'per-diem' ? perDiemAmount(l.days ?? 0, l.rate ?? 0) : l.fx ? Math.round(l.fx.amount * (l.fx.entered ?? l.fx.rate)) : l.amount), 0);
  const s = settlement(total, advance);
  const blocked = lines.some((l) => checkLine({ amount: l.amount, hasReceipt: l.receipt, duplicateOf: l.duplicateOf }, { perLine: l.limit, receiptAbove: 500, hardBlock: l.hardBlock }).some((f) => f.kind === 'duplicate' || (f.kind === 'over-limit' && f.blocked)));
  const lead = (
    <MoneyLead
      label={s.toReturn ? 'You will return' : 'You will receive'}
      amount={s.toReturn || s.netPayable}
      tone={s.toReturn ? 'warning' : 'default'}
      sub={`${formatINR(total)} claimed${advance ? ` − ${formatINR(advance)} advance` : ''}. Final amount after approval.`}
    />
  );
  const addForm = (
    <div className="yx-ops-stack">
      <FormField label="What are you adding?">
        <RadioGroup
          value={kind}
          onChange={setKind}
          options={[
            { value: 'receipt', label: 'A receipt', description: 'We read merchant, date, amount and GST' },
            { value: 'mileage', label: 'Mileage', description: 'Distance × rate for your vehicle' },
            { value: 'perdiem', label: 'Per diem', description: 'Days × rate for the city tier' },
          ]}
        />
      </FormField>
      {kind === 'receipt' && <CameraFrame state={camera ?? 'ready'} />}
      {kind === 'mileage' && (
        <FieldRow>
          <FormField label="Distance (km)">
            <NumberField value={km} onChange={setKm} />
          </FormField>
          <FormField label="Amount" helper="₹17 per km for a car">
            <TextField value={formatINR(mileageAmount(km ?? 0, 17))} readOnly />
          </FormField>
        </FieldRow>
      )}
      {kind === 'perdiem' && <p className="yx-ops-muted">₹1,200 a day in Tier 1 cities for your grade.</p>}
    </div>
  );
  const body = submitted ? (
    <div className="yx-ops-stack">
      <InlineAlert tone="success" title="Claim submitted">
        {title} went to Sana Nizami for approval. Lines over the limit also go to the department head.
      </InlineAlert>
      {lead}
    </div>
  ) : (
    <div className="yx-ops-stack">
      {device === 'phone' && lead}
      {camera && device === 'phone' && <CameraFrame state={camera} />}
      {lines.length === 0 ? (
        <EmptyState compact title="No lines yet." description="Add a receipt, mileage or per diem." />
      ) : (
        lines.map((l, i) => <LineCard key={l.id} line={l} index={i} gstOn={gstOn} onRemove={() => setLines((x) => x.filter((y) => y.id !== l.id))} />)
      )}
      {blocked && <InlineAlert tone="danger">Remove or fix the blocked line to submit.</InlineAlert>}
    </div>
  );
  if (device === 'phone')
    return (
      <PhoneFrame tab="pay" title={title} back={<IconButton icon={ArrowLeft} label="Back to expenses" />} hideTabs>
        {body}
        {!submitted && (
          <div className="yx-ops-stack" data-gap="sm">
            <Button icon={Camera} fullWidth onClick={() => setAddOpen(true)}>
              Add another receipt
            </Button>
            <Button variant="primary" icon={Send} fullWidth disabled={blocked || lines.length === 0}>
              Submit claim
            </Button>
          </div>
        )}
        <BottomSheet open={addOpen} onOpenChange={setAddOpen} title="Add a line" footer={<Button variant="primary" fullWidth onClick={() => setAddOpen(false)}>Add line</Button>}>
          {addForm}
        </BottomSheet>
      </PhoneFrame>
    );
  return (
    <OpsDesk area="expenses" active="Claims">
      <PageHeader
        title={title}
        description={trip ? `Claim for trip ${trip}. One receipt per line; policy checks show on each line.` : 'One receipt per line; policy checks show on each line.'}
        status={<Badge tone={submitted ? 'info' : 'neutral'}>{submitted ? 'Submitted' : 'Draft'}</Badge>}
        actions={
          submitted ? undefined : (
            <>
              <Button icon={Receipt} onClick={() => setAddOpen(true)}>
                Add line
              </Button>
              <Button>Save draft</Button>
              <Button variant="primary" icon={Send} disabled={blocked || lines.length === 0}>
                Submit claim
              </Button>
            </>
          )
        }
      />
      <Workspace main={body} rail={submitted ? null : <>{lead}{gstOn && <p className="yx-ops-muted">GST capture is on for your company. Check the supplier GSTIN on each line.</p>}</>} />
      <Drawer open={addOpen} onOpenChange={setAddOpen} title="Add a line" footer={<><Button onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => setAddOpen(false)}>Add line</Button></>}>
        {addForm}
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * EXP-03 · Claim review (T3, Mgr / Fin)
 * ======================================================================================= */

export interface ClaimReviewProps {
  claim: Claim;
  today: Date;
  persona?: 'mgr' | 'fin';
  /** Line id being reduced (shows the reason field). */
  reducing?: string | null;
  reasonMissing?: boolean;
  selected?: string;
}
export function ClaimReviewScreen({ claim, today, persona = 'mgr', reducing = null, reasonMissing, selected }: ClaimReviewProps) {
  const [sel, setSel] = useState(selected ?? claim.lines[0].id);
  const [reduce, setReduce] = useState<string | null>(reducing);
  const [newAmt, setNewAmt] = useState<number | null>(reducing ? 7500 : null);
  const [reason, setReason] = useState(reasonMissing ? '' : 'Hotel cap Tier 1 for G4–G6');
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});
  const line = claim.lines.find((l) => l.id === sel)!;
  const t = claimTotals(claim);
  const flagged = claim.lines.filter((l) => checkLine({ amount: l.amount, hasReceipt: l.receipt, duplicateOf: l.duplicateOf }, { perLine: l.limit, receiptAbove: 500 }).length > 0);
  return (
    <OpsDesk area="expenses" active="Claims">
      <ObjectHeader
        name={claim.title}
        icon={FileText}
        secondary={
          <span>
            <span className="yx-ops-mono">{claim.id}</span> · {claim.employee}, {claim.role} · submitted {formatDate(claim.submitted)}
            {claim.trip ? ` · trip ${claim.trip}` : ''}
          </span>
        }
        status={
          <>
            <ClaimBadges c={claim} />
            {flagged.length > 0 && <Badge tone="warning">{flagged.length} lines flagged</Badge>}
          </>
        }
        facts={[
          { label: 'Claimed', value: formatINR(t.claimed) },
          { label: 'Advance adjusted', value: formatINR(claim.advanceAdjusted) },
          { label: 'Net payable', value: formatINR(t.netPayable) },
        ]}
        actions={
          <>
            <Button icon={RotateCcw}>Send back</Button>
            <Button icon={X}>Reject</Button>
            <Button variant="primary">{Object.keys(decisions).length || reduce ? 'Approve with changes' : persona === 'fin' ? 'Pass audit' : 'Approve all'}</Button>
          </>
        }
      />
      {persona === 'fin' && <InlineAlert tone="info" title="Finance audit step">This claim has flagged lines (over limit, missing receipt). Check them before it goes to payment.</InlineAlert>}
      <Workspace
        main={
          <Card title="Lines">
            <DataTable
              label="Claim lines"
              columns={[
                { key: 'n', header: '#', value: (l: ExpenseLine) => claim.lines.indexOf(l) + 1, width: 50 },
                { key: 'c', header: 'Category', value: (l) => l.category },
                { key: 'd', header: 'Date', type: 'date', value: (l) => l.date },
                { key: 'a', header: 'Claimed', type: 'money', value: (l) => l.amount, total: 'sum' },
                {
                  key: 'f',
                  header: 'Policy',
                  value: (l) => checkLine({ amount: l.amount, hasReceipt: l.receipt, duplicateOf: l.duplicateOf }, { perLine: l.limit, receiptAbove: 500 }).length,
                  render: (l) => {
                    const f = checkLine({ amount: l.amount, hasReceipt: l.receipt, duplicateOf: l.duplicateOf }, { perLine: l.limit, receiptAbove: 500 });
                    return f.length ? <Badge tone="warning">{f.map((x) => (x.kind === 'over-limit' ? 'Over limit' : x.kind === 'duplicate' ? 'Duplicate' : 'No receipt')).join(', ')}</Badge> : <Badge tone="success">Within policy</Badge>;
                  },
                  width: 180,
                },
                { key: 's', header: 'Decision', value: (l) => decisions[l.id] ?? (reduce === l.id ? 'reduced' : ''), render: (l) => (reduce === l.id ? <Badge tone="warning">Reduced</Badge> : decisions[l.id] ? <Badge tone={decisions[l.id] === 'approved' ? 'success' : 'danger'}>{decisions[l.id] === 'approved' ? 'Approved' : 'Rejected'}</Badge> : '—') },
              ]}
              rows={claim.lines}
              getRowId={(l) => l.id}
              onRowClick={(l) => setSel(l.id)}
              activeRowId={sel}
              rowButtons={(l) => (
                <>
                  <Button size="sm" onClick={() => setReduce(l.id)}>
                    Reduce
                  </Button>
                  <Button size="sm" onClick={() => setDecisions((d) => ({ ...d, [l.id]: 'rejected' }))}>
                    Reject line
                  </Button>
                </>
              )}
            />
          </Card>
        }
        rail={
          <>
            <Card title={`Line ${claim.lines.indexOf(line) + 1} receipt`}>
              {line.receipt ? <ReceiptImage merchant={line.merchant} amount={line.amount} date={line.date} /> : <p className="yx-ops-muted">No receipt: {line.kind === 'mileage' ? 'mileage is computed from distance' : line.kind === 'per-diem' ? 'per diem is computed from days' : `${formatINR(line.amount)} is above the ₹500 threshold`}.</p>}
              {line.justification && <InlineAlert tone="info" title="Employee's reason">{line.justification}</InlineAlert>}
            </Card>
            <Card title="Approvals">
              <ApprovalTimeline
                now={today}
                steps={[
                  { id: 's', label: 'Submitted', status: 'done', approver: claim.employee, at: claim.submitted },
                  { id: 'm', label: 'Manager approval', status: persona === 'fin' ? 'done' : 'current', approver: 'Sana Nizami', at: persona === 'fin' ? new Date(2026, 8, 18) : undefined },
                  { id: 'x', label: 'Department head (over-limit excess)', status: persona === 'fin' ? 'done' : 'pending', approver: 'Harish Bhat' },
                  { id: 'f', label: 'Finance audit', status: persona === 'fin' ? 'current' : 'pending', approver: 'Anita Desai' },
                ]}
              />
            </Card>
          </>
        }
      />
      <Drawer
        open={!!reduce}
        onOpenChange={(o) => !o && setReduce(null)}
        title="Reduce the approved amount"
        subtitle={reduce ? `${claim.lines.find((l) => l.id === reduce)?.category} · claimed ${formatINR(claim.lines.find((l) => l.id === reduce)?.amount ?? 0)}` : ''}
        footer={
          <>
            <Button onClick={() => setReduce(null)}>Cancel</Button>
            <Button variant="primary" disabled={!reason.trim()}>
              Save reduction
            </Button>
          </>
        }
      >
        {reduce && (
          <div className="yx-ops-stack">
            <FormField label="Approve" required>
              <CurrencyField value={newAmt} onChange={setNewAmt} />
            </FormField>
            <FormField label="Reason" required error={reason.trim() ? null : 'Enter a reason. The employee sees it next to the amount.'}>
              <TextField value={reason} onChange={setReason} />
            </FormField>
            <InlineAlert tone="info">The employee will see: “{reductionText(newAmt ?? 0, claim.lines.find((l) => l.id === reduce)!.amount, reason || '…')}”</InlineAlert>
          </div>
        )}
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * EXP-04 · Trip (request sheet + record)
 * ======================================================================================= */

export interface TripData {
  id: string;
  purpose: string;
  traveller: string;
  from: Date;
  to: Date;
  estimate: number;
  advance: number;
  status: 'Requested' | 'Approved' | 'Completed';
  legs: { id: string; from: string; to: string; date: Date; mode: string; booking: string; companyPaid: boolean }[];
  timeline: { label: string; at?: Date }[];
}
export function TripRequestForm() {
  const [from, setFrom] = useState<Date | null>(new Date(2026, 10, 2));
  const [to, setTo] = useState<Date | null>(new Date(2026, 10, 6));
  const [est, setEst] = useState<number | null>(145000);
  const [adv, setAdv] = useState<number | null>(40000);
  return (
    <div className="yx-ops-stack">
      <FormField label="Purpose" required>
        <TextField defaultValue="Dubai trade show, distributor meetings" />
      </FormField>
      <FieldRow>
        <FormField label="From" required>
          <DatePicker value={from} onChange={setFrom} />
        </FormField>
        <FormField label="To" required>
          <DatePicker value={to} onChange={setTo} min={from ?? undefined} />
        </FormField>
      </FieldRow>
      <Card title="Itinerary">
        <DataTable
          label="Legs"
          columns={[
            { key: 'f', header: 'From', value: (l: { f: string; t: string; m: string }) => l.f },
            { key: 't', header: 'To', value: (l) => l.t },
            { key: 'm', header: 'Mode', value: (l) => l.m },
          ]}
          rows={[
            { f: 'Bengaluru', t: 'Dubai', m: 'Air' },
            { f: 'Dubai', t: 'Bengaluru', m: 'Air' },
          ]}
          getRowId={(l) => l.f + l.t}
        />
        <Button size="sm" icon={Plus}>
          Add leg
        </Button>
      </Card>
      <FieldRow>
        <FormField label="Estimated cost" required>
          <CurrencyField value={est} onChange={setEst} />
        </FormField>
        <FormField label="Advance needed" helper="Paid before you travel; settled against your claims">
          <CurrencyField value={adv} onChange={setAdv} />
        </FormField>
      </FieldRow>
      <FormField label="Who books tickets and hotel?">
        <RadioGroup defaultValue="desk" options={[{ value: 'self', label: 'I book and upload them' }, { value: 'desk', label: 'Travel desk books (company paid, not reimbursed)' }]} />
      </FormField>
      <Switch label="Forex card advance" description="Advance in USD, settled in USD against your USD lines" />
    </div>
  );
}
export function TripScreen({ device = 'desk', trip, view = 'record', spent = 19794, settled }: { device?: Device; trip: TripData; view?: 'request' | 'record'; spent?: number; settled?: boolean }) {
  const s = settlement(spent, trip.advance);
  if (view === 'request') {
    if (device === 'phone')
      return (
        <PhoneFrame tab="pay" title="Request a trip" back={<IconButton icon={ArrowLeft} label="Back" />} hideTabs>
          <TripRequestForm />
          <Button variant="primary" fullWidth icon={Send}>
            Send for approval
          </Button>
        </PhoneFrame>
      );
    return (
      <OpsDesk area="expenses" active="Trips">
        <PageHeader title="Trips" />
        <Drawer open onOpenChange={() => {}} size="lg" title="Request a trip" subtitle="Your manager approves; an approved advance is created automatically." footer={<><Button>Cancel</Button><Button variant="primary">Send for approval</Button></>}>
          <TripRequestForm />
        </Drawer>
      </OpsDesk>
    );
  }
  const settlementCard = (
    <Card title="Settlement">
      <Facts
        items={[
          { label: 'Advance', value: formatINR(trip.advance) },
          { label: 'Spent (claims)', value: formatINR(spent) },
          { label: 'Company paid bookings', value: formatINR(5920) },
          s.toReturn ? { label: 'You return', value: formatINR(s.toReturn), tone: 'warning' } : { label: 'You receive', value: formatINR(s.netPayable), tone: 'success' },
        ]}
      />
      {s.toReturn > 0 && !settled && (
        <InlineAlert tone="warning" actions={<Button size="sm">Return by bank transfer</Button>}>
          Return {formatINR(s.toReturn)} by 16 Oct 2026. After that it is recovered from salary in up to 3 instalments.
        </InlineAlert>
      )}
      {settled && <InlineAlert tone="success">Settled on 29 Sep 2026.</InlineAlert>}
    </Card>
  );
  const body = (
    <>
      <StatusTrail steps={trip.timeline} current={trip.timeline.findIndex((x) => !x.at)} label="Trip timeline" />
      <Card title="Itinerary and bookings">
        <DataTable
          label="Itinerary"
          columns={[
            { key: 'd', header: 'Date', type: 'date', value: (l: TripData['legs'][number]) => l.date },
            { key: 'r', header: 'Route', value: (l) => `${l.from} → ${l.to}` },
            { key: 'm', header: 'Mode', value: (l) => l.mode },
            { key: 'b', header: 'Booking', value: (l) => l.booking, width: 300 },
          ]}
          rows={trip.legs}
          getRowId={(l) => l.id}
        />
      </Card>
      <Card title="Claims on this trip">
        <p className="yx-ops-p">
          EXP-1042 · {formatINR(spent)} · submitted 17 Sep 2026 · <Badge tone="info">Submitted</Badge>
        </p>
      </Card>
    </>
  );
  if (device === 'phone')
    return (
      <PhoneFrame tab="pay" title={trip.purpose} back={<IconButton icon={ArrowLeft} label="Back" />}>
        {settlementCard}
        {body}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="expenses" active="Trips">
      <ObjectHeader
        name={trip.purpose}
        icon={Plane}
        secondary={
          <span>
            <span className="yx-ops-mono">{trip.id}</span> · {trip.traveller} · {formatDate(trip.from)} to {formatDate(trip.to)}
          </span>
        }
        status={<Badge tone={settled ? 'success' : 'info'}>{settled ? 'Settled' : trip.status}</Badge>}
        facts={[
          { label: 'Estimate', value: formatINR(trip.estimate) },
          { label: 'Advance', value: formatINR(trip.advance) },
        ]}
        actions={<Button variant="primary">Add claim to this trip</Button>}
      />
      <Workspace main={body} rail={settlementCard} />
    </OpsDesk>
  );
}

/* =========================================================================================
 * EXP-05 · Advance card (balance ledger) + advance request
 * ======================================================================================= */

export interface AdvanceData {
  id: string;
  purpose: string;
  issued: Date;
  amount: number;
  windowEnds: Date;
  ledger: { id: string; date: Date; text: string; amount: number }[];
}
export interface AdvanceScreenProps {
  device?: Device;
  advance: AdvanceData;
  today: Date;
  requestOpen?: boolean;
  forex?: { currency: string; amount: number; spent: number; issueRate: number; returnRate: number; returnedOn: Date };
  persona?: 'emp' | 'fin';
}
export function AdvanceScreen({ device = 'desk', advance, today, requestOpen, forex, persona = 'emp' }: AdvanceScreenProps) {
  const [open, setOpen] = useState(!!requestOpen);
  const [amt, setAmt] = useState<number | null>(15000);
  const balance = advance.ledger.reduce((s, l) => s + l.amount, 0);
  const overdue = balance > 0 && advance.windowEnds < today;
  const inst = recoveryInstalments(balance);
  const card = (
    <Card title={`${advance.id} · ${advance.purpose}`}>
      <div className="yx-ops-stack">
        <Facts
          items={[
            { label: 'Paid', value: formatINR(advance.amount) },
            { label: 'Open balance', value: formatINR(balance), tone: overdue ? 'danger' : undefined },
            { label: 'Settle by', value: formatDate(advance.windowEnds) },
          ]}
        />
        {overdue && (
          <InlineAlert tone="danger" title="Settlement window ended">
            {persona === 'fin' ? `Recover ${formatINR(balance)} from salary in 3 instalments: ${inst.map((i) => formatINR(i)).join(', ')} (Oct, Nov, Dec payroll). Protected net pay applies.` : `Submit claims or return ${formatINR(balance)}. Otherwise it is recovered from salary in 3 instalments of about ${formatINR(inst[0])}.`}
          </InlineAlert>
        )}
        <DataTable
          label="Balance ledger"
          columns={[
            { key: 'd', header: 'Date', type: 'date', value: (l: AdvanceData['ledger'][number]) => l.date },
            { key: 't', header: 'What happened', value: (l) => l.text, width: 320 },
            { key: 'a', header: 'Amount', type: 'money', value: (l) => l.amount, total: 'sum' },
          ]}
          rows={advance.ledger}
          getRowId={(l) => l.id}
        />
        {forex && (
          <Card title={`Forex advance · ${forex.currency}`}>
            <DataTable
              label="Forex settlement"
              columns={[
                { key: 'l', header: 'Line', value: (r: { l: string; fc: string; inr: number }) => r.l, width: 260 },
                { key: 'f', header: forex.currency, value: (r) => r.fc },
                { key: 'i', header: 'INR', type: 'money', value: (r) => r.inr },
              ]}
              rows={[
                { l: `Advance loaded at ${forex.issueRate}`, fc: String(forex.amount), inr: Math.round(forex.amount * forex.issueRate) },
                { l: 'Spent on trip lines (same currency)', fc: String(-forex.spent), inr: -Math.round(forex.spent * forex.issueRate) },
                { l: `Returned ${formatDate(forex.returnedOn)} at ${forex.returnRate}`, fc: String(-(forex.amount - forex.spent)), inr: -Math.round((forex.amount - forex.spent) * forex.returnRate) },
                { l: 'Exchange difference (to exchange-difference account)', fc: '0', inr: Math.round((forex.amount - forex.spent) * (forex.returnRate - forex.issueRate)) },
              ]}
              getRowId={(r) => r.l}
            />
          </Card>
        )}
      </div>
    </Card>
  );
  const request = (
    <div className="yx-ops-stack">
      <FormField label="Type">
        <RadioGroup defaultValue="imprest" options={[{ value: 'trip', label: 'For a trip', description: 'Request it on the trip instead' }, { value: 'imprest', label: 'Standing imprest', description: 'Petty expenses at a site' }]} />
      </FormField>
      <FormField label="Amount" required>
        <CurrencyField value={amt} onChange={setAmt} />
      </FormField>
      <FormField label="Purpose" required>
        <TextArea rows={2} />
      </FormField>
      <p className="yx-ops-muted">Settle within 30 days of the end date with claims or a bank transfer.</p>
    </div>
  );
  if (device === 'phone')
    return (
      <PhoneFrame tab="pay" title="Advances" back={<IconButton icon={ArrowLeft} label="Back" />}>
        {card}
        <Button variant="primary" fullWidth onClick={() => setOpen(true)}>
          Request an advance
        </Button>
        <BottomSheet open={open} onOpenChange={setOpen} title="Request an advance" footer={<Button variant="primary" fullWidth>Send for approval</Button>}>
          {request}
        </BottomSheet>
      </PhoneFrame>
    );
  return (
    <OpsDesk area="expenses" active="Advances">
      <PageHeader title="Advances" description={persona === 'fin' ? 'Advance balances and recoveries. Open balances at exit go to full and final settlement.' : 'Money paid to you before you spend it.'} actions={persona === 'emp' ? <Button variant="primary" onClick={() => setOpen(true)}>Request an advance</Button> : <Button variant="primary">Schedule recovery</Button>} />
      {card}
      <Drawer open={open} onOpenChange={setOpen} title="Request an advance" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary">Send for approval</Button></>}>
        {request}
      </Drawer>
    </OpsDesk>
  );
}

