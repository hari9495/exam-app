// PAY-55 · Consultants and PAY-56 · Consultant portal (founder decision 3: designed first, then live).
// The register (PAN and bank masked, a bank check recorded by someone else), lower-deduction certificates (s.197),
// invoices with their TDS, bank files made by one person and released by another with a typed phrase, bank results;
// and the consultant's own page after a one-time code. One implementation per screen: the web page passes `live`;
// stories pass nothing and get sample data with handlers that just resolve. The API checks every action again.
import { useRef, useState, type ReactNode } from 'react';
import { Download, Plus, Send, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField, useTooEarly, type FormErrorItem } from '../../components/field';
import { TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { LEGAL_LINKS } from '../auth/kit';
import { errorText, useRun } from '../org/org-kit';
import { TenantPortal } from '../portals/portals-kit';
import { dateText } from '../time/live/kit';
import { FactRow, IrreversibleSheet, PayFrame, SectionTitle, type ViewState } from './pay-kit';
import type { Confirmation, LoadState } from './live/types';
import type { SetupEntity } from './live/types-5b';
import type { Certificate197Input, ConsultantBatch, ConsultantInput, ConsultantInvoice, ConsultantInvoiceStatus, ConsultantMe, ConsultantRow, ConsultantSection, InvoiceInput } from './live/types-5h';

/* ------------------------------------------------------------------ money, exact (the API sends decimal strings) */

/** "₹1,23,456.00" from the API's decimal string. */
export const rupees = (v: string | null | undefined) => {
  if (v == null) return '';
  const [i, f = '00'] = v.split('.');
  const neg = i.startsWith('-');
  const n = neg ? i.slice(1) : i;
  const head = n.slice(0, -3);
  return `${neg ? '−' : ''}₹${head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},` : ''}${n.slice(-3)}.${f.padEnd(2, '0').slice(0, 2)}`;
};
/** A price a unit with up to 4 decimals ("₹250.00", "₹12.3456"): zeros after the second decimal are dropped. */
export const unitPrice = (v: string) => {
  const [i, f = ''] = v.split('.');
  const frac = f.replace(/0+$/, '').padEnd(2, '0');
  return `${rupees(i)}`.replace(/\.00$/, `.${frac}`);
};
/** "123.45" → 12345n paise; never floating point. */
export const paise = (v: string) => {
  const neg = v.trim().startsWith('-');
  const [i, f = ''] = v.trim().replace('-', '').split('.');
  const p = BigInt(i || '0') * 100n + BigInt((f + '00').slice(0, 2));
  return neg ? -p : p;
};
export const fromPaise = (p: bigint) => `${p < 0n ? '-' : ''}${(p < 0n ? -p : p) / 100n}.${String((p < 0n ? -p : p) % 100n).padStart(2, '0')}`;
export const sumMoney = (vs: (string | null | undefined)[]) => fromPaise(vs.reduce((t, v) => t + (v ? paise(v) : 0n), 0n));

/* ------------------------------------------------------------------ shared live parts (also used by equity.tsx) */

export type PayLiveState = LoadState | ViewState;

/** Loading, could not load and no access for a whole page; the page itself when ready. */
export function PayPageState({ state, onRetry, what, grantedBy = 'your payroll admin', children }: { state: PayLiveState; onRetry?: () => void; what: string; grantedBy?: string; children: ReactNode }) {
  if (state === 'loading')
    return (
      <div className="yx-pay-skeleton" role="status" aria-busy="true" aria-label={`Loading ${what}`}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={i === 0 ? 32 : 20} width={i === 0 ? '40%' : `${90 - i * 8}%`} />
        ))}
      </div>
    );
  if (state === 'error') return <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />;
  if (state === 'no-access') return <NoAccessState what={what} grantedBy={grantedBy} />;
  return <>{children}</>;
}

/**
 * A form in a drawer. The confirm button is never disabled: pressed too early, the field errors show and the first bad
 * field takes focus. Done is a 5-second toast; a failure stays in the drawer.
 */
export function PayFormDrawer({ title, subtitle, confirm, done, errors, onClose, onSave, size, children }: { title: string; subtitle?: ReactNode; confirm: string; done: string; errors: FormErrorItem[]; onClose: () => void; onSave: () => Promise<unknown>; size?: 'md' | 'lg'; children: (errorOf: (id: string) => string | undefined) => ReactNode }) {
  const { toast } = useToast();
  const early = useTooEarly(errors);
  const { busy, error, run } = useRun();
  const save = () => {
    if (early.stop()) return;
    void run('save', onSave).then((ok) => {
      if (!ok) return;
      toast({ title: done, tone: 'success' });
      onClose();
    });
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      subtitle={subtitle}
      size={size}
      notice={
        error && (
          <InlineAlert tone="danger" title="That did not work">
            {error}
          </InlineAlert>
        )
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'save'} onClick={save}>
            {confirm}
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">{children(early.errorOf)}</div>
    </Drawer>
  );
}

/** A bordered button that opens the file picker. */
export function PayFileButton({ label, accept, ariaLabel, id, onFile }: { label: string; accept: string; ariaLabel: string; id?: string; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" icon={Upload} id={id} aria-label={ariaLabel} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        data-testid={`${ariaLabel} file`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** One action at a time from a list row (downloads); a failure is an error toast that stays until closed. */
function useRowAction() {
  const { toast } = useToast();
  const { busy, run } = useRun();
  return {
    busy,
    act: (key: string, fn: () => Promise<unknown>, done?: string) =>
      void run(key, async () => {
        try {
          await fn();
          if (done) toast({ title: done, tone: 'success' });
        } catch (e) {
          toast({ title: 'That did not work', description: errorText(e), tone: 'error' });
        }
      }),
  };
}

/* ------------------------------------------------------------------ words */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
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
const BATCH_STATUS: Record<ConsultantBatch['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Waiting for release', tone: 'warning' },
  released: { label: 'Released', tone: 'info' },
  confirmed: { label: 'Results recorded', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const TDS_REASON: Record<string, string> = { below_threshold: 'Below the limit', normal: 'Normal rate', no_pan: 'No PAN: higher rate', certificate: 'Lower rate (s.197)', certificate_partly: 'Partly lower rate (s.197)' };
const tdsText = (i: ConsultantInvoice) => (i.tds ? `${rupees(i.tds.amount)} · ${TDS_REASON[i.tds.reason ?? ''] ?? i.tds.reason}` : 'Worked out at approval');
const payable = (i: ConsultantInvoice) => i.status === 'approved' || i.status === 'failed';
const bankText = (k: ConsultantRow) => (!k.bank ? 'None' : k.bank.usable ? 'Checked' : k.bank.verified && k.bank.usableFrom ? `Usable from ${dateText(k.bank.usableFrom.slice(0, 10))}` : 'Not checked');

/* ================================================================== PAY-55 · Consultants */

/** What the live page passes: the API's data, the state, the actions and the permissions. */
export interface LiveConsultants {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  consultants: ConsultantRow[] | null;
  invoices: ConsultantInvoice[] | null;
  batches: ConsultantBatch[] | null;
  /** manage: consultant.manage (register, invoices, bank files, results); release: payroll.bankfile.release. */
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

export type ConsultantsTab = 'invoices' | 'register' | 'payments';
export type ConsultantsDialog = 'add' | 'invoice' | 'bank' | 'certificate' | 'payout' | 'release' | 'results';

/** PAY-55 · Consultants: invoices with their TDS, the register, and the bank files that pay them. */
export function ConsultantsScreen({ live, state = 'ready', tab = 'invoices', dialog, can }: { live?: LiveConsultants; state?: PayLiveState; tab?: ConsultantsTab; /** Story only: a drawer open on load. */ dialog?: ConsultantsDialog; /** Story only: fewer permissions. */ can?: Partial<LiveConsultants['can']> }) {
  const sample = useSampleConsultants(state, can);
  return (
    <PayFrame page="payments">
      <ConsultantsView v={live ?? sample} tab={tab} dialog={live ? undefined : dialog} />
    </PayFrame>
  );
}

function ConsultantsView({ v, tab, dialog }: { v: LiveConsultants; tab: ConsultantsTab; dialog?: ConsultantsDialog }) {
  const { toast } = useToast();
  const ks = v.consultants ?? [];
  const inv = v.invoices ?? [];
  const bs = v.batches ?? [];
  const [open, setOpen] = useState<ConsultantsDialog | null>(dialog ?? null);
  const [checking, setChecking] = useState<ConsultantRow | null>(dialog === 'bank' ? (ks.find((k) => k.bank && !k.bank.verified && !k.changedByMe) ?? null) : null);
  const [certifying, setCertifying] = useState<ConsultantRow | null>(dialog === 'certificate' ? (ks[0] ?? null) : null);
  const [picked, setPicked] = useState<string[]>(dialog === 'payout' ? inv.filter(payable).map((i) => i.id) : []);
  const [releasing, setReleasing] = useState<ConsultantBatch | null>(dialog === 'release' ? (bs.find((b) => b.status === 'draft' && !b.madeByMe) ?? null) : null);
  const [recording, setRecording] = useState<ConsultantBatch | null>(dialog === 'results' ? (bs.find((b) => b.status === 'released') ?? null) : null);
  const [relError, setRelError] = useState<string | null>(null);
  const { busy, act } = useRowAction();
  const chosen = inv.filter((i) => picked.includes(i.id));
  const toPay = sumMoney(chosen.map((i) => i.netPayable));
  const close = () => setOpen(null);
  const enterInvoice = () => (ks.length ? setOpen('invoice') : toast({ title: 'Add a consultant first', description: 'An invoice belongs to a consultant on the register.', tone: 'warning' }));

  const invoiceCols: TableColumn<ConsultantInvoice>[] = [
    { key: 'no', header: 'Invoice', value: (i) => i.invoiceNo, render: (i) => (<span>{i.invoiceNo}<span className="yx-pay-note">{dateText(i.invoiceDate)} · {SECTION_TEXT[i.section]}</span></span>), width: 200 },
    { key: 'who', header: 'Consultant', value: (i) => i.consultant ?? '', width: 160 },
    { key: 'taxable', header: 'Before GST', type: 'money', value: (i) => Number(i.taxableValue), render: (i) => rupees(i.taxableValue), width: 120 },
    { key: 'gst', header: 'GST', type: 'money', value: (i) => Number(i.gst), render: (i) => rupees(i.gst), width: 110, optional: true },
    { key: 'tds', header: 'TDS', value: (i) => i.tds?.amount ?? '', render: tdsText, width: 190 },
    { key: 'net', header: 'To pay', type: 'money', value: (i) => Number(i.netPayable ?? 0), render: (i) => rupees(i.netPayable), width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (i) => INVOICE_STATUS[i.status].label, render: (i) => (<span><Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>{i.status === 'failed' && i.paymentReason && <span className="yx-pay-note">{i.paymentReason}</span>}</span>), width: 170 },
  ];
  const registerCols: TableColumn<ConsultantRow>[] = [
    { key: 'name', header: 'Consultant', type: 'person', value: (k) => k.name, person: (k) => ({ name: k.name, secondary: k.email }), width: 220 },
    { key: 'pan', header: 'PAN', value: (k) => k.pan ?? '', render: (k) => k.pan ?? <Badge tone="warning">No PAN</Badge>, width: 130 },
    { key: 'section', header: 'Usual TDS section', value: (k) => SECTION_TEXT[k.defaultSection], width: 200 },
    { key: 'bank', header: 'Bank account', value: (k) => bankText(k), render: (k) => (k.bank ? (<span className="yx-pay-row">{k.bank.account} <Badge tone={k.bank.usable ? 'success' : 'warning'}>{bankText(k)}</Badge></span>) : <span className="yx-pay-muted">None</span>), width: 230 },
  ];
  const batchCols: TableColumn<ConsultantBatch>[] = [
    { key: 'made', header: 'Made on', value: (b) => b.createdAt, render: (b) => dateText(b.createdAt.slice(0, 10)), width: 130 },
    { key: 'rows', header: 'Payments', type: 'number', value: (b) => b.rows, width: 100 },
    { key: 'total', header: 'Total', type: 'money', value: (b) => Number(b.total), render: (b) => rupees(b.total), width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (b) => BATCH_STATUS[b.status].label, statusTone: (_, b) => BATCH_STATUS[b.status].tone, width: 170 },
  ];
  const facts = v.state === 'ready' && v.consultants ? `${ks.length} consultants · ${inv.filter(payable).length} invoices to pay · ${bs.filter((b) => b.status === 'draft').length} bank files waiting for release` : undefined;
  return (
    <>
      <PageHeader
        title="Consultants"
        description="Consultants and contractors paid through payroll: their invoices, the TDS on them and their payments. Invoices are approved in Approvals."
        facts={facts}
        actions={
          v.state === 'ready' && v.can.manage ? (
            <>
              <Button onClick={enterInvoice}>Enter an invoice</Button>
              <Button variant="primary" icon={Plus} onClick={() => setOpen('add')}>
                Add consultant
              </Button>
            </>
          ) : undefined
        }
      />
      <PayPageState state={v.state} onRetry={v.onRetry} what="consultants">
        <Tabs defaultValue={tab}>
          <TabsList aria-label="Consultants">
            <TabsTrigger value="invoices" count={inv.length}>
              Invoices
            </TabsTrigger>
            <TabsTrigger value="register" count={ks.length}>
              Register
            </TabsTrigger>
            <TabsTrigger value="payments" count={bs.length}>
              Bank files
            </TabsTrigger>
          </TabsList>
          <TabsContent value="invoices">
            <DataTable
              label="Consultant invoices"
              columns={invoiceCols}
              rows={inv}
              getRowId={(i) => i.id}
              cardSummary
              selectable={v.can.manage}
              isSelectable={(i) => payable(i) || false}
              selectedIds={picked}
              onSelectedChange={setPicked}
              bulkActions={() => (
                <>
                  <span className="yx-pay-muted">{rupees(toPay)} to pay</span>
                  <Button icon={Send} onClick={() => setOpen('payout')}>
                    Make bank file
                  </Button>
                </>
              )}
              rowButtons={(i) => (
                <>
                  {i.hasFile && (
                    <Button size="sm" icon={Download} loading={busy === `f-${i.id}`} onClick={() => act(`f-${i.id}`, () => v.onInvoiceFile(i))}>
                      Invoice
                    </Button>
                  )}
                  {i.status === 'paid' && v.can.manage && (
                    <Button size="sm" icon={Download} loading={busy === `a-${i.id}`} onClick={() => act(`a-${i.id}`, () => v.onAdvice(i))}>
                      Payment advice
                    </Button>
                  )}
                </>
              )}
              empty={<EmptyState title="No invoices yet" description="Consultants send invoices from their own page, or you enter them here." action={v.can.manage ? <Button onClick={enterInvoice}>Enter an invoice</Button> : undefined} />}
            />
          </TabsContent>
          <TabsContent value="register">
            <DataTable
              label="Consultant register"
              columns={registerCols}
              rows={ks}
              getRowId={(k) => k.id}
              cardSummary
              rowButtons={(k) =>
                v.can.manage ? (
                  <>
                    {k.bank && !k.bank.verified && !k.changedByMe && (
                      <Button size="sm" variant="primary" onClick={() => setChecking(k)}>
                        Record bank check
                      </Button>
                    )}
                    {k.bank && !k.bank.verified && k.changedByMe && <span className="yx-pay-note">You changed it, so someone else checks it</span>}
                    <Button size="sm" onClick={() => setCertifying(k)}>
                      Add s.197 certificate
                    </Button>
                  </>
                ) : null
              }
              empty={<EmptyState title="No consultants yet" description="Add the consultants and contractors you pay, with their PAN and bank account." action={v.can.manage ? <Button icon={Plus} onClick={() => setOpen('add')}>Add consultant</Button> : undefined} />}
            />
          </TabsContent>
          <TabsContent value="payments">
            <DataTable
              label="Consultant bank files"
              columns={batchCols}
              rows={bs}
              getRowId={(b) => b.id}
              cardSummary
              rowButtons={(b) => (
                <>
                  {b.status === 'draft' && v.can.release && !b.madeByMe && (
                    <Button size="sm" variant="primary" onClick={() => setReleasing(b)}>
                      Release
                    </Button>
                  )}
                  {b.status === 'draft' && b.madeByMe && <span className="yx-pay-note">You made it, so someone else releases it</span>}
                  {b.status === 'released' && v.can.manage && (
                    <Button size="sm" onClick={() => setRecording(b)}>
                      Record results
                    </Button>
                  )}
                  <Button size="sm" icon={Download} loading={busy === `d-${b.id}`} onClick={() => act(`d-${b.id}`, () => v.onDownloadBatch(b))}>
                    Download
                  </Button>
                </>
              )}
              empty={<EmptyState title="No bank files yet" description="Pick approved invoices on the Invoices tab and make a bank file." />}
            />
          </TabsContent>
        </Tabs>
      </PayPageState>
      {open === 'add' && <ConsultantDrawer entities={v.entities} onClose={close} onSave={v.onCreate} />}
      {open === 'invoice' && <InvoiceDrawer consultants={ks} onClose={close} onSave={v.onInvoice} />}
      {open === 'payout' && (
        <PayoutDrawer
          count={chosen.length}
          total={toPay}
          onClose={close}
          onSave={async (debit) => {
            await v.onPayout(picked, debit);
            setPicked([]);
          }}
        />
      )}
      {checking && <BankCheckDrawer who={checking} onClose={() => setChecking(null)} onSave={(ref) => v.onBankCheck(checking.id, ref)} />}
      {certifying && <CertificateDrawer who={certifying} onClose={() => setCertifying(null)} onSave={(x) => v.onCertificate(certifying.id, x)} />}
      {recording && <ResultsDrawer batch={recording} invoices={inv.filter((i) => i.status === 'sent')} onClose={() => setRecording(null)} onSave={(rows) => v.onResults(recording.id, rows)} />}
      {releasing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => {
            if (o) return;
            setReleasing(null);
            setRelError(null);
          }}
          title="Release consultant bank file"
          subtitle={`${releasing.rows} payments · ${rupees(releasing.total)}`}
          impact={[
            { label: 'Payments', value: String(releasing.rows) },
            { label: 'Total', value: rupees(releasing.total) },
            { label: 'Fingerprint (SHA-256)', value: <span className="yx-pay-mono">{releasing.sha256.slice(0, 16)}</span> },
          ]}
          cannotUndo="The file can be sent to the bank. Its fingerprint and invoices are checked again first."
          correction="A failed payment goes back to the invoices, to be paid again in a new file."
          phrase={releasing.releasePhrase}
          maker="the person who made it"
          checker="you"
          confirmLabel="Release file"
          confirmVariant="primary"
          error={relError}
          onConfirm={() =>
            void v.onRelease(releasing.id, { phrase: releasing.releasePhrase, impact: [{ label: 'Total', value: rupees(releasing.total) }] }).then(
              () => {
                toast({ title: 'Bank file released', description: `${releasing.rows} payments · ${rupees(releasing.total)}`, tone: 'success' });
                setReleasing(null);
                setRelError(null);
              },
              (e) => setRelError(errorText(e)),
            )
          }
        />
      )}
    </>
  );
}

function ConsultantDrawer({ entities, onClose, onSave }: { entities: SetupEntity[]; onClose: () => void; onSave: LiveConsultants['onCreate'] }) {
  const [entity, setEntity] = useState<string | null>(entities.length === 1 ? entities[0]!.id : null);
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
    ...(!entity ? [{ fieldId: 'kc-entity', message: 'Choose the legal entity that pays them.' }] : []),
    ...(name.trim().length < 2 ? [{ fieldId: 'kc-name', message: 'Give their name.' }] : []),
    ...(!/^\S+@\S+\.\S+$/.test(email.trim()) ? [{ fieldId: 'kc-email', message: 'Give their email: they sign in with it.' }] : []),
    ...(P && !PAN.test(P) ? [{ fieldId: 'kc-pan', message: 'A PAN is 10 letters and digits, like ABCDE1234F.' }] : []),
    ...(bank && holder.trim().length < 2 ? [{ fieldId: 'kc-holder', message: 'Give the account holder’s name.' }] : []),
    ...(bank && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase()) ? [{ fieldId: 'kc-ifsc', message: 'An IFSC is 11 letters and digits, like HDFC0001234.' }] : []),
    ...(bank && !/^\d{9,18}$/.test(account.trim()) ? [{ fieldId: 'kc-account', message: 'An account number is 9 to 18 digits.' }] : []),
  ];
  return (
    <PayFormDrawer
      title="Add consultant"
      subtitle="The PAN and bank account are stored encrypted. Someone else records the bank check before the first payment."
      confirm="Add consultant"
      done={`${name.trim()} added`}
      size="lg"
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
          <FormField id="kc-entity" label="Legal entity" required error={errorOf('kc-entity')}>
            <Select value={entity} onChange={setEntity} placeholder="Choose a legal entity" options={entities.map((e) => ({ value: e.id, label: e.name }))} />
          </FormField>
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
          <FormField id="kc-email" label="Email" required helper="They sign in to their own page with a code sent here." error={errorOf('kc-email')}>
            <TextField type="email" value={email} onChange={setEmail} maxLength={200} />
          </FormField>
          <FormField id="kc-pan" label="PAN" optional helper="Without a PAN, TDS is at the higher rate (20%)." error={errorOf('kc-pan')}>
            <TextField value={pan} onChange={setPan} maxLength={10} />
          </FormField>
          <FormField id="kc-gstin" label="GSTIN" optional>
            <TextField value={gstin} onChange={setGstin} maxLength={15} />
          </FormField>
          <FormField id="kc-section" label="Usual TDS section">
            <Select value={section} onChange={(x) => x && setSection(x as ConsultantSection)} options={SECTIONS} />
          </FormField>
          <SectionTitle>Bank account (optional)</SectionTitle>
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
    </PayFormDrawer>
  );
}

function BankCheckDrawer({ who, onClose, onSave }: { who: ConsultantRow; onClose: () => void; onSave: (ref: string) => Promise<unknown> }) {
  const [ref, setRef] = useState('');
  const errors: FormErrorItem[] = !/^[A-Za-z0-9-]{6,60}$/.test(ref.trim()) ? [{ fieldId: 'bc-ref', message: 'The penny-drop reference is 6 to 60 letters, digits or -.' }] : [];
  return (
    <PayFormDrawer title={`Bank check for ${who.name}`} subtitle="Record it only after the bank confirmed the account holder’s name." confirm="Record check" done={`Bank check recorded for ${who.name}`} errors={errors} onClose={onClose} onSave={() => onSave(ref.trim())}>
      {(errorOf) => (
        <>
          <FactRow
            items={[
              { label: 'Account', value: who.bank?.account ?? '' },
              { label: 'IFSC', value: who.bank?.ifsc ?? '' },
              { label: 'Holder', value: who.bank?.holder ?? '' },
            ]}
          />
          <FormField id="bc-ref" label="Penny-drop reference" required error={errorOf('bc-ref')}>
            <TextField value={ref} onChange={setRef} maxLength={60} />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

/** "2" (per cent) → "0.02"; "0.5" → "0.005": exact, from the digits. */
const percentToRate = (pct: string) => {
  const [i, f = ''] = pct.trim().split('.');
  const digits = `${i}${f}`.replace(/^0+(?=\d)/, '');
  const scale = f.length + 2;
  const padded = digits.padStart(scale + 1, '0');
  const out = `${padded.slice(0, -scale)}.${padded.slice(-scale)}`.replace(/0+$/, '').replace(/\.$/, '');
  return out || '0';
};

function CertificateDrawer({ who, onClose, onSave }: { who: ConsultantRow; onClose: () => void; onSave: (x: Certificate197Input) => Promise<unknown> }) {
  const [no, setNo] = useState('');
  const [section, setSection] = useState<ConsultantSection>(who.defaultSection);
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState('');
  const errors: FormErrorItem[] = [
    ...(!/^[A-Za-z0-9/-]{4,30}$/.test(no.trim()) ? [{ fieldId: 'c197-no', message: 'The certificate number is 4 to 30 letters, digits, / or -.' }] : []),
    ...(!/^\d{1,2}(\.\d{1,2})?$/.test(rate.trim()) ? [{ fieldId: 'c197-rate', message: 'The rate in per cent, below 100, like 2 or 0.5.' }] : []),
    ...(!DAY.test(from) ? [{ fieldId: 'c197-from', message: 'Give the first day.' }] : []),
    ...(!DAY.test(to) || to < from ? [{ fieldId: 'c197-to', message: 'Give the last day, on or after the first.' }] : []),
    ...(!MONEY.test(limit.trim()) ? [{ fieldId: 'c197-limit', message: 'The amount the certificate covers, in rupees.' }] : []),
  ];
  return (
    <PayFormDrawer
      title={`Lower deduction certificate for ${who.name}`}
      subtitle="Section 197: the lower rate applies until the certificate’s amount is used up."
      confirm="Add certificate"
      done={`Certificate ${no.trim()} added for ${who.name}`}
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ certificateNo: no.trim(), section, rate: percentToRate(rate), validFrom: from, validTo: to, limit: limit.trim() })}
    >
      {(errorOf) => (
        <>
          <FormField id="c197-no" label="Certificate number" required error={errorOf('c197-no')}>
            <TextField value={no} onChange={setNo} maxLength={30} />
          </FormField>
          <FormField id="c197-section" label="Section">
            <Select value={section} onChange={(x) => x && setSection(x as ConsultantSection)} options={SECTIONS} />
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
    </PayFormDrawer>
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
  ...(!MONEY.test(x.taxable.trim()) || paise(x.taxable) <= 0n ? [{ fieldId: 'iv-taxable', message: 'The amount before GST, in rupees.' }] : []),
  ...(x.gstKind !== 'none' && !MONEY.test(x.gst.trim()) ? [{ fieldId: 'iv-gst-amount', message: 'The GST amount, in rupees.' }] : []),
];
/** CGST and SGST are half each; an odd paisa goes to CGST. Exact, in paise. */
export const invoiceInput = (x: InvoiceForm): InvoiceInput => {
  const g = x.gstKind === 'none' ? 0n : paise(x.gst);
  const sgst = g / 2n;
  return {
    invoiceNo: x.no.trim(),
    invoiceDate: x.date,
    period: x.period,
    taxableValue: fromPaise(paise(x.taxable)),
    ...(x.gstKind === 'igst' ? { igst: fromPaise(g) } : x.gstKind === 'split' ? { cgst: fromPaise(g - sgst), sgst: fromPaise(sgst) } : {}),
  };
};

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

function InvoiceDrawer({ consultants, onClose, onSave }: { consultants: ConsultantRow[]; onClose: () => void; onSave: LiveConsultants['onInvoice'] }) {
  const [who, setWho] = useState<string | null>(null);
  const [x, setX] = useState<InvoiceForm>(EMPTY_INVOICE);
  const [file, setFile] = useState<File | null>(null);
  const errors: FormErrorItem[] = [...(!who ? [{ fieldId: 'iv-who', message: 'Choose the consultant.' }] : []), ...invoiceErrors(x)];
  return (
    <PayFormDrawer title="Enter an invoice" subtitle="It goes to a payroll approver; the TDS is worked out when it is approved." confirm="Send for approval" done={`Invoice ${x.no.trim()} sent for approval`} errors={errors} onClose={onClose} onSave={() => onSave(who!, invoiceInput(x), file)}>
      {(errorOf) => (
        <>
          <FormField id="iv-who" label="Consultant" required error={errorOf('iv-who')}>
            <Select value={who} onChange={setWho} placeholder="Choose a consultant" options={consultants.filter((k) => k.status === 'active').map((k) => ({ value: k.id, label: k.name }))} />
          </FormField>
          <InvoiceFields x={x} set={(f) => setX((o) => ({ ...o, ...f }))} errorOf={errorOf} />
          <FormField id="iv-file" label="Invoice (PDF)" optional>
            <div className="yx-pay-row">
              <PayFileButton label={file ? 'Change PDF' : 'Attach PDF'} accept="application/pdf" ariaLabel="Attach the invoice PDF" onFile={setFile} />
              {file && <span className="yx-pay-muted">{file.name}</span>}
            </div>
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

function PayoutDrawer({ count, total, onClose, onSave }: { count: number; total: string; onClose: () => void; onSave: (debit: string) => Promise<unknown> }) {
  const [debit, setDebit] = useState('');
  const errors: FormErrorItem[] = !/^\d{6,20}$/.test(debit.trim()) ? [{ fieldId: 'po-debit', message: 'The company account the money comes from: 6 to 20 digits.' }] : [];
  return (
    <PayFormDrawer title="Make bank file" subtitle="Someone else releases it before it can go to the bank." confirm="Make bank file" done={`Bank file made: ${count} payments · ${rupees(total)}. It waits for release.`} errors={errors} onClose={onClose} onSave={() => onSave(debit.trim())}>
      {(errorOf) => (
        <>
          <FactRow
            items={[
              { label: 'Payments', value: String(count) },
              { label: 'Total', value: rupees(total) },
            ]}
          />
          <FormField id="po-debit" label="Pay from account" required error={errorOf('po-debit')}>
            <TextField value={debit} onChange={setDebit} inputMode="numeric" maxLength={20} />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

function ResultsDrawer({ batch, invoices, onClose, onSave }: { batch: ConsultantBatch; invoices: ConsultantInvoice[]; onClose: () => void; onSave: (rows: Parameters<LiveConsultants['onResults']>[1]) => Promise<unknown> }) {
  const [rows, setRows] = useState(() => invoices.map((i) => ({ invoiceId: i.id, no: i.invoiceNo, who: i.consultant, net: i.netPayable, status: 'paid' as 'paid' | 'failed', ref: '', reason: '' })));
  const set = (id: string, f: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.invoiceId === id ? { ...r, ...f } : r)));
  const errors: FormErrorItem[] = rows.flatMap((r) => [
    ...(r.status === 'paid' && !/^[A-Za-z0-9/-]{1,60}$/.test(r.ref.trim()) ? [{ fieldId: `rs-ref-${r.invoiceId}`, message: `${r.no}: give the bank reference.` }] : []),
    ...(r.status === 'failed' && r.reason.trim().length < 3 ? [{ fieldId: `rs-why-${r.invoiceId}`, message: `${r.no}: say why it failed.` }] : []),
  ]);
  return (
    <PayFormDrawer
      title="Record bank results"
      subtitle={`${batch.rows} payments in the file made on ${dateText(batch.createdAt.slice(0, 10))}. A failed payment goes back to the invoices to pay again.`}
      confirm="Record results"
      done="Bank results recorded"
      size="lg"
      errors={errors}
      onClose={onClose}
      onSave={() => onSave(rows.map((r) => (r.status === 'paid' ? { invoiceId: r.invoiceId, status: 'paid' as const, ref: r.ref.trim() } : { invoiceId: r.invoiceId, status: 'failed' as const, reason: r.reason.trim() })))}
    >
      {(errorOf) =>
        !rows.length ? (
          <EmptyState title="No payments sent to the bank" description="Results are recorded for invoices sent to the bank in this file." />
        ) : (
          <ul className="yx-pay-cards" aria-label="Payments in the file">
            {rows.map((r) => (
              <li key={r.invoiceId}>
                <div className="yx-pay-cards__row">
                  <strong>
                    {r.who ?? ''} · {r.no}
                  </strong>
                  <span>{rupees(r.net)}</span>
                </div>
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
                  <FormField id={`rs-ref-${r.invoiceId}`} label="Bank reference (UTR)" required error={errorOf(`rs-ref-${r.invoiceId}`)}>
                    <TextField value={r.ref} onChange={(ref) => set(r.invoiceId, { ref })} maxLength={60} />
                  </FormField>
                ) : (
                  <FormField id={`rs-why-${r.invoiceId}`} label="Why it failed" required error={errorOf(`rs-why-${r.invoiceId}`)}>
                    <TextField value={r.reason} onChange={(reason) => set(r.invoiceId, { reason })} maxLength={300} />
                  </FormField>
                )}
              </li>
            ))}
          </ul>
        )
      }
    </PayFormDrawer>
  );
}

/* ------------------------------------------------------------------ sample data (stories only) */

const ok = async () => undefined;
const SAMPLE_ENTITIES = [{ id: 'kf', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] }] as SetupEntity[];
const bankOf = (holder: string, account: string, verified: boolean): NonNullable<ConsultantRow['bank']> => ({ holder, ifsc: 'HDFC0001234', account, verified, verifiedRef: verified ? 'PD-778899' : null, usableFrom: verified ? '2026-10-01T00:00:00.000Z' : null, usable: verified });
export const SAMPLE_CONSULTANTS: ConsultantRow[] = [
  { id: 'k1', legalEntityId: 'kf', name: 'Asha Rao', kind: 'individual', email: 'asha@example.test', pan: '•••••••34F', panStatus: 'operative', gstin: null, defaultSection: '194J_B', bank: bankOf('Asha Rao', '•••• 2333', true), status: 'active', version: 2, changedByMe: false },
  { id: 'k2', legalEntityId: 'kf', name: 'Nirmal Works', kind: 'firm', email: 'accounts@nirmal.test', pan: null, panStatus: 'missing', gstin: '29ABCDE1234F1Z5', defaultSection: '194C', bank: bankOf('Nirmal Works', '•••• 6777', false), status: 'active', version: 1, changedByMe: false },
  { id: 'k3', legalEntityId: 'kf', name: 'Deepa Menon', kind: 'individual', email: 'deepa@example.test', pan: '•••••••12K', panStatus: 'operative', gstin: null, defaultSection: '194J_A', bank: bankOf('Deepa Menon', '•••• 9051', false), status: 'active', version: 3, changedByMe: true },
];
const inv = (x: Partial<ConsultantInvoice>): ConsultantInvoice => ({
  id: 'i1',
  consultantId: 'k1',
  consultant: 'Asha Rao',
  invoiceNo: 'INV-001',
  invoiceDate: '2026-10-05',
  period: '2026-09',
  section: '194J_B',
  taxableValue: '40000.00',
  gst: '7200.00',
  total: '47200.00',
  uploadedVia: 'consultant',
  hasFile: true,
  status: 'approved',
  tds: { amount: '0.00', base: '0.00', rate: '0.10', reason: 'below_threshold', certificateUsed: '0.00' },
  netPayable: '47200.00',
  paidOn: null,
  paymentRef: null,
  paymentReason: null,
  ...x,
});
export const SAMPLE_INVOICES: ConsultantInvoice[] = [
  inv({}),
  inv({ id: 'i2', invoiceNo: 'INV-002', taxableValue: '20000.00', gst: '3600.00', total: '23600.00', tds: { amount: '6000.00', base: '60000.00', rate: '0.10', reason: 'normal', certificateUsed: '0.00' }, netPayable: '17600.00', status: 'paid', paidOn: '2026-10-10', paymentRef: 'UTR0001' }),
  inv({ id: 'i3', consultantId: 'k2', consultant: 'Nirmal Works', invoiceNo: 'NW-77', section: '194C', taxableValue: '35000.00', gst: '6300.00', total: '41300.00', uploadedVia: 'staff', hasFile: false, tds: null, netPayable: null, status: 'submitted' }),
  inv({ id: 'i4', consultantId: 'k2', consultant: 'Nirmal Works', invoiceNo: 'NW-76', section: '194C', status: 'failed', paymentReason: 'Account closed', tds: { amount: '7000.00', base: '35000.00', rate: '0.20', reason: 'no_pan', certificateUsed: '0.00' }, netPayable: '34300.00' }),
  inv({ id: 'i5', consultantId: 'k3', consultant: 'Deepa Menon', invoiceNo: 'DM-14', section: '194J_A', taxableValue: '18000.00', gst: '3240.00', total: '21240.00', tds: { amount: '360.00', base: '18000.00', rate: '0.02', reason: 'normal', certificateUsed: '0.00' }, netPayable: '20880.00', status: 'sent' }),
];
export const SAMPLE_BATCHES: ConsultantBatch[] = [
  { id: 'b1', fileName: 'consultants-2026-10-12.xlsx', rows: 2, total: '81500.00', sha256: '9f2c4b1d7e6a5c3b2a19f2c4b1d7e6a5', status: 'draft', madeByMe: false, releasePhrase: 'RELEASE 2 PAYMENTS', createdAt: '2026-10-12T05:00:00.000Z' },
  { id: 'b2', fileName: 'consultants-2026-10-08.xlsx', rows: 1, total: '20880.00', sha256: '1a2b3c4d5e6f7a8b9c0d1a2b3c4d5e6f', status: 'released', madeByMe: true, releasePhrase: 'RELEASE 1 PAYMENT', createdAt: '2026-10-08T05:00:00.000Z' },
  { id: 'b3', fileName: 'consultants-2026-10-01.xlsx', rows: 1, total: '17600.00', sha256: '7c6b5a4d3e2f1a0b9c8d7e6f5a4b3c2d', status: 'confirmed', madeByMe: false, releasePhrase: 'RELEASE 1 PAYMENT', createdAt: '2026-10-01T05:00:00.000Z' },
];

function useSampleConsultants(state: PayLiveState, can?: Partial<LiveConsultants['can']>): LiveConsultants {
  const [shown, setShown] = useState(state);
  const empty = shown === 'empty';
  return {
    state: shown === 'empty' ? 'ready' : shown,
    onRetry: () => setShown('ready'),
    entities: SAMPLE_ENTITIES,
    consultants: empty ? [] : SAMPLE_CONSULTANTS,
    invoices: empty ? [] : SAMPLE_INVOICES,
    batches: empty ? [] : SAMPLE_BATCHES,
    can: { manage: true, release: true, ...can },
    onCreate: ok,
    onBankCheck: ok,
    onCertificate: ok,
    onInvoice: ok,
    onInvoiceFile: ok,
    onAdvice: ok,
    onPayout: ok,
    onDownloadBatch: ok,
    onRelease: ok,
    onResults: ok,
  };
}

/* ================================================================== PAY-56 · Consultant portal */

/** What the consultant's own page passes after the one-time code. */
export interface LiveConsultantPortal {
  /** The org's name from the address, until the page has loaded. */
  tenant: string;
  data: ConsultantMe | null;
  onUpload: (x: InvoiceInput, file: File) => Promise<unknown>;
  onAdvice: (i: ConsultantInvoice) => Promise<unknown>;
  onCertificate: (c: ConsultantMe['certificates'][number]) => Promise<unknown>;
  onSignOut: () => void;
  /** After sign-in: loading until the data is in; 'error' (could not load, retry) or 'no-access' (the company refused). */
  state?: PayLiveState;
  onRetry?: () => void;
  /** The 30-minute session ended part-way (any call answered 401): the "sign in again" page. */
  ended?: boolean;
  onSignInAgain?: () => void;
}

/** PAY-56 · Consultant portal: the consultant's invoices, payment advices and TDS certificates, in the T9 portal frame. */
export function ConsultantPortalScreen({ live, state = 'ready', dialog, upload = 'open', pan = 'operative', ended = false }: { live?: LiveConsultantPortal; state?: PayLiveState; /** Story only: the upload drawer open. */ dialog?: 'upload'; /** Story only: 'closed' when the sign-in is older than 10 minutes. */ upload?: 'open' | 'closed'; /** Story only: no working PAN on file. */ pan?: 'operative' | 'missing'; /** Story only: the session ended part-way. */ ended?: boolean }) {
  const [shown, setShown] = useState(state);
  const sample: LiveConsultantPortal = {
    tenant: 'Kaveri Foods Pvt Ltd',
    data:
      shown === 'loading' || shown === 'error' || shown === 'no-access'
        ? null
        : {
            me: { id: 'k1', name: 'Asha Rao', company: 'Kaveri Foods Pvt Ltd', pan: pan === 'missing' ? null : '•••••••34F', panStatus: pan === 'missing' ? 'missing' : 'operative', bank: { account: '•••• 2333', usable: true } },
            canUpload: upload === 'open',
            invoices: shown === 'empty' ? [] : SAMPLE_INVOICES.filter((i) => i.consultantId === 'k1'),
            certificates: shown === 'empty' ? [] : [{ id: 'c1', taxYear: '2026-27', quarter: 1, form: 'Form 131' }],
          },
    onUpload: ok,
    onAdvice: ok,
    onCertificate: ok,
    onSignOut: () => undefined,
  };
  const v = live ?? sample;
  const d = v.data;
  const [sending, setSending] = useState(!live && dialog === 'upload');
  const { busy, act } = useRowAction();
  const { toast } = useToast();
  const company = d?.me.company ?? v.tenant;
  // Founder answer 9 (30 Oct 2026): a session that ends part-way says so and offers a new sign-in, never a blank page.
  if (live ? live.ended : ended)
    return (
      <TenantPortal tenant={company} portal="Consultants" noLanguage={Boolean(live)} access={{ kind: 'note', text: 'Signed in with a one-time code · ends after 30 minutes' }} footer={{ privacy: 'Privacy notice for consultants (G-09)', ...(live ? { hrefs: LEGAL_LINKS } : {}) }}>
        <EmptyState
          title="Your session ended"
          description="For your safety, a session lasts 30 minutes. Nothing you sent is lost. Sign in again with a new code to carry on."
          action={
            <Button variant="primary" onClick={live?.onSignInAgain}>
              Sign in again
            </Button>
          }
        />
      </TenantPortal>
    );
  return (
    <TenantPortal tenant={company} portal="Consultants" noLanguage={Boolean(live)} access={{ kind: 'note', text: 'Signed in with a one-time code · ends after 30 minutes' }} footer={{ privacy: 'Privacy notice for consultants (G-09)', ...(live ? { hrefs: LEGAL_LINKS } : {}) }}>
      <div className="yx-pay-stack">
        <PageHeader
          title={d ? `${d.me.name}: your invoices` : 'Your invoices'}
          description={`Send invoices to ${company}, follow their approval and payment, and download payment advices and TDS certificates.`}
          actions={
            <>
              <Button onClick={v.onSignOut}>Sign out</Button>
              {d && (
                <Button variant="primary" icon={Upload} onClick={() => (d.canUpload ? setSending(true) : toast({ title: 'Sign in again to send an invoice', description: 'Invoices are sent within 10 minutes of signing in with a new code.', tone: 'warning' }))}>
                  Send an invoice
                </Button>
              )}
            </>
          }
        />
        {/* Live, the page shows loading until the consultant's own data is in, or the error / no-access state of that load. */}
        <PayPageState state={live ? (live.state && live.state !== 'ready' ? live.state : d ? 'ready' : 'loading') : shown} onRetry={live ? live.onRetry : () => setShown('ready')} what="your invoices" grantedBy={company}>
          {d && (
          <>
            {!d.canUpload && (
              <InlineAlert tone="info" title="Sign in again to send an invoice">
                For your safety, invoices are sent within 10 minutes of signing in with a new code.
              </InlineAlert>
            )}
            {d.me.panStatus !== 'operative' && (
              <InlineAlert tone="warning" title="No working PAN on file">
                TDS is deducted at the higher rate (20%) until {company} has your PAN. Send it to them by email.
              </InlineAlert>
            )}
            <FactRow
              items={[
                { label: 'PAN', value: d.me.pan ?? 'None' },
                { label: 'Paid into', value: d.me.bank ? `${d.me.bank.account}${d.me.bank.usable ? '' : ' (being checked)'}` : 'No account yet' },
                { label: 'Invoices', value: String(d.invoices.length) },
              ]}
            />
            <DataTable
              label="Your invoices"
              rows={d.invoices}
              getRowId={(i) => i.id}
              cardSummary
              columns={[
                { key: 'no', header: 'Invoice', value: (i) => i.invoiceNo, render: (i) => (<span>{i.invoiceNo}<span className="yx-pay-note">{dateText(i.invoiceDate)}</span></span>), width: 170 },
                { key: 'taxable', header: 'Before GST', type: 'money', value: (i) => Number(i.taxableValue), render: (i) => rupees(i.taxableValue), width: 130 },
                { key: 'tds', header: 'TDS', value: (i) => i.tds?.amount ?? '', render: tdsText, width: 200 },
                { key: 'net', header: 'Paid to you', type: 'money', value: (i) => Number(i.netPayable ?? 0), render: (i) => rupees(i.netPayable), width: 130 },
                { key: 'status', header: 'Status', type: 'status', value: (i) => INVOICE_STATUS[i.status].label, statusTone: (_, i) => INVOICE_STATUS[i.status].tone, width: 170 },
              ]}
              rowButtons={(i) =>
                i.status === 'paid' ? (
                  <Button size="sm" icon={Download} loading={busy === `a-${i.id}`} onClick={() => act(`a-${i.id}`, () => v.onAdvice(i))}>
                    Payment advice
                  </Button>
                ) : null
              }
              empty={<EmptyState title="No invoices yet" description="Send your first invoice as a PDF." />}
            />
            <section className="yx-pay-stack" aria-label="TDS certificates">
              <SectionTitle>TDS certificates</SectionTitle>
              {!d.certificates.length ? (
                <p className="yx-pay-muted">Certificates appear here after each quarter’s return is filed.</p>
              ) : (
                <div className="yx-pay-row">
                  {d.certificates.map((c) => (
                    <Button key={c.id} size="sm" icon={Download} loading={busy === `c-${c.id}`} onClick={() => act(`c-${c.id}`, () => v.onCertificate(c))}>
                      {c.form} · {c.taxYear} Q{c.quarter}
                    </Button>
                  ))}
                </div>
              )}
            </section>
          </>
          )}
        </PayPageState>
      </div>
      {sending && <PortalInvoiceDrawer company={company} onClose={() => setSending(false)} onSave={v.onUpload} />}
    </TenantPortal>
  );
}

function PortalInvoiceDrawer({ company, onClose, onSave }: { company: string; onClose: () => void; onSave: LiveConsultantPortal['onUpload'] }) {
  const [x, setX] = useState<InvoiceForm>(EMPTY_INVOICE);
  const [file, setFile] = useState<File | null>(null);
  const errors: FormErrorItem[] = [...invoiceErrors(x), ...(!file ? [{ fieldId: 'iv-file', message: 'Attach the invoice as a PDF.' }] : [])];
  return (
    <PayFormDrawer title="Send an invoice" subtitle={`It goes to ${company} for approval. You see the TDS once it is approved.`} confirm="Send invoice" done={`Invoice ${x.no.trim()} sent`} errors={errors} onClose={onClose} onSave={() => onSave(invoiceInput(x), file!)}>
      {(errorOf) => (
        <>
          <InvoiceFields x={x} set={(f) => setX((o) => ({ ...o, ...f }))} errorOf={errorOf} />
          <FormField id="iv-file-field" label="Invoice (PDF, up to 5 MB)" required error={errorOf('iv-file')}>
            <div className="yx-pay-row">
              <PayFileButton id="iv-file" label={file ? 'Change PDF' : 'Attach PDF'} accept="application/pdf" ariaLabel="Attach the invoice PDF" onFile={setFile} />
              {file && <span className="yx-pay-muted">{file.name}</span>}
            </div>
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}
