import { useEffect, useState, type ChangeEvent } from 'react';
import { Camera, Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { ClaimDetail, ClaimLine, ClaimStatus, ClaimSummary, ExpenseCategory, ExpenseHome, LineInput, LoadState, PaymentStatus } from './types';

// Expenses batch E2, wired (M05-BUILD-DESIGN §8, §9, §19; EXP-01, EXP-02, EXP-03): the expenses home, and one claim page
// that is the composer for the person claiming and the review for the approver whose turn it is and for finance.
// Snap first: a receipt becomes a line pre-filled from the receipt, which the person confirms; nothing read from a
// receipt is used until they do (Q4). "You will receive" is always the first figure (YX-EXP-06).

const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);
export const money = (cur: string, x: string | null) => (x === null ? '—' : `${cur === 'INR' ? '₹' : `${cur} `}${Number(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const STATUS: Record<ClaimStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'With approvers', tone: 'info' },
  sent_back: { label: 'Sent back to you', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  partly_approved: { label: 'Partly approved', tone: 'success' },
  rejected: { label: 'Not approved', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};
export const PAYMENT: Record<PaymentStatus, { label: string; tone: BadgeTone } | null> = {
  not_due: null,
  approved_unpaid: { label: 'Waiting for payment', tone: 'warning' },
  in_payroll: { label: 'In the next payroll', tone: 'info' },
  payout_queued: { label: 'Bank transfer queued', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  payment_failed: { label: 'Payment failed', tone: 'danger' },
};
const FLAG_TEXT: Record<string, string> = {
  same_receipt: 'Same receipt',
  same_invoice: 'Same GST invoice',
  look_alike: 'Looks like another bill',
  split: 'Split bills',
  just_under: 'Just under a limit',
  old_receipt: 'Old bill',
  on_leave: 'On a leave day',
  per_diem_overlap: 'Per-diem days twice',
  ocr_mismatch: 'Differs from the receipt',
  gstin_invalid: 'GSTIN looks wrong',
  gst_maths: 'GST does not add up',
  einvoice_invalid: 'E-invoice signature mismatch',
  over_limit: 'Over the limit',
};
const FIELD_TEXT: Record<string, string> = { amount: 'amount', date: 'date', merchant: 'merchant', gstin: 'GSTIN', invoiceNo: 'invoice number', taxableValue: 'taxable value', cgst: 'CGST', sgst: 'SGST', igst: 'IGST' };

/** U62: where the money comes from and when, in the employee's words. */
export function paymentText(status: PaymentStatus, p: NonNullable<ClaimDetail['payment']>): string {
  const month = p.month ? new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
  if (status === 'paid') return p.paidOn ? `Paid on ${dateText(p.paidOn)}${p.route === 'payroll' ? ' with your salary' : ' to your bank account'}.` : 'Paid.';
  if (status === 'payment_failed') return p.route === 'payroll' ? 'The salary payment did not go through; payroll pays it again with the salary.' : 'The bank transfer did not go through; finance pays it again.';
  if (p.route === 'payroll') return month ? `Approved: payment in the ${month} payroll.` : 'Approved: payment in the next payroll.';
  return status === 'payout_queued' ? 'Approved: bank transfer queued.' : 'Approved: finance pays it by bank transfer.';
}

function StatusBadges({ c }: { c: Pick<ClaimSummary, 'status' | 'paymentStatus'> }) {
  const pay = PAYMENT[c.paymentStatus];
  return (
    <>
      <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge> {pay && <Badge tone={pay.tone}>{pay.label}</Badge>}
    </>
  );
}

// ------------------------------------------------------------------------------------------ home (EXP-01)

export interface ExpensesHomeScreenProps {
  state: LoadState;
  onRetry?: () => void;
  home: ExpenseHome | null;
  approvals: ClaimSummary[] | null;
  review: ClaimSummary[] | null;
  onNew: (title: string) => Promise<unknown>;
  onOpen: (id: string) => void;
  /** E4: trips and advances live on their own pages. */
  onTrips?: () => void;
  onAdvances?: () => void;
  /** Opens the new-claim sheet at once (the "New expense claim" action in Ctrl K, N E). */
  startNew?: boolean;
}

export function ExpensesHomeScreen(p: ExpensesHomeScreenProps) {
  const [tab, setTab] = useState<'mine' | 'approvals' | 'review'>('mine');
  const [creating, setCreating] = useState(Boolean(p.startNew));
  // Asked again while already on this page (Ctrl K, N E): open the sheet then too, not only on first load.
  useEffect(() => {
    if (p.startNew) setCreating(true);
  }, [p.startNew]);
  const [title, setTitle] = useState('');
  const [tried, setTried] = useState(false);
  const h = p.home;
  const rows = tab === 'mine' ? (h?.claims ?? []) : tab === 'approvals' ? (p.approvals ?? []) : (p.review ?? []);
  const columns: TableColumn<ClaimSummary>[] = [
    ...(tab === 'mine' ? [] : [{ key: 'person', header: 'Person', type: 'person' as const, value: (r: ClaimSummary) => r.person, person: (r: ClaimSummary) => ({ name: r.person }), width: 200, hideable: false }]),
    { key: 'title', header: 'Claim', value: (r) => r.title, width: 240, hideable: tab !== 'mine' },
    { key: 'net', header: 'You will receive', value: (r) => Number(r.netPayable), render: (r) => <Text>{money(r.currency, r.netPayable)}</Text>, width: 160 },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <StatusBadges c={r} />, width: 260 },
    { key: 'submitted', header: 'Sent', value: (r) => r.submittedAt ?? '', render: (r) => <Text>{r.submittedAt ? dateText(r.submittedAt.slice(0, 10)) : '—'}</Text>, width: 130, optional: true },
  ];
  const tabs = [
    { value: 'mine' as const, label: 'My claims' },
    ...(h && h.waitingForMe ? [{ value: 'approvals' as const, label: `Waiting for me (${h.waitingForMe})` }] : []),
    ...(h && h.toReview !== null ? [{ value: 'review' as const, label: `Finance check (${h.toReview})` }] : []),
  ];
  return (
    <LivePage
      title="Expenses"
      description={h ? `You will receive ${money('INR', h.toReceive)} from claims approved but not yet paid.` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="your expenses"
      actions={
        <>
          {p.onTrips && <Button onClick={p.onTrips}>Trips</Button>}
          {p.onAdvances && <Button onClick={p.onAdvances}>Advances</Button>}
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New claim
          </Button>
        </>
      }
    >
      {tabs.length > 1 && <Segment label="Show" value={tab} onChange={setTab} options={tabs} />}
      <DataTable
        label="Expense claims"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowNoun={['claim', 'claims']}
        cardSummary
        empty={<EmptyState compact title={tab === 'mine' ? 'No claims yet.' : 'Nothing waiting.'} description={tab === 'mine' ? 'Start a claim, then snap your receipts.' : undefined} />}
        rowButtons={(r) => (
          <Button size="sm" onClick={() => p.onOpen(r.id)}>
            Open
          </Button>
        )}
      />
      {creating && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && (setCreating(false), setTried(false))}
          size="md"
          title="New claim"
          consequence="Add your bills to it, then send it for approval."
          confirmLabel="Start claim"
          onConfirm={async () => {
            setTried(true);
            if (title.trim().length < 2) return false;
            await p.onNew(title.trim());
            setCreating(false);
          }}
        >
          <FormField id="nc-title" label="What is it for" required error={tried && title.trim().length < 2 ? 'Enter at least 2 characters.' : null} helper="For example: Mumbai client visit, October">
            <TextField value={title} onChange={setTitle} maxLength={150} />
          </FormField>
        </ConfirmDialog>
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ claim (EXP-02 / EXP-03)

export interface ClaimScreenProps {
  state: LoadState;
  onRetry?: () => void;
  claim: ClaimDetail | null;
  categories: ExpenseCategory[];
  today: string;
  onBack: () => void;
  onUploadReceipt: (file: File, lineId?: string) => Promise<unknown>;
  onSaveLine: (lineId: string | null, input: LineInput) => Promise<unknown>;
  onRemoveLine: (lineId: string) => Promise<unknown>;
  onSubmit: () => Promise<unknown>;
  onWithdraw: () => Promise<unknown>;
  onApproveAmount: (lineId: string, amount: string, reason: string) => Promise<unknown>;
  onDecide: (decision: 'approve' | 'reject' | 'send_back', reason: string) => Promise<unknown>;
  onFlag: (flagId: string, decision: 'clear' | 'confirm', note: string) => Promise<unknown>;
  onOpenReceipt: (lineId: string) => Promise<unknown>;
  /** E5: the statement behind a rate the employee entered. */
  onUploadFxProof?: (lineId: string, file: File) => Promise<unknown>;
  onOpenFxProof?: (lineId: string) => Promise<unknown>;
}

export function ClaimScreen(p: ClaimScreenProps) {
  const c = p.claim;
  const { busy, error, run } = useRun();
  const [editing, setEditing] = useState<ClaimLine | 'new' | null>(null);
  const [lowering, setLowering] = useState<ClaimLine | null>(null);
  const [deciding, setDeciding] = useState<'reject' | 'send_back' | null>(null);
  const [flagging, setFlagging] = useState<{ id: string; decision: 'clear' | 'confirm' } | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const cats = new Map(p.categories.map((x) => [x.code, x]));
  const submit = () =>
    run('submit', async () => {
      setBlockers([]);
      try {
        await p.onSubmit();
      } catch (e) {
        const b = (e as { body?: { blockers?: { text: string }[] } }).body?.blockers;
        if (b?.length) setBlockers(b.map((x) => x.text));
        throw e;
      }
    });
  const pick = (e: ChangeEvent<HTMLInputElement>, lineId?: string) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) void run(lineId ? `r-${lineId}` : 'receipt', () => p.onUploadReceipt(f, lineId));
  };
  return (
    <LivePage
      title={c ? c.title : 'Claim'}
      description={c ? `${c.person} · claimed ${money(c.currency, c.claimedTotal)}` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this claim"
      actions={<Button onClick={p.onBack}>Back</Button>}
    >
      {c && (
        <>
          {error && (
            <InlineAlert tone="danger" title="That didn't work">
              {error}
            </InlineAlert>
          )}
          {blockers.length > 1 && (
            <InlineAlert tone="warning" title="Fix these to send the claim">
              <ul className="yx-lif-list">
                {blockers.map((b) => (
                  <li key={b}>
                    <Text>{b}</Text>
                  </li>
                ))}
              </ul>
            </InlineAlert>
          )}
          <Card title="You will receive">
            <Text as="p" size="lg">
              {money(c.currency, c.netPayable)}
            </Text>
            <StatusBadges c={c} />
            {c.payment && (
              <Text as="p" tone="secondary">
                {paymentText(c.paymentStatus, c.payment)}
              </Text>
            )}
            {c.decisionNote && (c.status === 'sent_back' || c.status === 'rejected') && (
              <Text as="p" tone="secondary">
                {`Approver's note: ${c.decisionNote}`}
              </Text>
            )}
            {c.route && (
              <ul className="yx-lif-list">
                {c.route.steps.map((s, i) => (
                  <li key={`${s.name}-${i}`}>
                    <Text>{s.name}</Text> <Badge tone={s.state === 'approved' ? 'success' : s.state === 'rejected' ? 'danger' : s.state === 'open' ? 'info' : 'neutral'}>{s.state === 'open' ? 'Waiting' : s.state === 'approved' ? 'Approved' : s.state === 'rejected' ? 'Not approved' : s.state === 'skipped' ? 'Skipped' : 'Later'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {c.can.edit && (
            <div className="yx-lif-row">
              <label className="yx-button" data-variant="primary" data-size="md">
                <Camera aria-hidden size={16} /> {busy === 'receipt' ? 'Reading the receipt…' : 'Snap or upload a receipt'}
                <input type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" className="yx-visually-hidden" aria-label="Snap or upload a receipt" onChange={(e) => pick(e)} />
              </label>
              <Button icon={Plus} onClick={() => setEditing('new')}>
                Add without a receipt
              </Button>
            </div>
          )}
          {c.lines.length === 0 && <EmptyState compact title="No bills yet." description="Snap a receipt: we read it and you check the values." />}
          {c.lines.map((l) => (
            <LineCard
              key={l.id}
              line={l}
              currency={c.currency}
              category={cats.get(l.categoryCode)}
              changes={c.changes.filter((x) => x.lineId === l.id)}
              flags={c.flags.filter((f) => f.lineId === l.id)}
              actions={
                <>
                  {c.can.edit && (
                    <Button size="sm" variant={(l.ocr && !l.ocr.confirmed) || l.confirmed === false ? 'primary' : 'secondary'} onClick={() => setEditing(l)}>
                      {(l.ocr && !l.ocr.confirmed) || l.confirmed === false ? 'Check and confirm' : 'Edit'}
                    </Button>
                  )}
                  {c.can.edit && l.fx?.source === 'manual' && !l.fx.hasProof && p.onUploadFxProof && (
                    <label className="yx-button" data-variant="secondary" data-size="sm">
                      Add rate proof
                      <input type="file" accept="image/jpeg,image/png,application/pdf" className="yx-visually-hidden" aria-label={`Add the statement for the rate on line ${l.lineNo}`} onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void run(`fx-${l.id}`, () => p.onUploadFxProof!(l.id, f));
                      }} />
                    </label>
                  )}
                  {l.fx?.hasProof && p.onOpenFxProof && (
                    <Button size="sm" loading={busy === `vf-${l.id}`} onClick={() => void run(`vf-${l.id}`, () => p.onOpenFxProof!(l.id))}>
                      View rate proof
                    </Button>
                  )}
                  {c.can.edit && !l.hasReceipt && l.policy?.receipt !== 'none' && (
                    <label className="yx-button" data-variant="secondary" data-size="sm">
                      Add receipt
                      <input type="file" accept="image/jpeg,image/png,application/pdf" className="yx-visually-hidden" aria-label={`Add a receipt to line ${l.lineNo}`} onChange={(e) => pick(e, l.id)} />
                    </label>
                  )}
                  {c.can.edit && (
                    <Button size="sm" variant="danger" loading={busy === `rm-${l.id}`} onClick={() => void run(`rm-${l.id}`, () => p.onRemoveLine(l.id))}>
                      Remove
                    </Button>
                  )}
                  {l.hasReceipt && (
                    <Button size="sm" loading={busy === `v-${l.id}`} onClick={() => void run(`v-${l.id}`, () => p.onOpenReceipt(l.id))}>
                      View receipt
                    </Button>
                  )}
                  {c.can.changeAmounts && (
                    <Button size="sm" onClick={() => setLowering(l)}>
                      Approve less
                    </Button>
                  )}
                </>
              }
            />
          ))}
          {c.can.review && c.flags.some((f) => f.status === 'open') && (
            <Card title="Finance check">
              <ul className="yx-lif-list">
                {c.flags
                  .filter((f) => f.status === 'open')
                  .map((f) => (
                    <li key={f.id}>
                      <Badge tone="warning">{FLAG_TEXT[f.kind] ?? f.kind}</Badge> <Text>{f.detail}</Text>{' '}
                      <Button size="sm" onClick={() => setFlagging({ id: f.id, decision: 'clear' })}>
                        Clear
                      </Button>{' '}
                      <Button size="sm" variant="danger" onClick={() => setFlagging({ id: f.id, decision: 'confirm' })}>
                        Confirm
                      </Button>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
          <div className="yx-lif-row">
            {c.can.edit && (
              <Button variant="primary" loading={busy === 'submit'} disabled={c.lines.length === 0} onClick={() => void submit()}>
                Send for approval
              </Button>
            )}
            {c.can.withdraw && (
              <Button loading={busy === 'withdraw'} onClick={() => void run('withdraw', p.onWithdraw)}>
                Withdraw to change it
              </Button>
            )}
            {c.can.decide && (
              <>
                <Button variant="primary" loading={busy === 'approve'} onClick={() => void run('approve', () => p.onDecide('approve', ''))}>
                  Approve
                </Button>
                <Button onClick={() => setDeciding('send_back')}>Send back</Button>
                <Button onClick={() => setDeciding('reject')}>
                  Do not approve
                </Button>
              </>
            )}
          </div>
          {editing && <LineDrawer line={editing === 'new' ? null : editing} categories={p.categories} today={p.today} currency={c.currency} onClose={() => setEditing(null)} onSave={async (input) => {
            await p.onSaveLine(editing === 'new' ? null : editing.id, input);
            setEditing(null);
          }} />}
          {lowering && <LowerDialog line={lowering} currency={c.currency} onClose={() => setLowering(null)} onSave={(amount, reason) => p.onApproveAmount(lowering.id, amount, reason)} />}
          {deciding && <ReasonDialog title={deciding === 'reject' ? 'Not approve this claim?' : 'Send it back?'} consequence={deciding === 'reject' ? 'The claim closes and the employee sees your reason.' : 'The employee changes it and sends it again; approval starts over.'} label={deciding === 'reject' ? 'Why not' : 'What should change'} confirm={deciding === 'reject' ? 'Do not approve' : 'Send back'} onClose={() => setDeciding(null)} onConfirm={(reason) => p.onDecide(deciding, reason)} />}
          {flagging && <ReasonDialog title={flagging.decision === 'clear' ? 'Clear this flag?' : 'Confirm this flag?'} consequence={flagging.decision === 'clear' ? 'Recorded with your note.' : 'A confirmed duplicate pays nothing for that bill; the employee sees why.'} label="Note" confirm={flagging.decision === 'clear' ? 'Clear flag' : 'Confirm flag'} onClose={() => setFlagging(null)} onConfirm={(note) => p.onFlag(flagging.id, flagging.decision, note)} />}
        </>
      )}
    </LivePage>
  );
}

function LineCard({ line: l, currency, category, changes, flags, actions }: { line: ClaimLine; currency: string; category: ExpenseCategory | undefined; changes: ClaimDetail['changes']; flags: ClaimDetail['flags']; actions: React.ReactNode }) {
  const reduced = l.approved !== null && Number(l.approved) < Number(l.claimed);
  const policy = l.policy;
  return (
    <Card title={`${l.lineNo}. ${category?.shownName ?? category?.name ?? l.categoryCode}${l.merchant ? ` · ${l.merchant}` : ''}`} actions={<div className="yx-lif-row">{actions}</div>}>
      <Text as="p">{`${dateText(l.spentOn)}${l.city ? ` · ${l.city}` : ''} · ${money(currency, l.claimed)}${l.payMode === 'company_paid' ? ' (company paid, not reimbursed)' : ''}`}</Text>
      {l.mileage && <Text as="p" tone="secondary" size="sm">{`${l.mileage.km} km by ${l.mileage.vehicle.replace(/_/g, ' ')} at ${money(currency, l.mileage.ratePerKm)} a km`}</Text>}
      {l.fx && <Text as="p" tone="secondary" size="sm">{`${money(l.fx.currency, l.fx.amount)} at ${Number(l.fx.rate).toLocaleString('en-IN', { maximumFractionDigits: 4 })} (${FX_SOURCE[l.fx.source ?? ''] ?? 'rate'}${l.fx.rateDate ? ` of ${dateText(l.fx.rateDate)}` : ''})`}</Text>}
      {l.fx?.source === 'manual' && l.fx.variancePct !== null && Math.abs(Number(l.fx.variancePct)) > 3 && <Badge tone="warning">{`Rate ${l.fx.variancePct} % from the company rate`}</Badge>}
      {l.fx?.source === 'manual' && !l.fx.hasProof && <Badge tone="warning">Statement needed for the rate</Badge>}
      {l.confirmed === false && (
        <InlineAlert tone="warning" title="From your field day">
          Check the distance and save the line. It is paid only once you confirm it.
        </InlineAlert>
      )}
      {l.perDiem && <Text as="p" tone="secondary" size="sm">{`${l.perDiem.fullDays} full and ${l.perDiem.partialDays} part days at ${money(currency, l.perDiem.ratePerDay)}`}</Text>}
      {reduced && <InlineAlert tone="info" title={`Approved ${money(currency, l.approved)} of ${money(currency, l.claimed)}`}>{l.reduceReason}</InlineAlert>}
      {policy?.outcome === 'over_justify' && <Badge tone="warning">{`Over the limit by ${money(currency, policy.overBy)}`}</Badge>}
      {policy?.outcome === 'blocked' && <Badge tone="danger">{`Over a hard limit of ${money(currency, policy.limit?.amount ?? '0')}`}</Badge>}
      {policy?.outcome === 'not_allowed' && <Badge tone="danger">{policy.reason ?? 'Not allowed for you here'}</Badge>}
      {!l.hasReceipt && policy?.receipt === 'required' && <Badge tone="warning">Receipt needed</Badge>}
      {!l.hasReceipt && l.selfDeclared && <Badge tone="neutral">Declared without a receipt</Badge>}
      {l.ocr && !l.ocr.confirmed && (
        <InlineAlert tone="warning" title="Check the values read from the receipt">
          {l.ocr.lowConfidence.length ? `Please check the ${l.ocr.lowConfidence.map((k) => FIELD_TEXT[k] ?? k).join(', ')}: not read clearly.` : 'Confirm the category and the values before sending.'}
        </InlineAlert>
      )}
      {l.ocr?.einvoice === 'verified' && <Badge tone="success">E-invoice verified</Badge>}
      {l.gst?.itcStatus && l.gst.itcStatus !== 'not_applicable' && <Badge tone={l.gst.itcStatus === 'eligible' ? 'success' : 'neutral'}>{ITC[l.gst.itcStatus] ?? l.gst.itcStatus}</Badge>}
      {flags.filter((f) => f.status === 'open').map((f) => (
        <Text as="p" key={f.id} tone="secondary" size="sm">
          {`${FLAG_TEXT[f.kind] ?? f.kind}: ${f.detail}`}
        </Text>
      ))}
      {changes.length > 0 && (
        <Text as="p" tone="secondary" size="sm">
          {changes.map((x) => `${money(currency, x.from)} → ${money(currency, x.to)}: ${x.reason}`).join(' · ')}
        </Text>
      )}
    </Card>
  );
}
const FX_SOURCE: Record<string, string> = { company_table: 'company rate', advance: 'advance rate', manual: 'your card or bank rate', statement: 'statement rate', reference: 'reference rate' };
const ITC: Record<string, string> = { eligible: 'GST credit', blocked: 'GST captured, no credit for this spend', not_billed_to_us: 'Not billed to the company', wrong_state: 'Billed to another state', missing: 'GST details missing' };

function LineDrawer({ line, categories, today, currency, onClose, onSave }: { line: ClaimLine | null; categories: ExpenseCategory[]; today: string; currency: string; onClose: () => void; onSave: (x: LineInput) => Promise<void> }) {
  const f = line?.ocr?.fields ?? {};
  const live = categories.filter((x) => x.active);
  const [code, setCode] = useState<string | null>(line && live.some((x) => x.code === line.categoryCode) ? line.categoryCode : null);
  const [on, setOn] = useState<Date | null>(fromKey(line?.spentOn ?? today));
  const [merchant, setMerchant] = useState(line?.merchant ?? '');
  const [city, setCity] = useState(line?.city ?? '');
  const [amount, setAmount] = useState(line?.fx?.amount ? String(Number(line.fx.amount)) : line && Number(line.claimed) > 0 ? String(Number(line.claimed)) : '');
  const [billCurrency, setBillCurrency] = useState(line?.fx?.currency ?? currency);
  const [rate, setRate] = useState(line?.fx?.source === 'manual' ? String(Number(line.fx.rate)) : '');
  const foreign = billCurrency !== currency;
  const [vehicle, setVehicle] = useState<string | null>(line?.mileage?.vehicle ?? 'car');
  const [km, setKm] = useState<number | null>(line?.mileage?.km ?? null);
  const [full, setFull] = useState<number | null>(line?.perDiem?.fullDays ?? 1);
  const [partial, setPartial] = useState<number | null>(line?.perDiem?.partialDays ?? 0);
  const [declared, setDeclared] = useState(line?.selfDeclared ?? false);
  const [why, setWhy] = useState(line?.justification ?? '');
  const [companyPaid, setCompanyPaid] = useState(line?.payMode === 'company_paid');
  const [gstin, setGstin] = useState(line?.gst?.supplierGstin ?? '');
  const [invoice, setInvoice] = useState(line?.gst?.invoiceNo ?? '');
  const [taxable, setTaxable] = useState(line?.gst?.taxableValue ?? '');
  const [cgst, setCgst] = useState(line?.gst?.cgst ?? '');
  const [sgst, setSgst] = useState(line?.gst?.sgst ?? '');
  const [igst, setIgst] = useState(line?.gst?.igst ?? '');
  const [billedTo, setBilledTo] = useState(line?.gst?.billedToGstin ?? '');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cat = live.find((x) => x.code === code);
  const kind = cat?.kind ?? 'spend';
  const low = new Set(line?.ocr?.lowConfidence ?? []);
  const check = (k: string) => (low.has(k) ? 'Please check: read with low confidence' : f[k as keyof typeof f] ? 'Read from the receipt' : undefined);
  const amt = (x: string) => x === '' || /^\d{1,12}(\.\d{1,2})?$/.test(x.trim());
  const errors = [
    ...(code ? [] : [{ fieldId: 'ln-cat', message: 'Choose what the bill is for.' }]),
    ...(on ? (dayKey(on) > today ? [{ fieldId: 'ln-date', message: 'A bill cannot be dated in the future.' }] : []) : [{ fieldId: 'ln-date', message: 'Enter the date on the bill.' }]),
    ...(kind === 'spend' || kind === 'company_paid_only' ? (amt(amount) && amount !== '' ? [] : [{ fieldId: 'ln-amount', message: 'Enter the amount on the bill.' }]) : []),
    ...(kind === 'mileage' && !(km && km > 0) ? [{ fieldId: 'ln-km', message: 'Enter the distance in km.' }] : []),
    ...(kind === 'per_diem' && !((full ?? 0) + (partial ?? 0) > 0) ? [{ fieldId: 'ln-days', message: 'Enter at least one day.' }] : []),
    ...([taxable, cgst, sgst, igst].every(amt) ? [] : [{ fieldId: 'ln-gst', message: 'GST amounts are numbers, e.g. 450.00.' }]),
    ...(/^[A-Z]{3}$/.test(billCurrency) ? [] : [{ fieldId: 'ln-cur', message: 'The currency is a 3-letter code, e.g. AED.' }]),
    ...(foreign && rate !== '' && !/^\d{1,10}(\.\d{1,8})?$/.test(rate) ? [{ fieldId: 'ln-rate', message: 'The rate is a number, e.g. 22.75.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    const n = (x: string) => (x.trim() ? x.trim() : null);
    try {
      await onSave({
        categoryCode: code!,
        spentOn: dayKey(on!),
        merchant: n(merchant),
        city: n(city),
        payMode: companyPaid ? 'company_paid' : 'personal',
        description: line?.description ?? null,
        justification: n(why),
        ...(kind === 'mileage' ? { mileage: { vehicle: vehicle ?? 'car', km: km! } } : kind === 'per_diem' ? { perDiem: { fullDays: full ?? 0, partialDays: partial ?? 0 } } : foreign ? { fx: { currency: billCurrency, amount: amount.trim(), ...(rate ? { rate } : {}) } } : { amount: amount.trim() }),
        ...(line?.hasReceipt ? {} : { selfDeclared: declared }),
        ...(cat?.gstEligible ? { gst: { supplierGstin: n(gstin.toUpperCase()), invoiceNo: n(invoice.toUpperCase()), taxableValue: n(taxable), cgst: n(cgst), sgst: n(sgst), igst: n(igst), billedToGstin: n(billedTo.toUpperCase()) } } : {}),
        ...(line ? { version: line.version } : {}),
      });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={line ? `Bill ${line.lineNo}` : 'Add a bill'}
      subtitle={line?.ocr && !line.ocr.confirmed ? 'We read these values from the receipt. Check each one; saving confirms them.' : undefined}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {line?.ocr && !line.ocr.confirmed ? 'Confirm' : 'Save'}
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <FormField id="ln-cat" label="What is it for" required error={v.errorOf('ln-cat')}>
        <Select aria-label="What is it for" value={code} onChange={setCode} options={live.map((x) => ({ value: x.code, label: x.shownName ?? x.name }))} searchable />
      </FormField>
      <FormField id="ln-date" label="Date on the bill" required error={v.errorOf('ln-date')} helper={check('date')}>
        <DatePicker value={on} onChange={setOn} aria-label="Date on the bill" />
      </FormField>
      {kind === 'mileage' ? (
        <div className="yx-lif-grid">
          <FormField id="ln-vehicle" label="Vehicle">
            <Select aria-label="Vehicle" value={vehicle} onChange={setVehicle} options={[{ value: 'car', label: 'Car' }, { value: 'two_wheeler', label: 'Two-wheeler' }, { value: 'ev_car', label: 'Electric car' }, { value: 'ev_two_wheeler', label: 'Electric two-wheeler' }]} />
          </FormField>
          <FormField id="ln-km" label="Distance (km)" required error={v.errorOf('ln-km')} helper="The amount is worked out from your company's rate.">
            <NumberField value={km} onChange={setKm} min={0.1} max={5000} />
          </FormField>
        </div>
      ) : kind === 'per_diem' ? (
        <div className="yx-lif-grid" id="ln-days">
          <FormField id="ln-full" label="Full days" error={v.errorOf('ln-days')} helper="The amount is worked out from the rate for the city.">
            <NumberField value={full} onChange={setFull} min={0} max={60} />
          </FormField>
          <FormField id="ln-part" label="Part days (first or last)">
            <NumberField value={partial} onChange={setPartial} min={0} max={2} />
          </FormField>
        </div>
      ) : (
        <>
          <div className="yx-lif-grid">
            <FormField id="ln-cur" label="Currency of the bill" error={v.errorOf('ln-cur')} helper={foreign ? `Converted to ${currency} at the company rate for the day, or your rate below.` : undefined}>
              <TextField value={billCurrency} onChange={(x) => setBillCurrency(x.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} maxLength={3} />
            </FormField>
            <FormField id="ln-amount" label={`Amount (${billCurrency || currency})`} required error={v.errorOf('ln-amount')} helper={check('amount')}>
              <TextField value={amount} onChange={(x) => setAmount(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
            </FormField>
          </div>
          {foreign && (
            <FormField id="ln-rate" label={`Rate on your card or bank statement (${currency} per ${billCurrency})`} optional error={v.errorOf('ln-rate')} helper="Leave it empty to use the company rate. A rate you enter needs the statement, and is checked against the company rate.">
              <TextField value={rate} onChange={(x) => setRate(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={20} />
            </FormField>
          )}
        </>
      )}
      <div className="yx-lif-grid">
        <FormField id="ln-merchant" label="Shop or supplier" optional helper={check('merchant')}>
          <TextField value={merchant} onChange={setMerchant} maxLength={120} />
        </FormField>
        <FormField id="ln-city" label="City" optional helper="Decides the city tier and its limits.">
          <TextField value={city} onChange={setCity} maxLength={60} />
        </FormField>
      </div>
      {line?.policy?.outcome === 'over_justify' && (
        <FormField id="ln-why" label="Why it is over the limit" required helper="Your approvers see this; the excess needs an extra approval.">
          <TextArea value={why} onChange={setWhy} rows={2} maxLength={500} />
        </FormField>
      )}
      {!line?.hasReceipt && kind !== 'mileage' && kind !== 'per_diem' && <Checkbox checked={declared} onChange={setDeclared} label="I have no receipt; I declare I spent this for work" />}
      <Checkbox checked={companyPaid} onChange={setCompanyPaid} label="The company paid this (card or booking): record it, do not pay me" />
      {cat?.gstEligible && (
        <Card title="GST on the bill" >
          <Text as="p" tone="secondary" size="sm">
            Optional. When the bill is in the company&apos;s name, your company can claim the GST back.
          </Text>
          <div className="yx-lif-grid" id="ln-gst">
            <FormField id="ln-gstin" label="Supplier GSTIN" optional helper={check('gstin')} error={v.errorOf('ln-gst')}>
              <TextField value={gstin} onChange={(x) => setGstin(x.toUpperCase())} maxLength={15} />
            </FormField>
            <FormField id="ln-inv" label="Invoice number" optional helper={check('invoiceNo')}>
              <TextField value={invoice} onChange={setInvoice} maxLength={40} />
            </FormField>
            <FormField id="ln-taxable" label="Taxable value" optional helper={check('taxableValue')}>
              <TextField value={taxable} onChange={setTaxable} inputMode="decimal" maxLength={15} />
            </FormField>
            <FormField id="ln-cgst" label="CGST" optional helper={check('cgst')}>
              <TextField value={cgst} onChange={setCgst} inputMode="decimal" maxLength={15} />
            </FormField>
            <FormField id="ln-sgst" label="SGST" optional helper={check('sgst')}>
              <TextField value={sgst} onChange={setSgst} inputMode="decimal" maxLength={15} />
            </FormField>
            <FormField id="ln-igst" label="IGST" optional helper={check('igst')}>
              <TextField value={igst} onChange={setIgst} inputMode="decimal" maxLength={15} />
            </FormField>
            <FormField id="ln-billed" label="Billed to GSTIN" optional helper="The company's GSTIN printed on the bill.">
              <TextField value={billedTo} onChange={(x) => setBilledTo(x.toUpperCase())} maxLength={15} />
            </FormField>
          </div>
        </Card>
      )}
    </Drawer>
  );
}

function LowerDialog({ line, currency, onClose, onSave }: { line: ClaimLine; currency: string; onClose: () => void; onSave: (amount: string, reason: string) => Promise<unknown> }) {
  const [amount, setAmount] = useState(String(Number(line.approved ?? line.claimed)));
  const [reason, setReason] = useState('');
  const ok = /^\d{1,12}(\.\d{1,2})?$/.test(amount) && Number(amount) <= Number(line.claimed) && (Number(amount) === Number(line.claimed) || reason.trim().length >= 3);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Approve less for bill ${line.lineNo}?`}
      consequence={`Claimed ${money(currency, line.claimed)}. The employee sees "approved X of Y" with your reason.`}
      confirmLabel="Save amount"
      onConfirm={async () => {
        setTried(true);
        if (!ok) return false;
        await onSave(Number(amount).toFixed(2), reason.trim());
        onClose();
      }}
    >
      <FormField id="lw-amount" label={`Approve (${currency})`} required error={!tried ? null : !/^\d{1,12}(\.\d{1,2})?$/.test(amount) ? 'Enter an amount, e.g. 2500.' : Number(amount) > Number(line.claimed) ? `Enter at most ${money(currency, line.claimed)}.` : null}>
        <TextField value={amount} onChange={(x) => setAmount(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
      </FormField>
      <FormField id="lw-reason" label="Reason" required error={tried && Number(amount) !== Number(line.claimed) && reason.trim().length < 3 ? 'Enter a reason of at least 3 characters.' : null} helper="For example: hotel cap Tier 2">
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
      </FormField>
    </ConfirmDialog>
  );
}

export function ReasonDialog({ title, consequence, label, confirm, onClose, onConfirm }: { title: string; consequence: string; label: string; confirm: string; onClose: () => void; onConfirm: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={title}
      consequence={consequence}
      confirmLabel={confirm}
      onConfirm={async () => {
        setTried(true);
        if (reason.trim().length < 3) return false;
        await onConfirm(reason.trim());
        onClose();
      }}
    >
      <FormField id="rs-reason" label={label} required error={tried && reason.trim().length < 3 ? 'Enter a reason of at least 3 characters.' : null}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}
