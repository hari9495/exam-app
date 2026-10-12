import { useState } from 'react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField, type FormErrorItem } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { IrreversibleSheet } from '../pay-kit';
import { FileButton } from './compliance';
import { FormDrawer } from './operations';
import { monthText } from './periods';
import { rupees } from './runs';
import { EntityPicker } from './setup';
import type { Confirmation, LoadState } from './types';
import type { SetupEntity } from './types-5b';
import type { Certificate197Input, ConsultantBatch, ConsultantInput, ConsultantInvoice, ConsultantInvoiceStatus, ConsultantMe, ConsultantRow, ConsultantSection, InvoiceInput, NonSalaryReturn } from './types-5h';

// Batch 5h, wired (PAY-8.01 … 8.04): the consultant register, invoices with their TDS, consultant payments (made by one
// person, released by another after a fresh second step), Form 140 / 26Q and Form 131 / 16A, and the consultant's own
// page. Every action is checked again by the API (keys, entities, maker ≠ checker, step-up, the database pay guard).

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
export const SECTION_TEXT: Record<ConsultantSection, string> = { '194C': 'Contract work (194C)', '194J_A': 'Technical services (194J(a))', '194J_B': 'Professional fees (194J(b))' };
const SECTIONS = (Object.keys(SECTION_TEXT) as ConsultantSection[]).map((value) => ({ value, label: SECTION_TEXT[value] }));
const INVOICE_STATUS: Record<ConsultantInvoiceStatus, { label: string; tone: BadgeTone }> = {
  submitted: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved, to pay', tone: 'info' },
  rejected: { label: 'Turned down', tone: 'danger' },
  queued: { label: 'In a bank file', tone: 'info' },
  sent: { label: 'Sent to the bank', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Payment failed', tone: 'danger' },
};
const TDS_REASON: Record<string, string> = { below_threshold: 'Below the limit', normal: 'Normal rate', no_pan: 'No PAN: higher rate', certificate: 'Lower rate (s.197)', certificate_partly: 'Partly lower rate (s.197)' };
export const InvoiceStatusBadge = ({ status }: { status: ConsultantInvoiceStatus }) => <Badge tone={INVOICE_STATUS[status].tone}>{INVOICE_STATUS[status].label}</Badge>;
const tdsText = (i: ConsultantInvoice) => (i.tds ? `${rupees(i.tds.amount)} · ${TDS_REASON[i.tds.reason ?? ''] ?? i.tds.reason}` : 'At approval');

// ------------------------------------------------------------------------------------------ the register and payments

export interface ConsultantsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  consultants: ConsultantRow[] | null;
  invoices: ConsultantInvoice[] | null;
  batches: ConsultantBatch[] | null;
  can: { manage: boolean; release: boolean };
  onCreate: (x: ConsultantInput) => Promise<unknown>;
  onBankCheck: (id: string, reference: string) => Promise<unknown>;
  onCertificate: (id: string, x: Certificate197Input) => Promise<unknown>;
  onInvoice: (consultantId: string, x: InvoiceInput, file: File | null) => Promise<unknown>;
  onInvoiceFile: (i: ConsultantInvoice) => Promise<unknown>;
  onAdvice: (i: ConsultantInvoice) => Promise<unknown>;
  onPayout: (invoiceIds: string[], debitAccount: string) => Promise<unknown>;
  onDownloadBatch: (b: ConsultantBatch) => Promise<unknown>;
  onRelease: (id: string, c: Confirmation) => Promise<unknown>;
  onResults: (id: string, rows: { invoiceId: string; status: 'paid' | 'failed'; ref?: string; reason?: string }[]) => Promise<unknown>;
}

export function ConsultantsScreen(p: ConsultantsScreenProps) {
  const [adding, setAdding] = useState(false);
  const [entering, setEntering] = useState(false);
  return (
    <LivePage
      title="Consultants"
      description="Consultants and contractors paid through payroll: their invoices, the TDS on them and their payments. Invoices are approved in Approvals."
      state={p.state}
      onRetry={p.onRetry}
      what="consultants"
      grantedBy="your payroll admin"
      actions={
        p.can.manage ? (
          <div className="yx-tim-row">
            <Button onClick={() => setEntering(true)} disabled={!p.consultants?.length}>
              Enter an invoice
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add consultant
            </Button>
          </div>
        ) : undefined
      }
    >
      <Tabs defaultValue="invoices">
        <TabsList aria-label="Consultants">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <InvoicesTab {...p} />
        </TabsContent>
        <TabsContent value="register">
          <RegisterTab {...p} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab {...p} />
        </TabsContent>
      </Tabs>
      {adding && <ConsultantDrawer entities={p.entities} onClose={() => setAdding(false)} onSave={p.onCreate} />}
      {entering && p.consultants && <InvoiceDrawer consultants={p.consultants} onClose={() => setEntering(false)} onSave={p.onInvoice} />}
    </LivePage>
  );
}

function RegisterTab(p: ConsultantsScreenProps) {
  const [checking, setChecking] = useState<ConsultantRow | null>(null);
  const [certifying, setCertifying] = useState<ConsultantRow | null>(null);
  if (!p.consultants) return null;
  if (!p.consultants.length) return <EmptyState title="No consultants yet" description="Add the consultants and contractors you pay, with their PAN and bank account." />;
  return (
    <>
      <table className="yx-tim-table" aria-label="Consultant register">
        <thead>
          <tr>
            <th scope="col">Consultant</th>
            <th scope="col">PAN</th>
            <th scope="col">TDS section</th>
            <th scope="col">Bank account</th>
            <th scope="col">
              <span className="yx-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.consultants.map((k) => (
            <tr key={k.id}>
              <th scope="row">
                {k.name}
                <div className="yx-tim-muted">{k.email}</div>
              </th>
              <td>{k.pan ?? <Badge tone="warning">No PAN</Badge>}</td>
              <td>{SECTION_TEXT[k.defaultSection]}</td>
              <td>
                {!k.bank ? (
                  <span className="yx-tim-muted">None</span>
                ) : (
                  <>
                    {k.bank.account}{' '}
                    <Badge tone={k.bank.usable ? 'success' : 'warning'}>{k.bank.usable ? 'Checked' : k.bank.verified ? `Usable from ${dateText(k.bank.usableFrom!.slice(0, 10))}` : 'Not checked'}</Badge>
                  </>
                )}
              </td>
              <td>
                {p.can.manage && (
                  <div className="yx-tim-row">
                    {k.bank && !k.bank.verified && !k.changedByMe && (
                      <Button size="sm" variant="primary" onClick={() => setChecking(k)}>
                        Record bank check
                      </Button>
                    )}
                    {k.bank && !k.bank.verified && k.changedByMe && <span className="yx-tim-note">Someone else checks it</span>}
                    <Button size="sm" onClick={() => setCertifying(k)}>
                      Add s.197 certificate
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {checking && <BankCheckDrawer who={checking} onClose={() => setChecking(null)} onSave={(ref) => p.onBankCheck(checking.id, ref)} />}
      {certifying && <CertificateDrawer who={certifying} onClose={() => setCertifying(null)} onSave={(x) => p.onCertificate(certifying.id, x)} />}
    </>
  );
}

function InvoicesTab(p: ConsultantsScreenProps) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const { busy, error, run } = useRun();
  if (!p.invoices) return null;
  if (!p.invoices.length) return <EmptyState title="No invoices yet" description="Consultants send invoices from their own page, or you enter them here." />;
  const payable = (i: ConsultantInvoice) => i.status === 'approved' || i.status === 'failed';
  const chosen = p.invoices.filter((i) => picked.has(i.id));
  const total = chosen.reduce((t, i) => t + Number(i.netPayable ?? 0), 0).toFixed(2);
  return (
    <>
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {p.can.manage && chosen.length > 0 && (
        <div className="yx-tim-row">
          <span>
            {chosen.length} to pay · {rupees(total)}
          </span>
          <Button variant="primary" onClick={() => setPaying(true)}>
            Make bank file
          </Button>
        </div>
      )}
      <table className="yx-tim-table" aria-label="Consultant invoices">
        <thead>
          <tr>
            {p.can.manage && (
              <th scope="col">
                <span className="yx-sr-only">Pick</span>
              </th>
            )}
            <th scope="col">Invoice</th>
            <th scope="col">Consultant</th>
            <th scope="col">Before GST</th>
            <th scope="col">GST</th>
            <th scope="col">TDS</th>
            <th scope="col">To pay</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="yx-sr-only">Files</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.invoices.map((i) => (
            <tr key={i.id}>
              {p.can.manage && (
                <td>
                  {payable(i) && (
                    <Checkbox
                      aria-label={`Pay invoice ${i.invoiceNo}`}
                      checked={picked.has(i.id)}
                      onChange={(c) =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (c) n.add(i.id);
                          else n.delete(i.id);
                          return n;
                        })
                      }
                    />
                  )}
                </td>
              )}
              <th scope="row">
                {i.invoiceNo}
                <div className="yx-tim-muted">
                  {dateText(i.invoiceDate)} · {SECTION_TEXT[i.section]}
                </div>
              </th>
              <td>{i.consultant}</td>
              <td>{rupees(i.taxableValue)}</td>
              <td>{rupees(i.gst)}</td>
              <td>{tdsText(i)}</td>
              <td>{i.netPayable ? rupees(i.netPayable) : ''}</td>
              <td>
                <InvoiceStatusBadge status={i.status} />
                {i.status === 'failed' && i.paymentReason && <div className="yx-tim-muted">{i.paymentReason}</div>}
              </td>
              <td>
                <div className="yx-tim-row">
                  {i.hasFile && (
                    <Button size="sm" loading={busy === `f-${i.id}`} onClick={() => void run(`f-${i.id}`, () => p.onInvoiceFile(i))}>
                      Invoice
                    </Button>
                  )}
                  {i.status === 'paid' && p.can.manage && (
                    <Button size="sm" loading={busy === `a-${i.id}`} onClick={() => void run(`a-${i.id}`, () => p.onAdvice(i))}>
                      Payment advice
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {paying && <PayoutDrawer count={chosen.length} total={total} onClose={() => setPaying(false)} onSave={async (debit) => { await p.onPayout([...picked], debit); setPicked(new Set()); }} />}
    </>
  );
}

function PaymentsTab(p: ConsultantsScreenProps) {
  const [releasing, setReleasing] = useState<ConsultantBatch | null>(null);
  const [recording, setRecording] = useState<ConsultantBatch | null>(null);
  const { busy, error, run } = useRun();
  if (!p.batches) return null;
  if (!p.batches.length) return <EmptyState title="No bank files yet" description="Pick approved invoices on the Invoices tab and make a bank file." />;
  return (
    <>
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      <table className="yx-tim-table" aria-label="Consultant bank files">
        <thead>
          <tr>
            <th scope="col">Made</th>
            <th scope="col">Payments</th>
            <th scope="col">Total</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="yx-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.batches.map((b) => (
            <tr key={b.id}>
              <th scope="row">{dateText(b.createdAt.slice(0, 10))}</th>
              <td>{b.rows}</td>
              <td>{rupees(b.total)}</td>
              <td>
                <Badge tone={b.status === 'draft' ? 'warning' : b.status === 'confirmed' ? 'success' : 'info'}>{b.status === 'draft' ? 'Waiting for release' : b.status === 'released' ? 'Released' : b.status === 'confirmed' ? 'Results recorded' : 'Cancelled'}</Badge>
              </td>
              <td>
                <div className="yx-tim-row">
                  {b.status === 'draft' && p.can.release && !b.madeByMe && (
                    <Button size="sm" variant="primary" onClick={() => setReleasing(b)}>
                      Release
                    </Button>
                  )}
                  {b.status === 'draft' && b.madeByMe && <span className="yx-tim-note">Someone else releases it</span>}
                  {b.status === 'released' && p.can.manage && (
                    <Button size="sm" onClick={() => setRecording(b)}>
                      Record results
                    </Button>
                  )}
                  <Button size="sm" loading={busy === `d-${b.id}`} onClick={() => void run(`d-${b.id}`, () => p.onDownloadBatch(b))}>
                    Download
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {releasing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setReleasing(null)}
          title="Release consultant bank file"
          subtitle={`${releasing.rows} payments · ${rupees(releasing.total)}`}
          impact={[
            { label: 'Payments', value: String(releasing.rows) },
            { label: 'Total', value: rupees(releasing.total) },
            { label: 'Fingerprint (SHA-256)', value: releasing.sha256.slice(0, 16) },
          ]}
          cannotUndo="The file can be sent to the bank. Its fingerprint and invoices are checked again first."
          correction="A failed payment goes back to the invoices to be paid again in a new file."
          phrase={releasing.releasePhrase}
          maker="the person who made it"
          checker="you"
          confirmLabel="Release file"
          confirmVariant="primary"
          onConfirm={() =>
            void run('release', async () => {
              await p.onRelease(releasing.id, { phrase: releasing.releasePhrase, impact: [{ label: 'Total', value: rupees(releasing.total) }] });
              setReleasing(null);
            })
          }
        />
      )}
      {recording && p.invoices && <ResultsDrawer batch={recording} invoices={p.invoices.filter((i) => i.status === 'sent')} onClose={() => setRecording(null)} onSave={(rows) => p.onResults(recording.id, rows)} />}
    </>
  );
}

function ConsultantDrawer({ entities, onClose, onSave }: { entities: SetupEntity[]; onClose: () => void; onSave: ConsultantsScreenProps['onCreate'] }) {
  const [entity, setEntity] = useState<string | null>(entities.length === 1 ? entities[0].id : null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'individual' | 'firm'>('individual');
  const [email, setEmail] = useState('');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [section, setSection] = useState<ConsultantSection>('194J_B');
  const [holder, setHolder] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [account, setAccount] = useState('');
  const bank = Boolean(holder || ifsc || account);
  const P = pan.trim().toUpperCase();
  const errors: FormErrorItem[] = [
    ...(!entity ? [{ fieldId: 'pay-entity', message: 'Choose the legal entity that pays them.' }] : []),
    ...(name.trim().length < 2 ? [{ fieldId: 'kc-name', message: 'Give their name.' }] : []),
    ...(!/^\S+@\S+\.\S+$/.test(email.trim()) ? [{ fieldId: 'kc-email', message: 'Give their email: they sign in with it.' }] : []),
    ...(P && !PAN.test(P) ? [{ fieldId: 'kc-pan', message: 'A PAN is 10 letters and digits, like ABCDE1234F.' }] : []),
    ...(bank && holder.trim().length < 2 ? [{ fieldId: 'kc-holder', message: 'Give the account holder’s name.' }] : []),
    ...(bank && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase()) ? [{ fieldId: 'kc-ifsc', message: 'An IFSC is 11 letters and digits, like HDFC0001234.' }] : []),
    ...(bank && !/^\d{9,18}$/.test(account.trim()) ? [{ fieldId: 'kc-account', message: 'An account number is 9 to 18 digits.' }] : []),
  ];
  return (
    <FormDrawer
      title="Add consultant"
      subtitle="The PAN and bank account are stored encrypted. Someone else records the bank check before the first payment."
      confirm="Add"
      errors={errors}
      onClose={onClose}
      onSave={() =>
        onSave({
          legalEntityId: entity!,
          name: name.trim(),
          kind,
          email: email.trim(),
          defaultSection: section,
          ...(P ? { pan: P } : {}),
          ...(gstin.trim() ? { gstin: gstin.trim().toUpperCase() } : {}),
          ...(bank ? { bank: { holder: holder.trim(), ifsc: ifsc.trim().toUpperCase(), account: account.trim() } } : {}),
        })
      }
    >
      {(errorOf) => (
        <>
          <EntityPicker entities={entities} value={entity} onChange={setEntity} />
          <FormField id="kc-name" label="Name" required error={errorOf('kc-name')}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="kc-kind" label="They are">
            <Segment
              label="They are"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'individual', label: 'A person' },
                { value: 'firm', label: 'A firm or company' },
              ]}
            />
          </FormField>
          <FormField id="kc-email" label="Email" required error={errorOf('kc-email')}>
            <TextField type="email" value={email} onChange={setEmail} maxLength={200} />
          </FormField>
          <FormField id="kc-pan" label="PAN" helper="Without a PAN, TDS is at the higher rate (20%)." error={errorOf('kc-pan')}>
            <TextField value={pan} onChange={setPan} maxLength={10} />
          </FormField>
          <FormField id="kc-gstin" label="GSTIN">
            <TextField value={gstin} onChange={setGstin} maxLength={15} />
          </FormField>
          <FormField id="kc-section" label="Usual TDS section">
            <Select value={section} onChange={(v) => v && setSection(v as ConsultantSection)} options={SECTIONS} />
          </FormField>
          <FormField id="kc-holder" label="Account holder" error={errorOf('kc-holder')}>
            <TextField value={holder} onChange={setHolder} maxLength={200} />
          </FormField>
          <FormField id="kc-ifsc" label="IFSC" error={errorOf('kc-ifsc')}>
            <TextField value={ifsc} onChange={setIfsc} maxLength={11} />
          </FormField>
          <FormField id="kc-account" label="Account number" error={errorOf('kc-account')}>
            <TextField value={account} onChange={setAccount} inputMode="numeric" maxLength={18} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function BankCheckDrawer({ who, onClose, onSave }: { who: ConsultantRow; onClose: () => void; onSave: (ref: string) => Promise<unknown> }) {
  const [ref, setRef] = useState('');
  const errors: FormErrorItem[] = !/^[A-Za-z0-9-]{6,60}$/.test(ref.trim()) ? [{ fieldId: 'bc-ref', message: 'The penny-drop reference is 6 to 60 letters, digits or -.' }] : [];
  return (
    <FormDrawer title={`Bank check for ${who.name}`} subtitle={`Account ${who.bank?.account ?? ''}, IFSC ${who.bank?.ifsc ?? ''}. Record it only after the bank confirmed the name.`} confirm="Record check" errors={errors} onClose={onClose} onSave={() => onSave(ref.trim())}>
      {(errorOf) => (
        <FormField id="bc-ref" label="Penny-drop reference" required error={errorOf('bc-ref')}>
          <TextField value={ref} onChange={setRef} maxLength={60} />
        </FormField>
      )}
    </FormDrawer>
  );
}

function CertificateDrawer({ who, onClose, onSave }: { who: ConsultantRow; onClose: () => void; onSave: (x: Certificate197Input) => Promise<unknown> }) {
  const [no, setNo] = useState('');
  const [section, setSection] = useState<ConsultantSection>(who.defaultSection);
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState('');
  const pct = Number(rate);
  const errors: FormErrorItem[] = [
    ...(!/^[A-Za-z0-9/-]{4,30}$/.test(no.trim()) ? [{ fieldId: 'c197-no', message: 'The certificate number is 4 to 30 letters, digits, / or -.' }] : []),
    ...(!/^\d{1,2}(\.\d{1,2})?$/.test(rate.trim()) || pct >= 100 ? [{ fieldId: 'c197-rate', message: 'The rate in per cent, like 2 or 0.5.' }] : []),
    ...(!DAY.test(from) ? [{ fieldId: 'c197-from', message: 'Give the first day.' }] : []),
    ...(!DAY.test(to) || to < from ? [{ fieldId: 'c197-to', message: 'Give the last day, on or after the first.' }] : []),
    ...(!MONEY.test(limit.trim()) ? [{ fieldId: 'c197-limit', message: 'The amount the certificate covers, in rupees.' }] : []),
  ];
  return (
    <FormDrawer
      title={`Lower deduction certificate for ${who.name}`}
      subtitle="Section 197: the lower rate applies until the certificate’s amount is used up."
      confirm="Add certificate"
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ certificateNo: no.trim(), section, rate: (pct / 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0', validFrom: from, validTo: to, limit: limit.trim() })}
    >
      {(errorOf) => (
        <>
          <FormField id="c197-no" label="Certificate number" required error={errorOf('c197-no')}>
            <TextField value={no} onChange={setNo} maxLength={30} />
          </FormField>
          <FormField id="c197-section" label="Section">
            <Select value={section} onChange={(v) => v && setSection(v as ConsultantSection)} options={SECTIONS} />
          </FormField>
          <FormField id="c197-rate" label="Rate (%)" required error={errorOf('c197-rate')}>
            <TextField value={rate} onChange={setRate} inputMode="decimal" />
          </FormField>
          <FormField id="c197-from" label="Valid from" required error={errorOf('c197-from')}>
            <TextField type="date" value={from} onChange={setFrom} />
          </FormField>
          <FormField id="c197-to" label="Valid to" required error={errorOf('c197-to')}>
            <TextField type="date" value={to} onChange={setTo} />
          </FormField>
          <FormField id="c197-limit" label="Amount covered (₹)" required error={errorOf('c197-limit')}>
            <TextField value={limit} onChange={setLimit} inputMode="decimal" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

/** The invoice fields shared by staff entry and the consultant's own upload. */
function InvoiceFields({ x, set, errorOf }: { x: InvoiceForm; set: (f: Partial<InvoiceForm>) => void; errorOf: (id: string) => string | undefined }) {
  return (
    <>
      <FormField id="iv-no" label="Invoice number" required error={errorOf('iv-no')}>
        <TextField value={x.no} onChange={(no) => set({ no })} maxLength={40} />
      </FormField>
      <FormField id="iv-date" label="Invoice date" required error={errorOf('iv-date')}>
        <TextField type="date" value={x.date} onChange={(date) => set({ date })} />
      </FormField>
      <FormField id="iv-period" label="Work for the month" required error={errorOf('iv-period')}>
        <TextField type="month" value={x.period} onChange={(period) => set({ period })} />
      </FormField>
      <FormField id="iv-taxable" label="Amount before GST (₹)" required error={errorOf('iv-taxable')}>
        <TextField value={x.taxable} onChange={(taxable) => set({ taxable })} inputMode="decimal" />
      </FormField>
      <FormField id="iv-gst" label="GST" helper="IGST for another state; CGST and SGST (half each) within the state.">
        <Segment
          label="GST"
          value={x.gstKind}
          onChange={(gstKind) => set({ gstKind })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'igst', label: 'IGST' },
            { value: 'split', label: 'CGST and SGST' },
          ]}
        />
      </FormField>
      {x.gstKind !== 'none' && (
        <FormField id="iv-gst-amount" label="GST amount (₹)" required error={errorOf('iv-gst-amount')}>
          <TextField value={x.gst} onChange={(gst) => set({ gst })} inputMode="decimal" />
        </FormField>
      )}
    </>
  );
}
interface InvoiceForm {
  no: string;
  date: string;
  period: string;
  taxable: string;
  gstKind: 'none' | 'igst' | 'split';
  gst: string;
}
const EMPTY_INVOICE: InvoiceForm = { no: '', date: '', period: '', taxable: '', gstKind: 'none', gst: '' };
const invoiceErrors = (x: InvoiceForm): FormErrorItem[] => [
  ...(!/^[A-Za-z0-9/._-]{1,40}$/.test(x.no.trim()) ? [{ fieldId: 'iv-no', message: 'The invoice number: letters, digits, / . _ or -.' }] : []),
  ...(!DAY.test(x.date) ? [{ fieldId: 'iv-date', message: 'Give the invoice date.' }] : []),
  ...(!MONTH.test(x.period) ? [{ fieldId: 'iv-period', message: 'Give the month the work is for.' }] : []),
  ...(!MONEY.test(x.taxable.trim()) || Number(x.taxable) <= 0 ? [{ fieldId: 'iv-taxable', message: 'The amount before GST, in rupees.' }] : []),
  ...(x.gstKind !== 'none' && !MONEY.test(x.gst.trim()) ? [{ fieldId: 'iv-gst-amount', message: 'The GST amount, in rupees.' }] : []),
];
const invoiceInput = (x: InvoiceForm): InvoiceInput => {
  const g = Number(x.gst || 0);
  const half = (g / 2).toFixed(2);
  return {
    invoiceNo: x.no.trim(),
    invoiceDate: x.date,
    period: x.period,
    taxableValue: x.taxable.trim(),
    ...(x.gstKind === 'igst' ? { igst: g.toFixed(2) } : x.gstKind === 'split' ? { cgst: half, sgst: (g - Number(half)).toFixed(2) } : {}),
  };
};

function InvoiceDrawer({ consultants, onClose, onSave }: { consultants: ConsultantRow[]; onClose: () => void; onSave: ConsultantsScreenProps['onInvoice'] }) {
  const [who, setWho] = useState<string | null>(null);
  const [x, setX] = useState<InvoiceForm>(EMPTY_INVOICE);
  const [file, setFile] = useState<File | null>(null);
  const errors: FormErrorItem[] = [...(!who ? [{ fieldId: 'iv-who', message: 'Choose the consultant.' }] : []), ...invoiceErrors(x)];
  return (
    <FormDrawer title="Enter an invoice" subtitle="It goes to a payroll approver; the TDS is worked out when it is approved." confirm="Send for approval" errors={errors} onClose={onClose} onSave={() => onSave(who!, invoiceInput(x), file)}>
      {(errorOf) => (
        <>
          <FormField id="iv-who" label="Consultant" required error={errorOf('iv-who')}>
            <Select value={who} onChange={setWho} placeholder="Choose a consultant" options={consultants.filter((k) => k.status === 'active').map((k) => ({ value: k.id, label: k.name }))} />
          </FormField>
          <InvoiceFields x={x} set={(f) => setX((o) => ({ ...o, ...f }))} errorOf={errorOf} />
          <div className="yx-tim-row">
            <FileButton label={file ? 'Change PDF' : 'Attach the invoice (PDF)'} accept="application/pdf" ariaLabel="Attach the invoice PDF" onFile={setFile} />
            {file && <span className="yx-tim-muted">{file.name}</span>}
          </div>
        </>
      )}
    </FormDrawer>
  );
}

function PayoutDrawer({ count, total, onClose, onSave }: { count: number; total: string; onClose: () => void; onSave: (debit: string) => Promise<unknown> }) {
  const [debit, setDebit] = useState('');
  const errors: FormErrorItem[] = !/^\d{6,20}$/.test(debit.trim()) ? [{ fieldId: 'po-debit', message: 'The company account the money comes from: 6 to 20 digits.' }] : [];
  return (
    <FormDrawer title="Make bank file" subtitle={`${count} payments · ${rupees(total)}. Someone else releases it.`} confirm="Make bank file" errors={errors} onClose={onClose} onSave={() => onSave(debit.trim())}>
      {(errorOf) => (
        <FormField id="po-debit" label="Pay from account" required error={errorOf('po-debit')}>
          <TextField value={debit} onChange={setDebit} inputMode="numeric" maxLength={20} />
        </FormField>
      )}
    </FormDrawer>
  );
}

function ResultsDrawer({ batch, invoices, onClose, onSave }: { batch: ConsultantBatch; invoices: ConsultantInvoice[]; onClose: () => void; onSave: (rows: Parameters<ConsultantsScreenProps['onResults']>[1]) => Promise<unknown> }) {
  const [rows, setRows] = useState(() => invoices.map((i) => ({ invoiceId: i.id, no: i.invoiceNo, who: i.consultant, status: 'paid' as 'paid' | 'failed', ref: '', reason: '' })));
  const set = (id: string, f: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.invoiceId === id ? { ...r, ...f } : r)));
  const errors: FormErrorItem[] = rows.flatMap((r) => [
    ...(r.status === 'paid' && !/^[A-Za-z0-9/-]{1,60}$/.test(r.ref.trim()) ? [{ fieldId: `rs-ref-${r.invoiceId}`, message: `${r.no}: the bank reference.` }] : []),
    ...(r.status === 'failed' && r.reason.trim().length < 3 ? [{ fieldId: `rs-why-${r.invoiceId}`, message: `${r.no}: why it failed.` }] : []),
  ]);
  return (
    <FormDrawer
      title="Record bank results"
      subtitle={`${batch.rows} payments in this file.`}
      confirm="Record"
      errors={errors}
      onClose={onClose}
      onSave={() => onSave(rows.map((r) => (r.status === 'paid' ? { invoiceId: r.invoiceId, status: 'paid' as const, ref: r.ref.trim() } : { invoiceId: r.invoiceId, status: 'failed' as const, reason: r.reason.trim() })))}
    >
      {(errorOf) =>
        rows.map((r) => (
          <Card key={r.invoiceId} title={`${r.who ?? ''} · ${r.no}`}>
            <FormField id={`rs-st-${r.invoiceId}`} label="Result">
              <Segment
                label={`Result for ${r.no}`}
                value={r.status}
                onChange={(status) => set(r.invoiceId, { status })}
                options={[
                  { value: 'paid', label: 'Paid' },
                  { value: 'failed', label: 'Failed' },
                ]}
              />
            </FormField>
            {r.status === 'paid' ? (
              <FormField id={`rs-ref-${r.invoiceId}`} label="Bank reference" required error={errorOf(`rs-ref-${r.invoiceId}`)}>
                <TextField value={r.ref} onChange={(ref) => set(r.invoiceId, { ref })} maxLength={60} />
              </FormField>
            ) : (
              <FormField id={`rs-why-${r.invoiceId}`} label="Why it failed" required error={errorOf(`rs-why-${r.invoiceId}`)}>
                <TextField value={r.reason} onChange={(reason) => set(r.invoiceId, { reason })} maxLength={300} />
              </FormField>
            )}
          </Card>
        ))
      }
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ Form 140 and Form 131

export interface ConsultantTaxScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  returns: NonSalaryReturn[] | null;
  can: { challans: boolean; file: boolean; certificates: boolean };
  onPrepareChallans: (month: string) => Promise<{ section: ConsultantSection; tds: string; status: string }[]>;
  onDraft: (taxYear: string, quarter: number) => Promise<unknown>;
  onReconcile: (r: NonSalaryReturn) => Promise<unknown>;
  onMakeFile: (r: NonSalaryReturn) => Promise<unknown>;
  onDownload: (r: NonSalaryReturn) => Promise<unknown>;
  onFiled: (r: NonSalaryReturn, tokenNo: string, c: Confirmation) => Promise<unknown>;
  onImport: (taxYear: string, quarter: number, file: File) => Promise<{ formCode: string; matched: { name: string }[]; unmatched: string[] }>;
}

const QUARTERS = [1, 2, 3, 4].map((q) => ({ value: String(q), label: `Q${q}` }));

export function ConsultantTaxScreen(p: ConsultantTaxScreenProps) {
  const [month, setMonth] = useState('');
  const [taxYear, setTaxYear] = useState('');
  const [quarter, setQuarter] = useState('1');
  const [challans, setChallans] = useState<{ section: ConsultantSection; tds: string; status: string }[] | null>(null);
  const [imported, setImported] = useState<{ formCode: string; matched: { name: string }[]; unmatched: string[] } | null>(null);
  const [filing, setFiling] = useState<NonSalaryReturn | null>(null);
  const [token, setToken] = useState('');
  const { busy, error, run } = useRun();
  const yearOk = /^\d{4}-\d{2}$/.test(taxYear);
  return (
    <LivePage
      title="Consultant TDS returns"
      description="The TDS deducted from consultants: the month's challans per section, the quarterly return (Form 140; 26Q until March 2026) and the certificates from TRACES (Form 131; 16A before)."
      state={p.state}
      onRetry={p.onRetry}
      what="consultant TDS returns"
      grantedBy="your payroll admin"
    >
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {p.entityId && (
        <>
          {p.can.challans && (
            <Card title="Challans for a month">
              <p className="yx-tim-muted">One challan per section from the TDS deducted that month. Record each deposit on Statutory › Challans.</p>
              <div className="yx-tim-row">
                <FormField id="ct-month" label="Month">
                  <TextField type="month" value={month} onChange={setMonth} />
                </FormField>
                <Button disabled={!MONTH.test(month)} loading={busy === 'challans'} onClick={() => void run('challans', async () => setChallans(await p.onPrepareChallans(month)))}>
                  Prepare challans
                </Button>
              </div>
              {challans && !challans.length && <p className="yx-tim-muted">No TDS was deducted from consultants in {monthText(month)}.</p>}
              {challans && challans.length > 0 && (
                <ul>
                  {challans.map((c) => (
                    <li key={c.section}>
                      {SECTION_TEXT[c.section]}: {rupees(c.tds)} {c.status === 'deposited' ? '(deposited)' : '(to deposit)'}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card title="Quarterly returns">
            {p.can.file && (
              <div className="yx-tim-row">
                <FormField id="ct-year" label="Tax year" helper="Like 2026-27">
                  <TextField value={taxYear} onChange={setTaxYear} maxLength={7} />
                </FormField>
                <FormField id="ct-quarter" label="Quarter">
                  <Segment label="Quarter" value={quarter} onChange={setQuarter} options={QUARTERS} />
                </FormField>
                <Button disabled={!yearOk} loading={busy === 'draft'} onClick={() => void run('draft', () => p.onDraft(taxYear, Number(quarter)))}>
                  Draft return
                </Button>
              </div>
            )}
            {p.returns && !p.returns.length && <p className="yx-tim-muted">No returns yet.</p>}
            {p.returns && p.returns.length > 0 && (
              <table className="yx-tim-table" aria-label="Consultant TDS returns">
                <thead>
                  <tr>
                    <th scope="col">Return</th>
                    <th scope="col">Deductees</th>
                    <th scope="col">TDS</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="yx-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.returns.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">
                        Form {r.formCode} · {r.taxYear} Q{r.quarter}
                      </th>
                      <td>{r.rows}</td>
                      <td>{rupees(r.tds)}</td>
                      <td>
                        <Badge tone={r.status === 'filed' ? 'success' : r.status === 'reconciled' ? 'info' : 'warning'}>{r.status === 'filed' ? `Filed · ${r.tokenNo}` : r.status === 'reconciled' ? 'Matches the challans' : r.reconciliation && !r.reconciliation.ok ? 'Differs from the challans' : 'Draft'}</Badge>
                      </td>
                      <td>
                        {p.can.file && r.status !== 'filed' && (
                          <div className="yx-tim-row">
                            <Button size="sm" loading={busy === `rc-${r.id}`} onClick={() => void run(`rc-${r.id}`, () => p.onReconcile(r))}>
                              Check challans
                            </Button>
                            {r.status === 'reconciled' && !r.fileId && (
                              <Button size="sm" variant="primary" loading={busy === `mf-${r.id}`} onClick={() => void run(`mf-${r.id}`, () => p.onMakeFile(r))}>
                                Make return file
                              </Button>
                            )}
                            {r.fileId && (
                              <>
                                <Button size="sm" loading={busy === `dl-${r.id}`} onClick={() => void run(`dl-${r.id}`, () => p.onDownload(r))}>
                                  Download
                                </Button>
                                <Button size="sm" variant="primary" onClick={() => setFiling(r)}>
                                  Mark filed
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          {p.can.certificates && (
            <Card title="Certificates from TRACES">
              <p className="yx-tim-muted">Upload the ZIP of the quarter’s certificates. Each is matched to a consultant by the PAN in its file name and shown on their page.</p>
              <div className="yx-tim-row">
                <FormField id="ct-cyear" label="Tax year" helper="Like 2026-27">
                  <TextField value={taxYear} onChange={setTaxYear} maxLength={7} />
                </FormField>
                <FormField id="ct-cquarter" label="Quarter">
                  <Segment label="Certificate quarter" value={quarter} onChange={setQuarter} options={QUARTERS} />
                </FormField>
                {yearOk && <FileButton label="Upload ZIP" accept=".zip,application/zip" ariaLabel="Upload the TRACES ZIP" loading={busy === 'zip'} onFile={(f) => void run('zip', async () => setImported(await p.onImport(taxYear, Number(quarter), f)))} />}
              </div>
              {imported && (
                <InlineAlert tone={imported.unmatched.length ? 'warning' : 'success'} title={`${imported.matched.length} Form ${imported.formCode} certificates issued`}>
                  {imported.unmatched.length ? `Not matched to anyone: ${imported.unmatched.join(', ')}.` : 'Every file matched a consultant.'}
                </InlineAlert>
              )}
            </Card>
          )}
        </>
      )}
      {filing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setFiling(null)}
          title={`Mark Form ${filing.formCode} filed`}
          subtitle={`${filing.taxYear} Q${filing.quarter}`}
          impact={[
            { label: 'Deductees', value: String(filing.rows) },
            { label: 'TDS', value: rupees(filing.tds) },
          ]}
          cannotUndo="The return is recorded as filed with its token number and can no longer be drafted again."
          correction="A mistake found later goes in a correction return on the portal."
          phrase={`FILED ${filing.formCode} Q${filing.quarter} ${filing.taxYear}`}
          maker="the portal"
          checker="you"
          confirmLabel="Mark filed"
          confirmVariant="primary"
          blocked={!/^[A-Za-z0-9]{6,30}$/.test(token.trim())}
          blockedReason="Enter the token number from the portal"
          onConfirm={() =>
            void run('filed', async () => {
              await p.onFiled(filing, token.trim(), { phrase: `FILED ${filing.formCode} Q${filing.quarter} ${filing.taxYear}`, impact: [{ label: 'TDS', value: rupees(filing.tds) }] });
              setFiling(null);
            })
          }
        >
          <FormField id="ct-token" label="Token number">
            <TextField value={token} onChange={setToken} maxLength={30} />
          </FormField>
        </IrreversibleSheet>
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ the consultant's own page

export interface ConsultantPortalScreenProps {
  data: ConsultantMe | null;
  onUpload: (x: InvoiceInput, file: File) => Promise<unknown>;
  onAdvice: (i: ConsultantInvoice) => Promise<unknown>;
  onCertificate: (c: ConsultantMe['certificates'][number]) => Promise<unknown>;
  onSignOut: () => void;
}

export function ConsultantPortalScreen(p: ConsultantPortalScreenProps) {
  const [sending, setSending] = useState(false);
  const { busy, error, run } = useRun();
  const d = p.data;
  return (
    <LivePage
      title={d ? `${d.me.company}: your invoices` : 'Your invoices'}
      description="Send invoices, follow their approval and payment, and download payment advices and TDS certificates."
      state={d ? 'ready' : 'loading'}
      what="your invoices"
      actions={
        <div className="yx-tim-row">
          <Button onClick={p.onSignOut}>Sign out</Button>
          {d?.canUpload && (
            <Button variant="primary" onClick={() => setSending(true)}>
              Send an invoice
            </Button>
          )}
        </div>
      }
    >
      {d && (
        <>
          {!d.canUpload && (
            <InlineAlert tone="info" title="Sign in again to send an invoice">
              For your safety, invoices are sent within 10 minutes of signing in with a new code.
            </InlineAlert>
          )}
          {d.me.panStatus !== 'operative' && (
            <InlineAlert tone="warning" title="No working PAN on file">
              TDS is deducted at the higher rate until the company has your PAN.
            </InlineAlert>
          )}
          {error && (
            <InlineAlert tone="danger" title="That did not work">
              {error}
            </InlineAlert>
          )}
          {!d.invoices.length ? (
            <EmptyState title="No invoices yet" description="Send your first invoice as a PDF." />
          ) : (
            <table className="yx-tim-table" aria-label="Your invoices">
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Before GST</th>
                  <th scope="col">TDS</th>
                  <th scope="col">Paid to you</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-sr-only">Advice</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.invoices.map((i) => (
                  <tr key={i.id}>
                    <th scope="row">
                      {i.invoiceNo}
                      <div className="yx-tim-muted">{dateText(i.invoiceDate)}</div>
                    </th>
                    <td>{rupees(i.taxableValue)}</td>
                    <td>{tdsText(i)}</td>
                    <td>{i.netPayable ? rupees(i.netPayable) : ''}</td>
                    <td>
                      <InvoiceStatusBadge status={i.status} />
                    </td>
                    <td>
                      {i.status === 'paid' && (
                        <Button size="sm" loading={busy === `a-${i.id}`} onClick={() => void run(`a-${i.id}`, () => p.onAdvice(i))}>
                          Payment advice
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Card title="TDS certificates">
            {!d.certificates.length ? (
              <p className="yx-tim-muted">Certificates appear here after each quarter’s return is filed.</p>
            ) : (
              <div className="yx-tim-row">
                {d.certificates.map((c) => (
                  <Button key={c.id} size="sm" loading={busy === `c-${c.id}`} onClick={() => void run(`c-${c.id}`, () => p.onCertificate(c))}>
                    {c.form} · {c.taxYear} Q{c.quarter}
                  </Button>
                ))}
              </div>
            )}
          </Card>
          {sending && <PortalInvoiceDrawer onClose={() => setSending(false)} onSave={p.onUpload} />}
        </>
      )}
    </LivePage>
  );
}

function PortalInvoiceDrawer({ onClose, onSave }: { onClose: () => void; onSave: ConsultantPortalScreenProps['onUpload'] }) {
  const [x, setX] = useState<InvoiceForm>(EMPTY_INVOICE);
  const [file, setFile] = useState<File | null>(null);
  const errors: FormErrorItem[] = [...invoiceErrors(x), ...(!file ? [{ fieldId: 'iv-file', message: 'Attach the invoice as a PDF.' }] : [])];
  return (
    <FormDrawer title="Send an invoice" subtitle="It goes to the company for approval. You see the TDS once it is approved." confirm="Send" errors={errors} onClose={onClose} onSave={() => onSave(invoiceInput(x), file!)}>
      {(errorOf) => (
        <>
          <InvoiceFields x={x} set={(f) => setX((o) => ({ ...o, ...f }))} errorOf={errorOf} />
          <FormField id="iv-file" label="Invoice (PDF, up to 5 MB)" required error={errorOf('iv-file')}>
            <div className="yx-tim-row">
              <FileButton label={file ? 'Change PDF' : 'Attach PDF'} accept="application/pdf" ariaLabel="Attach the invoice PDF" onFile={setFile} />
              {file && <span className="yx-tim-muted">{file.name}</span>}
            </div>
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}
