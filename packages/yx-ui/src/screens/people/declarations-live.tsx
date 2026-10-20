// Live versions of the declarations screens: the disability declaration (PPL-38), BFSI declarations (PPL-43) and
// trading pre-clearance (PPL-44), for the person and for the HR diversity role / compliance officer; and merging and
// unmerging two records of one person (PPL-37). The API checks every key, class and decision.
import { useMemo, useState, type ReactNode } from 'react';
import { FileText, GitMerge, Plus, ShieldCheck, Split } from 'lucide-react';
import { Button } from '../../components/button';
import { Card, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { PersonPicker, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Drawer } from '../../components/drawer';
import { DataTable, type TableColumn } from '../../components/table';
import { FileUpload } from '../../components/upload';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { ListSkeleton, MeFrame, PeopleFrame, StatusBadge } from './people-kit';

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work. Try again.');
const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
type Load = 'loading' | 'ready' | 'error';

/** A primary action that may fail: busy while it runs, the error beside it. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

function FormDialog({ title, action, disabled, onClose, onSubmit, children }: { title: string; action: string; disabled?: boolean; onClose: () => void; onSubmit: () => Promise<unknown>; children: ReactNode }) {
  const a = useAction();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !a.busy && onClose()}
      title={title}
      size="md"
      preventClose={a.busy}
      notice={a.error && <InlineAlert tone="danger">{a.error}</InlineAlert>}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={disabled} loading={a.busy} onClick={async () => (await a.run(onSubmit)) && onClose()}>
            {action}
          </Button>
        </>
      }
    >
      <div className="yx-ppl__form">{children}</div>
    </Dialog>
  );
}

/* ================================================================== PPL-38 disability (the person) */

export interface DisabilityView {
  id: string;
  category: string;
  percent: number;
  validUntil: string | null;
  adjustments: string | null;
  status: 'declared' | 'verified';
  consentOn: string;
  certificate: string | null;
  version: number;
}
export interface LiveDisability {
  state: Load;
  onRetry: () => void;
  data: { declaration: DisabilityView | null; categories: readonly string[] } | null;
  company: string;
  /** Uploads the certificate (the person's own document); returns its id. */
  onUpload: (file: File) => Promise<string>;
  onDeclare: (input: { consent: true; category: string; percent: number; certificateDocumentId: string; validUntil: string | null; adjustments: string | null }) => Promise<void>;
  onWithdraw: () => Promise<void>;
  onSkip: () => void;
  /** Other declarations for this person (BFSI), shown as links. */
  more?: ReactNode;
}

export function LiveDisabilityDeclaration({ live }: { live: LiveDisability }) {
  const d = live.data?.declaration ?? null;
  const [consent, setConsent] = useState(false);
  const [has, setHas] = useState<'yes' | 'no' | 'skip'>('yes');
  const [category, setCategory] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [until, setUntil] = useState<Date | null>(null);
  const [adjust, setAdjust] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  const a = useAction();
  const ready = consent && has === 'yes' && category && percent && percent > 0 && percent <= 100 && doc;
  return (
    <MeFrame active="Declarations">
      <PageHeader title="Disability declaration" status={d ? <StatusBadge status={d.status === 'verified' ? 'Verified' : 'Pending verification'} /> : undefined} />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load your declaration" description="Try again in a moment." onRetry={live.onRetry} />
      ) : !live.data ? (
        <ListSkeleton rows={4} label="Loading your declaration" />
      ) : d ? (
        <Card title="Your declaration" actions={<Button variant="danger" onClick={() => setWithdraw(true)}>Withdraw consent</Button>}>
          <dl className="yx-ppl__rail-facts">
            <div><dt>Category</dt><dd>{d.category} · {d.percent}%</dd></div>
            <div><dt>Certificate</dt><dd>{d.validUntil ? `Valid until ${formatDate(day(d.validUntil))} · ` : ''}{d.status === 'verified' ? 'verified by HR' : 'waiting for HR to verify'}</dd></div>
            {d.adjustments && <div><dt>Adjustments</dt><dd>{d.adjustments}</dd></div>}
            <div><dt>Consent</dt><dd>Given on {formatDate(day(d.consentOn))}</dd></div>
          </dl>
          <Text size="sm" tone="secondary" as="p">Withdrawing hides this from everyone except the audit trail.</Text>
        </Card>
      ) : (
        <>
          <div className="yx-ppl__form">
            <InlineAlert tone="info" title="This is voluntary">
              You can skip it or withdraw it at any time. It is Special data: you and the HR diversity role can see it. Your manager never does. Reports show only totals.
            </InlineAlert>
            <Checkbox checked={consent} onChange={setConsent} label={`I agree ${live.company} may record this to provide reasonable adjustments and apply the correct ESI ceiling`} />
            <FormField label="Do you have a disability you want to declare?" required>
              <RadioGroup value={has} onChange={(v) => setHas(v as typeof has)} disabled={!consent} orientation="horizontal" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'skip', label: 'Prefer not to say' }]} />
            </FormField>
            {has === 'yes' && (
              <>
                <FormField label="Category (RPwD Act 2016)" required>
                  <Select options={live.data.categories.map((x) => ({ value: x, label: x }))} value={category} onChange={setCategory} disabled={!consent} placeholder="Choose a category" />
                </FormField>
                <FormField label="Percentage on the certificate" required>
                  <NumberField value={percent} onChange={setPercent} disabled={!consent} suffix="%" min={1} max={100} />
                </FormField>
                <FormField label="Disability certificate (UDID or medical board)" required>
                  <FileUpload
                    upload={async (f) => {
                      setDoc(await live.onUpload(f));
                    }}
                    accept={['.pdf', '.jpg', '.png']}
                    maxSize={5 * 1024 * 1024}
                    multiple={false}
                    disabled={!consent}
                  />
                </FormField>
                <FormField label="Valid until">
                  <DatePicker value={until} onChange={setUntil} />
                </FormField>
                <FormField label="Reasonable adjustments you need" optional>
                  <TextArea rows={2} value={adjust} onChange={setAdjust} disabled={!consent} maxLength={1000} />
                </FormField>
              </>
            )}
            {has !== 'yes' && consent && <Text size="sm" tone="secondary" as="p">Nothing is recorded. You can come back to this at any time.</Text>}
          </div>
          {a.error && <InlineAlert tone="danger">{a.error}</InlineAlert>}
          <div className="yx-ppl__row">
            <Button onClick={live.onSkip}>Skip</Button>
            <Button
              variant="primary"
              disabled={!ready}
              loading={a.busy}
              onClick={() => void a.run(() => live.onDeclare({ consent: true, category: category!, percent: percent!, certificateDocumentId: doc!, validUntil: until ? isoOf(until) : null, adjustments: adjust.trim() || null }))}
            >
              Save declaration
            </Button>
          </div>
        </>
      )}
      {live.more}
      <ConfirmDialog
        open={withdraw}
        onOpenChange={setWithdraw}
        title="Withdraw your disability declaration?"
        consequence="It is hidden from everyone at once. Only the audit trail keeps that it existed. You can declare again later."
        confirmLabel="Withdraw consent"
        destructive
        onConfirm={async () => {
          await live.onWithdraw();
          setWithdraw(false);
        }}
      />
    </MeFrame>
  );
}

/* ================================================================== PPL-38 disability (HR diversity role) */

export interface DisabilityRow extends DisabilityView {
  employeeId: string;
  name: string;
  shown: 'Verified' | 'Expiring' | 'Needs review';
  canVerify: boolean;
}
export interface LiveDisabilityList {
  state: Load;
  onRetry: () => void;
  rows: DisabilityRow[] | null;
  onVerify: (row: DisabilityRow) => Promise<void>;
}

export function LiveDisabilityList({ live, tabs }: { live: LiveDisabilityList; tabs?: ReactNode }) {
  const [verifying, setVerifying] = useState<DisabilityRow | null>(null);
  const cols: TableColumn<DisabilityRow>[] = [
    { key: 'n', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }), width: 220 },
    { key: 'c', header: 'Category', value: (r) => `${r.category} · ${r.percent}%`, width: 240 },
    { key: 'v', header: 'Certificate valid to', value: (r) => (r.validUntil ? formatDate(day(r.validUntil)) : '—'), width: 180 },
    { key: 's', header: 'Status', type: 'status', value: (r) => r.shown, statusTone: (v) => (v === 'Verified' ? 'success' : 'warning'), width: 140 },
  ];
  return (
    <PeopleFrame active="Declarations">
      <PageHeader title="Disability declarations" description="Special class. Visible to the HR diversity role. Managers never see this." status={<Badge tone="danger">Special</Badge>} />
      {tabs}
      <InlineAlert tone="info">Totals in reports are hidden for groups under 5 people.</InlineAlert>
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the declarations" description="Try again in a moment." onRetry={live.onRetry} />
      ) : !live.rows ? (
        <ListSkeleton label="Loading the declarations" />
      ) : (
        <DataTable label="Declarations" columns={cols} rows={live.rows} getRowId={(r) => r.id} rowButtons={(r) => (r.canVerify ? <Button size="sm" onClick={() => setVerifying(r)}>Verify</Button> : null)} empty={<EmptyState title="No declarations" description="Employees declare from their own record. Nothing is shown until they do." />} />
      )}
      <ConfirmDialog
        open={!!verifying}
        onOpenChange={(o) => !o && setVerifying(null)}
        title={`Verify ${verifying?.name ?? ''}'s declaration?`}
        consequence="You checked the certificate in their documents. The person sees it as verified."
        confirmLabel="Verify"
        onConfirm={async () => {
          if (verifying) await live.onVerify(verifying);
          setVerifying(null);
        }}
      />
    </PeopleFrame>
  );
}

/* ================================================================== PPL-43 BFSI declarations (the person) */

export interface Holding {
  security: string;
  quantity: number;
  how: string;
}
export interface RelatedView {
  name: string;
  relation: string;
  pan: string | null;
  holdings: string | null;
}
export interface BfsiDeclarationView {
  id: string;
  year: string;
  dueOn: string;
  holdings: Holding[];
  related: RelatedView[];
  coiHas: boolean | null;
  coiDetails: string | null;
  status: 'draft' | 'submitted' | 'reviewed';
  attestedAt: string | null;
  version: number;
}
export interface BfsiSaveInput {
  holdings: Holding[];
  /** pan: a new related person's full PAN; existing ones keep theirs (undefined). */
  related: { name: string; relation: string; pan?: string | null; holdings: string | null }[];
  coiHas: boolean | null;
  coiDetails: string | null;
  version: number;
}
export interface LiveBfsi {
  today: string;
  declaration: BfsiDeclarationView;
  relations: readonly string[];
  onSave: (input: BfsiSaveInput) => Promise<void>;
  onSendOtp: () => Promise<{ sentTo: string }>;
  onSubmit: (code: string) => Promise<void>;
}

export function LiveBfsiDeclarations({ live }: { live: LiveBfsi }) {
  const d = live.declaration;
  const [t, setT] = useState<'holdings' | 'related' | 'coi' | 'attest'>('holdings');
  const [adding, setAdding] = useState<'holding' | 'related' | null>(null);
  const [coiHas, setCoiHas] = useState<boolean | null>(d.coiHas);
  const [coiDetails, setCoiDetails] = useState(d.coiDetails ?? '');
  const [attest, setAttest] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const a = useAction();
  const left = daysUntil(live.today, d.dueOn);
  const done = d.status !== 'draft';
  // Saving sends the whole draft (existing related persons keep their PAN on the server).
  const save = (over: Partial<BfsiSaveInput>) =>
    a.run(() => live.onSave({ holdings: d.holdings, related: d.related.map((r) => ({ name: r.name, relation: r.relation, holdings: r.holdings })), coiHas, coiDetails: coiDetails.trim() || null, version: d.version, ...over }));
  const status = done ? <StatusBadge status={d.status === 'reviewed' ? 'Verified' : 'Done'} /> : <Badge tone={left < 0 ? 'danger' : 'warning'}>{left < 0 ? `Overdue by ${-left} days` : `Due in ${left} days`}</Badge>;
  return (
    <MeFrame active="Declarations">
      <PageHeader title={`Annual declarations ${d.year.replace('-', '–')}`} description={`You are a designated person. Submit holdings, related persons and conflicts by ${formatDate(day(d.dueOn))}, and attest the code of conduct.`} status={status} />
      {done && <InlineAlert tone="success" title={`Submitted${d.attestedAt ? ` on ${formatDate(new Date(d.attestedAt))}` : ''}`}>{d.status === 'reviewed' ? 'The compliance officer has reviewed it.' : 'The compliance officer reviews it. Changes now go through them.'}</InlineAlert>}
      {a.error && <InlineAlert tone="danger">{a.error}</InlineAlert>}
      <Tabs value={t} onValueChange={(v) => setT(v as typeof t)}>
        <TabsList aria-label="Declarations">
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="related">Related persons</TabsTrigger>
          <TabsTrigger value="coi">Conflict of interest</TabsTrigger>
          <TabsTrigger value="attest">Code of conduct</TabsTrigger>
        </TabsList>
        <TabsContent value="holdings">
          <div className="yx-ppl__stack">
            {d.holdings.length ? (
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Holdings, scrolls sideways on small screens">
                <table className="yx-ppl__impact">
                  <thead>
                    <tr><th scope="col">Security</th><th scope="col">Quantity</th><th scope="col">How held</th>{!done && <th scope="col"><span className="yx-sr-only">Remove</span></th>}</tr>
                  </thead>
                  <tbody>
                    {d.holdings.map((h, i) => (
                      <tr key={`${h.security}${i}`}>
                        <td>{h.security}</td>
                        <td className="yx-ppl__num">{h.quantity.toLocaleString('en-IN')}</td>
                        <td>{h.how}</td>
                        {!done && <td><Button size="sm" onClick={() => void save({ holdings: d.holdings.filter((_, j) => j !== i) })}>Remove</Button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Text as="p">No holdings declared. Add each security you, or anyone you trade for, hold.</Text>
            )}
            {!done && <div><Button icon={Plus} onClick={() => setAdding('holding')}>Add holding</Button></div>}
          </div>
        </TabsContent>
        <TabsContent value="related">
          <div className="yx-ppl__stack">
            {d.related.length ? (
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Related persons, scrolls sideways on small screens">
                <table className="yx-ppl__impact">
                  <thead>
                    <tr><th scope="col">Name</th><th scope="col">Relation</th><th scope="col">PAN</th><th scope="col">Holdings</th></tr>
                  </thead>
                  <tbody>
                    {d.related.map((r, i) => (
                      <tr key={`${r.name}${i}`}><td>{r.name}</td><td>{r.relation}</td><td className="yx-mono">{r.pan ?? '—'}</td><td>{r.holdings ?? 'None'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Text as="p">No related persons declared yet.</Text>
            )}
            {!done && <div><Button icon={Plus} onClick={() => setAdding('related')}>Add related person</Button></div>}
          </div>
        </TabsContent>
        <TabsContent value="coi">
          <div className="yx-ppl__form">
            <FormField label="Do you or a related person have an interest in a supplier, customer or competitor?" required>
              <RadioGroup value={coiHas === null ? undefined : coiHas ? 'yes' : 'no'} onChange={(v) => setCoiHas(v === 'yes')} orientation="horizontal" disabled={done} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
            </FormField>
            {coiHas && (
              <FormField label="Details" required>
                <TextArea rows={3} value={coiDetails} onChange={setCoiDetails} disabled={done} maxLength={2000} />
              </FormField>
            )}
            {!done && (
              <div>
                <Button loading={a.busy} disabled={coiHas === null || (coiHas && !coiDetails.trim())} onClick={() => void save({})}>
                  Save draft
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="attest">
          <div className="yx-ppl__form">
            <Card title={`Code of conduct, ${d.year}`}>
              <Text as="p">Read the company code of conduct before you attest. Your attestation is recorded with the one-time code.</Text>
            </Card>
            {!done && (
              <>
                <Checkbox checked={attest} onChange={setAttest} label={`I have read and will follow the code of conduct for ${d.year}`} />
                {sentTo ? (
                  <FormField label={`Code sent to ${sentTo}`} required helper="Valid for 5 minutes.">
                    <TextField inputMode="numeric" value={code} onChange={setCode} maxLength={6} />
                  </FormField>
                ) : null}
                <div className="yx-ppl__row">
                  <Button onClick={() => void save({})}>Save draft</Button>
                  <Button
                    variant="primary"
                    icon={ShieldCheck}
                    loading={a.busy}
                    disabled={!attest || coiHas === null || (Boolean(sentTo) && code.length !== 6)}
                    onClick={() => void a.run(async () => (sentTo ? live.onSubmit(code) : setSentTo((await live.onSendOtp()).sentTo)))}
                  >
                    {sentTo ? 'Verify and submit' : 'Send code to attest'}
                  </Button>
                </div>
                {coiHas === null && <Text size="sm" tone="secondary" as="p">Answer the conflict of interest question first.</Text>}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {adding === 'holding' && (
        <HoldingDialog
          onClose={() => setAdding(null)}
          onAdd={(h) => live.onSave({ holdings: [...d.holdings, h], related: d.related.map((x) => ({ name: x.name, relation: x.relation, holdings: x.holdings })), coiHas, coiDetails: coiDetails.trim() || null, version: d.version })}
        />
      )}
      {adding === 'related' && (
        <RelatedDialog
          relations={live.relations}
          onClose={() => setAdding(null)}
          onAdd={(r) =>
            live.onSave({ holdings: d.holdings, related: [...d.related.map((x) => ({ name: x.name, relation: x.relation, holdings: x.holdings })), r], coiHas, coiDetails: coiDetails.trim() || null, version: d.version })
          }
        />
      )}
    </MeFrame>
  );
}

function HoldingDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (h: Holding) => Promise<void> }) {
  const [security, setSecurity] = useState('');
  const [qty, setQty] = useState<number | null>(null);
  const [how, setHow] = useState('');
  return (
    <FormDialog title="Add a holding" action="Add holding" disabled={security.trim().length < 2 || !qty || how.trim().length < 2} onClose={onClose} onSubmit={() => onAdd({ security: security.trim(), quantity: qty!, how: how.trim() })}>
      <FormField label="Security" required>
        <TextField value={security} onChange={setSecurity} maxLength={160} placeholder="Deccan Agro Industries Ltd" />
      </FormField>
      <FormField label="Quantity" required>
        <NumberField value={qty} onChange={setQty} min={1} />
      </FormField>
      <FormField label="How held" required>
        <TextField value={how} onChange={setHow} maxLength={80} placeholder="Demat · NSDL" />
      </FormField>
    </FormDialog>
  );
}

function RelatedDialog({ relations, onClose, onAdd }: { relations: readonly string[]; onClose: () => void; onAdd: (r: { name: string; relation: string; pan: string | null; holdings: string | null }) => Promise<void> }) {
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<string | null>(null);
  const [pan, setPan] = useState('');
  const [holdings, setHoldings] = useState('');
  const panOk = !pan || /^[A-Z]{5}\d{4}[A-Z]$/.test(pan.toUpperCase());
  return (
    <FormDialog title="Add a related person" action="Add related person" disabled={name.trim().length < 2 || !relation || !panOk} onClose={onClose} onSubmit={() => onAdd({ name: name.trim(), relation: relation!, pan: pan ? pan.toUpperCase() : null, holdings: holdings.trim() || null })}>
      <FormField label="Name" required>
        <TextField value={name} onChange={setName} maxLength={120} />
      </FormField>
      <FormField label="Relation" required>
        <Select options={relations.map((r) => ({ value: r, label: r }))} value={relation} onChange={setRelation} placeholder="Choose a relation" />
      </FormField>
      <FormField label="PAN" error={panOk ? null : 'Enter a 10-character PAN like ABCDE1234F.'} helper="Stored encrypted; only the last 4 characters are shown.">
        <TextField value={pan} onChange={setPan} maxLength={10} className="yx-mono" />
      </FormField>
      <FormField label="Their holdings" optional>
        <TextField value={holdings} onChange={setHoldings} maxLength={200} placeholder="Deccan Agro Industries Ltd · 80" />
      </FormField>
    </FormDialog>
  );
}

/* ================================================================== PPL-43 the compliance officer's register */

export interface RegisterRow {
  employeeId: string;
  declarationId: string | null;
  name: string;
  type: string;
  due: string;
  status: 'Pending' | 'Overdue' | 'Done' | 'Reviewed';
  mine: boolean;
  version: number | null;
}
export interface LiveRegister {
  state: Load;
  onRetry: () => void;
  data: { year: string; rows: RegisterRow[]; windows: { id: string; from: string; to: string; reason: string }[] } | null;
  people: { id: string; name: string; role?: string }[];
  onDesignate: (employeeId: string) => Promise<void>;
  onOpen: (row: RegisterRow) => Promise<BfsiDeclarationView>;
  onReview: (row: RegisterRow) => Promise<void>;
  onCloseWindow: (input: { from: string; to: string; reason: string }) => Promise<void>;
  onExport: (rows: RegisterRow[]) => void;
}

export function LiveBfsiRegister({ live, tabs }: { live: LiveRegister; tabs?: ReactNode }) {
  const [adding, setAdding] = useState<'person' | 'window' | null>(null);
  const [open, setOpen] = useState<{ row: RegisterRow; d: BfsiDeclarationView | null } | null>(null);
  const a = useAction();
  const rows = live.data?.rows ?? [];
  const cols: TableColumn<RegisterRow>[] = [
    { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }), width: 220 },
    { key: 'type', header: 'Declaration', value: (r) => r.type, groupable: true, width: 300 },
    { key: 'due', header: 'Due', type: 'date', value: (r) => day(r.due), width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Done' || v === 'Reviewed' ? 'success' : v === 'Overdue' ? 'danger' : 'warning'), width: 130 },
  ];
  const openRow = async (row: RegisterRow) => {
    setOpen({ row, d: null });
    await a.run(async () => setOpen({ row, d: await live.onOpen(row) }));
  };
  return (
    <PeopleFrame active="Declarations">
      <PageHeader
        title="Regulated declarations"
        description="Confidential to the compliance officer."
        status={<Badge tone="warning">Confidential</Badge>}
        actions={
          <>
            <Button icon={FileText} onClick={() => live.onExport(rows)} disabled={!rows.length}>Export register</Button>
            <Button onClick={() => setAdding('window')}>Close trading window</Button>
            <Button variant="primary" icon={Plus} onClick={() => setAdding('person')}>Add designated person</Button>
          </>
        }
      />
      {tabs}
      {live.data?.windows.map((w) => (
        <InlineAlert key={w.id} tone="warning" title={`Trading window closed ${formatDate(day(w.from))} to ${formatDate(day(w.to))}`}>{w.reason}</InlineAlert>
      ))}
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the register" description="Try again in a moment." onRetry={live.onRetry} />
      ) : !live.data ? (
        <ListSkeleton label="Loading the register" />
      ) : (
        <DataTable label="Declarations" columns={cols} rows={rows} getRowId={(r) => r.employeeId} rowButtons={(r) => (r.status === 'Done' && r.declarationId && !r.mine ? <Button variant="review" size="sm" onClick={() => void openRow(r)}>Review</Button> : null)} empty={<EmptyState title="No designated persons" description="Add the people who must declare holdings and ask pre-clearance before trading." />} />
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={`${open?.row.name ?? ''} · declaration ${live.data?.year ?? ''}`}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Close</Button>
            <Button variant="approve" loading={a.busy} disabled={!open?.d} onClick={async () => open && (await a.run(() => live.onReview(open.row))) && setOpen(null)}>
              Mark reviewed
            </Button>
          </>
        }
      >
        {a.error && <InlineAlert tone="danger">{a.error}</InlineAlert>}
        {open?.d ? (
          <dl className="yx-ppl__rail-facts">
            <div><dt>Holdings</dt><dd>{open.d.holdings.length ? open.d.holdings.map((h) => `${h.security} · ${h.quantity.toLocaleString('en-IN')} (${h.how})`).join('; ') : 'None'}</dd></div>
            <div><dt>Related persons</dt><dd>{open.d.related.length ? open.d.related.map((r) => `${r.name} (${r.relation}${r.pan ? `, ${r.pan}` : ''})${r.holdings ? `: ${r.holdings}` : ''}`).join('; ') : 'None'}</dd></div>
            <div><dt>Conflict of interest</dt><dd>{open.d.coiHas ? open.d.coiDetails : 'None declared'}</dd></div>
            <div><dt>Code of conduct</dt><dd>{open.d.attestedAt ? `Attested with a one-time code on ${formatDate(new Date(open.d.attestedAt))}` : 'Not attested'}</dd></div>
          </dl>
        ) : (
          <ListSkeleton rows={3} label="Loading the declaration" />
        )}
      </Drawer>
      {adding === 'person' && <DesignateDialog people={live.people.filter((p) => !rows.some((r) => r.employeeId === p.id))} onClose={() => setAdding(null)} onAdd={live.onDesignate} />}
      {adding === 'window' && <WindowDialog onClose={() => setAdding(null)} onClose2={live.onCloseWindow} />}
    </PeopleFrame>
  );
}

function DesignateDialog({ people, onClose, onAdd }: { people: { id: string; name: string; role?: string }[]; onClose: () => void; onAdd: (id: string) => Promise<void> }) {
  const [who, setWho] = useState<string | null>(null);
  return (
    <FormDialog title="Add a designated person" action="Add designated person" disabled={!who} onClose={onClose} onSubmit={() => onAdd(who!)}>
      <FormField label="Employee" required helper="They declare holdings each year and ask pre-clearance before trading.">
        <PersonPicker people={people} value={who} onChange={setWho} />
      </FormField>
    </FormDialog>
  );
}

function WindowDialog({ onClose, onClose2 }: { onClose: () => void; onClose2: (input: { from: string; to: string; reason: string }) => Promise<void> }) {
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const bad = Boolean(from && to && to < from);
  return (
    <FormDialog title="Close the trading window" action="Close trading window" disabled={!from || !to || bad || reason.trim().length < 3} onClose={onClose} onSubmit={() => onClose2({ from: isoOf(from!), to: isoOf(to!), reason: reason.trim() })}>
      <div className="yx-ppl__row">
        <FormField label="Closed from" required>
          <DatePicker value={from} onChange={setFrom} />
        </FormField>
        <FormField label="Reopens after" required error={bad ? 'The window reopens on or after it closes.' : null}>
          <DatePicker value={to} onChange={setTo} />
        </FormField>
      </div>
      <FormField label="Reason" required>
        <TextField value={reason} onChange={setReason} maxLength={200} placeholder="Quarterly results" />
      </FormField>
    </FormDialog>
  );
}

/* ================================================================== PPL-44 trading pre-clearance */

export interface PreclearView {
  id: string;
  ref: string;
  security: string;
  side: 'buy' | 'sell';
  quantity: number;
  value: number;
  requestedOn: string;
  status: 'Pending' | 'Rejected' | 'Done' | 'Expired' | 'Approved';
  decidedBy: string | null;
  approvedOn: string | null;
  validUntil: string | null;
  note: string | null;
  tradedOn: string | null;
  tradedQuantity: number | null;
  version: number;
}
export interface LivePreclearance {
  today: string;
  window: { closedTo: string; reason: string } | null;
  requests: PreclearView[];
  onRequest: (input: { security: string; side: 'buy' | 'sell'; quantity: number; value: number; noUpsi: true }) => Promise<void>;
  onUploadNote: (file: File) => Promise<string>;
  onReport: (r: PreclearView, input: { tradedOn: string; quantity: number; contractNoteDocumentId: string }) => Promise<void>;
}
const tradeText = (r: { side: string; quantity: number; security: string }) => `${r.side === 'buy' ? 'Buy' : 'Sell'} ${r.quantity.toLocaleString('en-IN')} ${r.security}`;

export function LiveTradingPreclearance({ live }: { live: LivePreclearance }) {
  const [security, setSecurity] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [upsi, setUpsi] = useState(false);
  const a = useAction();
  const blocked = Boolean(live.window);
  const current = live.requests.filter((r) => r.status !== 'Rejected').slice(0, 3);
  return (
    <MeFrame active="Declarations">
      <PageHeader title="Trading pre-clearance" description="Designated persons need pre-clearance before a trade. Approval is valid for 7 trading days and never during a closed trading window." />
      {live.window && <InlineAlert tone="danger" title={`Trading window closed until ${formatDate(day(live.window.closedTo))}`}>{live.window.reason}. You can't request a pre-clearance until the window reopens.</InlineAlert>}
      {current.map((r) => <RequestCard key={r.id} r={r} live={live} />)}
      <div className="yx-ppl__form">
        <h3 className="yx-ppl__section-title">New request</h3>
        <FormField label="Security" required>
          <TextField value={security} onChange={setSecurity} maxLength={160} disabled={blocked} placeholder="Deccan Agro Industries Ltd" />
        </FormField>
        <FormField label="Buy or sell" required>
          <RadioGroup value={side} onChange={(v) => setSide(v as 'buy' | 'sell')} orientation="horizontal" disabled={blocked} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
        </FormField>
        <FormField label="Quantity" required>
          <NumberField value={qty} onChange={setQty} disabled={blocked} min={1} />
        </FormField>
        <FormField label="Approximate value" required>
          <CurrencyField value={value} onChange={setValue} disabled={blocked} />
        </FormField>
        <Checkbox label="I don't hold unpublished price-sensitive information about this company" checked={upsi} onChange={setUpsi} disabled={blocked} />
        {a.error && <InlineAlert tone="danger">{a.error}</InlineAlert>}
        <div className="yx-ppl__row">
          <Button
            variant="primary"
            loading={a.busy}
            disabled={blocked || security.trim().length < 2 || !qty || !value || !upsi}
            onClick={async () => {
              if (await a.run(() => live.onRequest({ security: security.trim(), side, quantity: qty!, value: value!, noUpsi: true }))) {
                setSecurity('');
                setQty(null);
                setValue(null);
                setUpsi(false);
              }
            }}
          >
            Request pre-clearance
          </Button>
        </div>
      </div>
    </MeFrame>
  );
}

function RequestCard({ r, live }: { r: PreclearView; live: LivePreclearance }) {
  const [tradedOn, setTradedOn] = useState<Date | null>(day(live.today));
  const [qty, setQty] = useState<number | null>(r.quantity);
  const [note, setNote] = useState<string | null>(null);
  const a = useAction();
  return (
    <Card title={`${tradeText(r)} · ${r.ref}`} actions={<StatusBadge status={r.status === 'Pending' ? 'Pending approval' : r.status} />}>
      <dl className="yx-ppl__rail-facts">
        <div><dt>Decision</dt><dd>{r.status === 'Pending' ? 'Waiting for the compliance officer' : `${r.status === 'Rejected' ? 'Rejected' : 'Approved'} by ${r.decidedBy ?? 'the compliance officer'}${r.approvedOn ? ` on ${formatDate(day(r.approvedOn))}` : ''}`}</dd></div>
        {r.validUntil && <div><dt>Valid until</dt><dd>{formatDate(day(r.validUntil))}</dd></div>}
        <div><dt>Value</dt><dd>{formatINR(r.value)}</dd></div>
      </dl>
      {r.status === 'Approved' && (
        <div className="yx-ppl__form">
          <h3 className="yx-ppl__section-title">Report the trade</h3>
          <FormField label="Traded on" required>
            <DatePicker value={tradedOn} onChange={setTradedOn} />
          </FormField>
          <FormField label="Quantity traded" required>
            <NumberField value={qty} onChange={setQty} min={1} max={r.quantity} />
          </FormField>
          <FormField label="Contract note" required>
            <FileUpload upload={async (f) => setNote(await live.onUploadNote(f))} accept={['.pdf']} maxSize={5 * 1024 * 1024} multiple={false} />
          </FormField>
          {a.error && <InlineAlert tone="danger">{a.error}</InlineAlert>}
          <div>
            <Button variant="primary" loading={a.busy} disabled={!tradedOn || !qty || !note} onClick={() => void a.run(() => live.onReport(r, { tradedOn: isoOf(tradedOn!), quantity: qty!, contractNoteDocumentId: note! }))}>
              Report trade
            </Button>
          </div>
        </div>
      )}
      {r.status === 'Expired' && <InlineAlert tone="warning">The window ended without a trade report. Report the trade if you made it, or request again.</InlineAlert>}
      {r.status === 'Done' && <InlineAlert tone="success">Trade reported{r.tradedOn ? ` for ${formatDate(day(r.tradedOn))}` : ''}. Late or missing reports alert the compliance officer.</InlineAlert>}
    </Card>
  );
}

export interface QueueRow extends PreclearView {
  employeeId: string;
  name: string;
  mine: boolean;
}
export interface LivePreclearQueue {
  state: Load;
  onRetry: () => void;
  rows: QueueRow[] | null;
  onDecide: (r: QueueRow, approve: boolean, note: string | null) => Promise<void>;
}

export function LivePreclearanceQueue({ live, tabs }: { live: LivePreclearQueue; tabs?: ReactNode }) {
  const [rejecting, setRejecting] = useState<QueueRow | null>(null);
  const [why, setWhy] = useState('');
  const cols: TableColumn<QueueRow>[] = [
    { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }), width: 200 },
    { key: 'trade', header: 'Trade', value: (r) => tradeText(r), width: 300 },
    { key: 'value', header: 'Value', type: 'money', value: (r) => r.value, width: 140 },
    { key: 'requested', header: 'Requested', type: 'date', value: (r) => day(r.requestedOn), width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Approved' || v === 'Done' ? 'success' : v === 'Expired' || v === 'Rejected' ? 'neutral' : 'warning'), width: 120 },
  ];
  return (
    <PeopleFrame active="Declarations">
      <PageHeader title="Pre-clearance requests" status={<Badge tone="warning">Confidential</Badge>} description="Decide within 2 working days. Approvals are valid for 7 trading days." />
      {tabs}
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the requests" description="Try again in a moment." onRetry={live.onRetry} />
      ) : !live.rows ? (
        <ListSkeleton label="Loading the requests" />
      ) : (
        <DataTable
          label="Pre-clearance requests"
          columns={cols}
          rows={live.rows}
          getRowId={(r) => r.id}
          rowButtons={(r) =>
            r.status === 'Pending' && !r.mine ? (
              <>
                <Button size="sm" onClick={() => setRejecting(r)}>Reject</Button>
                <Button variant="approve" size="sm" onClick={() => void live.onDecide(r, true, null)}>Approve</Button>
              </>
            ) : null
          }
          empty={<EmptyState title="No requests" description="Designated persons ask here before they trade." />}
        />
      )}
      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && (setRejecting(null), setWhy(''))}
        title={`Reject ${rejecting?.name ?? ''}'s request?`}
        consequence="They can't trade on it. They see your reason."
        confirmLabel="Reject"
        destructive
        confirmDisabled={why.trim().length < 3}
        onConfirm={async () => {
          if (rejecting) await live.onDecide(rejecting, false, why.trim());
          setRejecting(null);
          setWhy('');
        }}
      >
        <FormField label="Reason" required>
          <TextArea rows={2} value={why} onChange={setWhy} maxLength={500} />
        </FormField>
      </ConfirmDialog>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-37 merge and unmerge */

export interface MergeSide {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  dob: string | null;
  pan: string | null;
  uan: string | null;
  employee: { id: string; code: string | null; joined: string | null; left: string | null } | null;
  roles: { id: string; type: string; label: string; from: string; to: string | null }[];
}
export interface LiveMerge {
  state: Load;
  onRetry: () => void;
  data: { a: MergeSide; b: MergeSide; blocked: string | null } | null;
  onMerge: (input: { picks: { name: 'a' | 'b'; email: 'a' | 'b'; phone: 'a' | 'b' }; note: string }) => Promise<void>;
  onCancel: () => void;
}

const roleText = (s: MergeSide) => (s.roles.length ? s.roles.map((r) => r.label).join(', ') : s.employee ? 'Employee' : 'No roles');

export function LiveMergeReview({ live }: { live: LiveMerge }) {
  const [picks, setPicks] = useState<{ name: 'a' | 'b'; email: 'a' | 'b'; phone: 'a' | 'b' }>({ name: 'a', email: 'a', phone: 'a' });
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const a = useAction();
  const d = live.data;
  const rows = useMemo(
    () =>
      d
        ? [
            { label: 'Name', key: 'name' as const, a: d.a.name, b: d.b.name },
            { label: 'Primary email', key: 'email' as const, a: d.a.email, b: d.b.email },
            { label: 'Primary phone', key: 'phone' as const, a: d.a.phone, b: d.b.phone },
            { label: 'Date of birth', key: null, a: d.a.dob, b: d.b.dob },
            { label: 'PAN', key: null, a: d.a.pan, b: d.b.pan },
            { label: 'UAN', key: null, a: d.a.uan, b: d.b.uan },
          ]
        : [],
    [d],
  );
  const noteError = tried && note.trim().length < 5 ? 'Enter why you are merging. It goes to the link log.' : null;
  return (
    <PeopleFrame active="Possible same person">
      <PageHeader title="Merge two records" description="Pick the value to keep for each field. Every role moves to the merged person; nothing is deleted and you can unmerge later." />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the two records" description="Try again in a moment." onRetry={live.onRetry} />
      ) : !d ? (
        <ListSkeleton label="Loading the two records" />
      ) : (
        <>
          {d.blocked && <InlineAlert tone="danger" title="These records can't be merged">{d.blocked}</InlineAlert>}
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-ppl__impact">
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Record A · {roleText(d.a).toLowerCase()}</th>
                  <th scope="col">Record B · {roleText(d.b).toLowerCase()}</th>
                  <th scope="col">Keep</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.label}>
                    <th scope="row">{f.label}</th>
                    <td className="yx-mono">{f.a ?? '—'}</td>
                    <td className="yx-mono">{f.b ?? '—'}</td>
                    <td>
                      {f.key ? (
                        <RadioGroup aria-label={`Keep ${f.label}`} orientation="horizontal" value={picks[f.key]} onChange={(v) => setPicks({ ...picks, [f.key!]: v as 'a' | 'b' })} options={[{ value: 'a', label: 'A', disabled: !f.a }, { value: 'b', label: 'B', disabled: !f.b }]} />
                      ) : (
                        <Text size="sm" tone="secondary">Stays with the employee record</Text>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Card title="Roles that move to the merged person">
            <ul className="yx-ppl__successors">
              {d.b.roles.map((r) => (
                <li key={r.id}>
                  <span>{r.label} · from {formatDate(day(r.from))}{r.to ? ` to ${formatDate(day(r.to))}` : ''}</span>
                  <Badge tone="info">Moves</Badge>
                </li>
              ))}
              {d.b.employee && (
                <li>
                  <span>Employee record {d.b.employee.code ?? ''}</span>
                  <Badge tone="info">Moves</Badge>
                </li>
              )}
              {d.a.roles.map((r) => (
                <li key={r.id}>
                  <span>{r.label} · from {formatDate(day(r.from))}{r.to ? ` to ${formatDate(day(r.to))}` : ''}</span>
                  <Badge tone="neutral">Stays</Badge>
                </li>
              ))}
            </ul>
            <Text size="sm" tone="secondary" as="p">Documents, letters, cases and identity checks of record B move with it. Consents stay on record B as signed, and point to the merged person.</Text>
          </Card>
          <div className="yx-ppl__form">
            <FormField label="Audit note" required error={noteError}>
              <TextArea rows={2} value={note} onChange={setNote} maxLength={1000} />
            </FormField>
            {a.error && <InlineAlert tone="danger">{a.error}</InlineAlert>}
            <div className="yx-ppl__row">
              <Button onClick={live.onCancel}>Cancel</Button>
              <Button
                variant="primary"
                icon={GitMerge}
                loading={a.busy}
                disabled={Boolean(d.blocked)}
                onClick={() => {
                  setTried(true);
                  if (note.trim().length >= 5) void a.run(() => live.onMerge({ picks, note: note.trim() }));
                }}
              >
                Merge records
              </Button>
            </div>
          </div>
        </>
      )}
    </PeopleFrame>
  );
}

export interface MergeRecordView {
  id: string;
  kept: { personId: string; name: string };
  merged: { personId: string; name: string };
  mergedAt: string;
  mergedBy: string | null;
  note: string;
  unmergedAt: string | null;
  unmergeNote: string | null;
  roles: { id: string; label: string; from: string; to: string | null }[];
  rows: { what: string; count: number }[];
}
export interface LiveUnmerge {
  state: Load;
  onRetry: () => void;
  data: MergeRecordView | null;
  onUnmerge: (note: string) => Promise<void>;
}

export function LiveUnmerge({ live }: { live: LiveUnmerge }) {
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const d = live.data;
  if (live.state === 'error') return <PeopleFrame active="Possible same person"><ErrorState title="We couldn't load this merge" description="Try again in a moment." onRetry={live.onRetry} /></PeopleFrame>;
  if (!d) return <PeopleFrame active="Possible same person"><ListSkeleton label="Loading the merge" /></PeopleFrame>;
  return (
    <PeopleFrame active="Possible same person">
      <ObjectHeader
        name={d.kept.name}
        person
        secondary={`Merged ${d.merged.name} into this record on ${formatDate(new Date(d.mergedAt))}${d.mergedBy ? ` by ${d.mergedBy}` : ''} · ${d.note}`}
        status={<Badge tone={d.unmergedAt ? 'neutral' : 'info'}>{d.unmergedAt ? 'Unmerged' : 'Merged record'}</Badge>}
        actions={d.unmergedAt ? undefined : <Button icon={Split} variant="danger" onClick={() => setConfirm(true)}>Unmerge</Button>}
      />
      {d.unmergedAt && <InlineAlert tone="info" title={`Unmerged on ${formatDate(new Date(d.unmergedAt))}`}>{d.unmergeNote}</InlineAlert>}
      <Card title={d.unmergedAt ? 'What unmerge restored' : 'What unmerge restores'}>
        <ul className="yx-ppl__successors">
          {d.roles.map((r) => (
            <li key={r.id}>
              <span>{r.label} · from {formatDate(day(r.from))}{r.to ? ` to ${formatDate(day(r.to))}` : ''}</span>
              <Badge tone="neutral">Back to {d.merged.name}</Badge>
            </li>
          ))}
          {d.rows.map((r) => (
            <li key={r.what}>
              <span>{r.count} {r.what}</span>
              <Badge tone="neutral">Back to {d.merged.name}</Badge>
            </li>
          ))}
          <li>
            <span>Field choices made at merge (name, email, phone)</span>
            <Badge tone="neutral">Original values return</Badge>
          </li>
        </ul>
      </Card>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Unmerge ${d.merged.name}?`} consequence="Each role, document and history row goes back to the person it came from. The link log keeps both actions." confirmLabel="Unmerge" destructive confirmDisabled={note.trim().length < 5} onConfirm={async () => {
        await live.onUnmerge(note.trim());
        setConfirm(false);
      }}>
        <FormField label="Audit note" required>
          <TextArea rows={2} value={note} onChange={setNote} maxLength={1000} />
        </FormField>
      </ConfirmDialog>
    </PeopleFrame>
  );
}

/** Start a merge from a person's record: find the other record by name or email. */
export function MergeStartDialog({ name, onClose, onSearch, onPick }: { name: string; onClose: () => void; onSearch: (q: string) => Promise<{ personId: string; name: string; email: string | null; roles: string[] }[]>; onPick: (personId: string) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ personId: string; name: string; email: string | null; roles: string[] }[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const a = useAction();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Merge another record into ${name}`}
      size="md"
      notice={a.error && <InlineAlert tone="danger">{a.error}</InlineAlert>}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!pick} onClick={() => pick && onPick(pick)}>
            Review merge
          </Button>
        </>
      }
    >
      <div className="yx-ppl__form">
        <FormField label="Find the other record" helper="By name or email. You review every field before anything changes.">
          <span className="yx-ppl__row">
            <TextField value={q} onChange={setQ} maxLength={80} placeholder="Name or email" />
            <Button loading={a.busy} disabled={q.trim().length < 2} onClick={() => void a.run(async () => setHits(await onSearch(q.trim())))}>
              Search
            </Button>
          </span>
        </FormField>
        {hits && (hits.length ? (
          <FormField label="Record">
            <RadioGroup aria-label="Record" value={pick ?? undefined} onChange={setPick} options={hits.map((h) => ({ value: h.personId, label: `${h.name}${h.email ? ` · ${h.email}` : ''}${h.roles.length ? ` · ${h.roles.join(', ')}` : ''}` }))} />
          </FormField>
        ) : (
          <Text as="p">No other record matches.</Text>
        ))}
      </div>
    </Dialog>
  );
}

/** People › Merged records: every merge of two records, each one open to undo. */
export function MergeList({ state, onRetry, rows, onOpen }: { state: Load; onRetry: () => void; rows: MergeRecordView[] | null; onOpen: (id: string) => void }) {
  const cols: TableColumn<MergeRecordView>[] = [
    { key: 'kept', header: 'Kept record', type: 'person', value: (r) => r.kept.name, person: (r) => ({ name: r.kept.name, secondary: `${r.merged.name} merged into it` }), width: 260 },
    { key: 'at', header: 'Merged on', type: 'date', value: (r) => new Date(r.mergedAt), width: 140 },
    { key: 'by', header: 'By', value: (r) => r.mergedBy ?? '', width: 180 },
    { key: 'note', header: 'Audit note', value: (r) => r.note, width: 320 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.unmergedAt ? 'Unmerged' : 'Merged'), statusTone: (v) => (v === 'Merged' ? 'info' : 'neutral'), width: 120 },
  ];
  return (
    <PeopleFrame active="Possible same person">
      <PageHeader title="Merged records" description="Two records of one person, made one. Nothing was deleted: each merge can be undone." />
      {state === 'error' ? (
        <ErrorState title="We couldn't load the merges" description="Try again in a moment." onRetry={onRetry} />
      ) : !rows ? (
        <ListSkeleton label="Loading the merges" />
      ) : (
        <DataTable label="Merged records" columns={cols} rows={rows} getRowId={(r) => r.id} onRowClick={(r) => onOpen(r.id)} rowButtons={(r) => <Button size="sm" onClick={() => onOpen(r.id)}>Open</Button>} empty={<EmptyState title="No merges yet" description="Merge two records of one person from their record: More › Merge with another record." />} />
      )}
    </PeopleFrame>
  );
}
