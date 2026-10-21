// Contract labour part 2, live (founder decision 21 Oct 2026): CLB-03 Vendor compliance, CLB-04 Registers & returns and
// the contract labour Reports (designed here, in the expense reports' layout), from real data. A register or return that
// needs data not recorded yet says so. Presentational: the API checks the keys, their reach and maker-checker.
import { useEffect, useState } from 'react';
import { Download, FileText, Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Meter } from '../../../components/feedback';
import { FieldRow, FormField } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { useToast } from '../../../components/notify';
import { ConfirmDialog } from '../../../components/overlay';
import { Select } from '../../../components/select';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { DataTable } from '../../../components/table';
import { FilterBar, type FilterFieldDef } from '../../../components/filters';
import { BarChart } from '../../../components/charts';
import { DatePicker } from '../../../components/date';
import { FileUpload } from '../../../components/upload';
import { formatDate, formatINR } from '../../../lib/format';
import type { FilterValue } from '../../../lib/table';
import { Actions, CardGrid, CheckList, Facts, StatusTrail } from '../ops-kit';
import { expiryTone } from '../ops-rules';
import type { LoadState } from './contract-live';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (m: string) => `${SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const longMonth = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const D = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const isoOf = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type ProofType = 'pf' | 'esi' | 'wage_register' | 'wage_payment' | 'pt_lwf';
export const PROOF_LABEL: Record<ProofType, string> = { pf: 'PF ECR + challan', esi: 'ESI challan', wage_register: 'Wage register', wage_payment: 'Wage payment proof', pt_lwf: 'PT / LWF' };
type ProofStatus = 'verified' | 'submitted' | 'discrepancy' | 'not_required' | 'overdue' | 'open';
const STATUS_TEXT: Record<ProofStatus, string> = { verified: 'Verified', submitted: 'Submitted', discrepancy: 'Discrepancy', not_required: 'Not required', overdue: 'Overdue', open: 'Open' };
const STATUS_TONE: Record<ProofStatus, BadgeTone> = { verified: 'success', submitted: 'info', discrepancy: 'danger', overdue: 'danger', not_required: 'neutral', open: 'neutral' };

export interface ComplianceRow {
  contractorId: string;
  contractor: string;
  workers: number;
  statuses: { type: ProofType; status: ProofStatus; proofId: string | null }[];
  held: boolean;
  released: { reason: string; on: string | null } | null;
  standing: 'compliant' | 'in_progress' | 'action_needed';
  documents: { total: number; verified: number; expiring: number; expired: number };
}
export interface LiabilityAlert {
  key: string;
  type: string;
  contractorId: string;
  contractor: string;
  month: string | null;
  detail: string;
  liability: number;
  severity: 'High' | 'Medium';
}
export interface ComplianceView {
  month: string;
  dueOn: string;
  wageDueOn: string;
  proofTypes: ProofType[];
  matrix: ComplianceRow[];
  alerts: LiabilityAlert[];
}
export interface ProofDetail {
  id: string;
  contractorId: string;
  contractor: string;
  month: string;
  proofType: ProofType;
  status: ProofStatus;
  reference: string | null;
  amount: string | null;
  workersCovered: number | null;
  paidOn: string | null;
  note: string | null;
  hasFile: boolean;
  submittedBy: string | null;
  submittedOn: string | null;
  mine: boolean;
  checks: { id: string; status: 'pass' | 'fail' | 'warn'; label: string; detail?: string }[];
}
export interface ContractorDocument {
  id: string;
  kind: 'licence' | 'registration' | 'pf_code' | 'esi_code' | 'insurance' | 'other';
  number: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: 'submitted' | 'verified' | 'rejected';
  note: string | null;
  hasFile: boolean;
  submittedBy: string | null;
  verifiedBy: string | null;
  mine: boolean;
}
export interface ProofInput {
  contractorId: string;
  month: string;
  proofType: ProofType;
  reference?: string;
  amount?: string;
  workersCovered?: number;
  paidOn?: string;
  note?: string;
  notRequired?: boolean;
  file?: File;
}
export interface DocumentInput {
  kind: ContractorDocument['kind'];
  number?: string;
  validFrom?: string;
  validTo?: string;
  note?: string;
  file?: File;
}
const DOC_KIND: Record<ContractorDocument['kind'], string> = { licence: 'Licence', registration: 'Registration certificate', pf_code: 'PF code letter', esi_code: 'ESI code letter', insurance: 'Insurance (employees compensation)', other: 'Other' };

/* ========================================================================== CLB-03 · Vendor compliance (live) */

export interface VendorComplianceLiveProps {
  state: LoadState;
  onRetry?: () => void;
  today: string;
  months: string[];
  month: string;
  onMonth: (m: string) => void;
  view: ComplianceView | null;
  /** Hand in proofs and documents (clra.worker.manage). */
  canSubmit: boolean;
  /** Verify, release a held bill, close alerts (clra.compliance.manage). */
  canVerify: boolean;
  onProof: (id: string) => Promise<ProofDetail>;
  onAddProof: (input: ProofInput) => Promise<unknown>;
  onDecideProof: (id: string, decision: 'verified' | 'discrepancy', note?: string) => Promise<unknown>;
  onRelease: (contractorId: string, reason: string) => Promise<unknown>;
  onResolve: (key: string, note: string) => Promise<unknown>;
  onDocuments: (contractorId: string) => Promise<ContractorDocument[]>;
  onAddDocument: (contractorId: string, input: DocumentInput) => Promise<unknown>;
  onDecideDocument: (id: string, decision: 'verified' | 'rejected', note?: string) => Promise<unknown>;
  /** Stories: open a proof at once. */
  defaultProof?: ProofDetail;
}

export function VendorComplianceLiveScreen(p: VendorComplianceLiveProps) {
  const { toast } = useToast();
  const [proof, setProof] = useState<ProofDetail | null>(p.defaultProof ?? null);
  const [adding, setAdding] = useState<{ row: ComplianceRow; type: ProofType } | null>(null);
  const [override, setOverride] = useState<ComplianceRow | null>(null);
  const [reason, setReason] = useState('');
  const [resolving, setResolving] = useState<LiabilityAlert | null>(null);
  const [note, setNote] = useState('');
  const [docsOf, setDocsOf] = useState<ComplianceRow | null>(null);
  const v = p.view;
  const exposure = (v?.alerts ?? []).reduce((s, a) => s + a.liability, 0);
  const open = async (id: string) => setProof(await p.onProof(id));
  return (
    <div className="yx-auth__page">
      <PageHeader
        title="Vendor compliance"
        description={v ? `Monthly proofs from each contractor for ${monthLabel(v.month)} wages, due by ${formatDate(D(v.dueOn))}. You can be liable for unpaid wages and dues.` : 'Monthly proofs from each contractor. You can be liable for unpaid wages and dues.'}
        facts={v ? `${plural(v.alerts.length, 'liability alert')} · estimated exposure ${formatINR(exposure)}` : undefined}
        actions={
          <FormField id="clb-month" label="Wage month">
            <Select value={p.month} onChange={(m) => m && p.onMonth(m)} options={p.months.map((m) => ({ value: m, label: monthLabel(m) }))} />
          </FormField>
        }
      />
      {p.state !== 'ready' || !v ? (
        p.state === 'error' ? <InlineAlert tone="danger" title="We couldn't load vendor compliance." actions={<Button size="sm" onClick={p.onRetry}>Try again</Button>}>Nothing has changed.</InlineAlert> : <Card title="Compliance matrix"><p className="yx-ops-muted">Loading…</p></Card>
      ) : (
        <>
          <Card title={`Compliance matrix · ${monthLabel(v.month)}`}>
            {v.matrix.length ? (
              <div className="yx-ops-scroll">
                <table className="yx-ops-matrix" aria-label="Contractor by proof type">
                  <thead>
                    <tr>
                      <th scope="col">Contractor</th>
                      {v.proofTypes.map((t) => (
                        <th key={t} scope="col">{PROOF_LABEL[t]}</th>
                      ))}
                      <th scope="col">Documents</th>
                      <th scope="col">Bill payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.matrix.map((m) => (
                      <tr key={m.contractorId}>
                        <th scope="row">
                          {m.contractor}
                          <div className="yx-ops-muted">{plural(m.workers, 'worker')} in the month</div>
                        </th>
                        {m.statuses.map((s) => (
                          <td key={s.type}>
                            {s.proofId && (s.status === 'submitted' || s.status === 'discrepancy') ? (
                              <button type="button" className="yx-ops-cellbtn" onClick={() => void open(s.proofId!)} aria-label={`${PROOF_LABEL[s.type]}, ${m.contractor}: ${STATUS_TEXT[s.status]}. Open verification`}>
                                <Badge tone={STATUS_TONE[s.status]}>{STATUS_TEXT[s.status]}</Badge>
                              </button>
                            ) : !s.proofId && p.canSubmit ? (
                              <button type="button" className="yx-ops-cellbtn" onClick={() => setAdding({ row: m, type: s.type })} aria-label={`${PROOF_LABEL[s.type]}, ${m.contractor}: ${STATUS_TEXT[s.status]}. Add the proof`}>
                                <Badge tone={STATUS_TONE[s.status]}>{STATUS_TEXT[s.status]}</Badge>
                              </button>
                            ) : (
                              <Badge tone={STATUS_TONE[s.status]}>{STATUS_TEXT[s.status]}</Badge>
                            )}
                          </td>
                        ))}
                        <td>
                          <button type="button" className="yx-ops-cellbtn" onClick={() => setDocsOf(m)} aria-label={`Documents of ${m.contractor}`}>
                            <Badge tone={m.documents.expired ? 'danger' : m.documents.expiring || m.documents.verified < m.documents.total ? 'warning' : m.documents.total ? 'success' : 'neutral'}>
                              {m.documents.expired ? `${m.documents.expired} expired` : m.documents.total ? `${m.documents.verified} of ${m.documents.total} verified` : 'None yet'}
                            </Badge>
                          </button>
                        </td>
                        <td>
                          {m.released ? (
                            <Badge tone="warning">Released with reason</Badge>
                          ) : m.held ? (
                            <span className="yx-ops-row">
                              <Badge tone="danger">Held</Badge>
                              {p.canVerify && <Button size="sm" onClick={() => { setOverride(m); setReason(''); }}>Override</Button>}
                            </span>
                          ) : (
                            <Badge tone="success">Can be paid</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState compact title="No contractors yet." description="Add contractors on Contractors; their monthly proofs show here." />
            )}
          </Card>
          <Card title="Liability alerts">
            <DataTable
              label="Liability alerts"
              columns={[
                { key: 't', header: 'Alert', value: (a: LiabilityAlert) => a.type, width: 200 },
                { key: 'c', header: 'Contractor', value: (a) => a.contractor, width: 200 },
                { key: 'd', header: 'Detail', value: (a) => a.detail, width: 340 },
                { key: 'l', header: 'Possible liability', type: 'money', value: (a) => a.liability, total: 'sum' },
                { key: 's', header: 'Severity', type: 'status', value: (a) => a.severity, statusTone: (x) => (x === 'High' ? 'danger' : 'warning') },
              ]}
              rows={v.alerts}
              getRowId={(a) => a.key}
              rowButtons={p.canVerify ? (a) => <Button size="sm" onClick={() => { setResolving(a); setNote(''); }}>Resolve with note</Button> : undefined}
              empty={<EmptyState compact title="No open alerts." />}
            />
          </Card>
        </>
      )}
      <ProofDrawer proof={proof} canVerify={p.canVerify} onClose={() => setProof(null)} onDecide={async (d, n) => { await p.onDecideProof(proof!.id, d, n); toast({ tone: 'success', title: d === 'verified' ? `${PROOF_LABEL[proof!.proofType]} verified for ${proof!.contractor}` : `Discrepancy raised with ${proof!.contractor}` }); setProof(null); }} />
      {adding && v && <AddProofDrawer row={adding.row} type={adding.type} month={v.month} onClose={() => setAdding(null)} onSave={async (input) => { await p.onAddProof(input); toast({ tone: 'success', title: `${PROOF_LABEL[input.proofType]} added for ${adding.row.contractor}` }); setAdding(null); }} />}
      {docsOf && <DocumentsDrawer row={docsOf} today={p.today} canSubmit={p.canSubmit} canVerify={p.canVerify} load={() => p.onDocuments(docsOf.contractorId)} onAdd={(i) => p.onAddDocument(docsOf.contractorId, i)} onDecide={p.onDecideDocument} onClose={() => setDocsOf(null)} />}
      <ConfirmDialog
        open={Boolean(override)}
        onOpenChange={(o) => !o && setOverride(null)}
        title={`Release ${override?.contractor ?? ''}'s ${v ? monthLabel(v.month) : ''} bill?`}
        consequence="The month still has overdue or disputed proofs. Releasing it is recorded with your reason in the audit log. Alerts stay open."
        confirmLabel="Release bill"
        confirmDisabled={reason.trim().length < 10}
        onConfirm={async () => {
          await p.onRelease(override!.contractorId, reason.trim());
          toast({ tone: 'success', title: `${override!.contractor}'s bill released` });
          setOverride(null);
        }}
      >
        <FormField label="Reason" required helper="At least a sentence: what you saw and when the proofs will come.">
          <TextArea rows={3} value={reason} onChange={setReason} />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(resolving)}
        onOpenChange={(o) => !o && setResolving(null)}
        title={`Close "${resolving?.type ?? ''}" for ${resolving?.contractor ?? ''}?`}
        consequence="The alert leaves the list. Your note is kept in the audit log."
        confirmLabel="Close alert"
        confirmDisabled={note.trim().length < 3}
        onConfirm={async () => {
          await p.onResolve(resolving!.key, note.trim());
          toast({ tone: 'success', title: 'Alert closed' });
          setResolving(null);
        }}
      >
        <FormField label="Note" required>
          <TextArea rows={3} value={note} onChange={setNote} />
        </FormField>
      </ConfirmDialog>
    </div>
  );
}

function ProofDrawer({ proof, canVerify, onClose, onDecide }: { proof: ProofDetail | null; canVerify: boolean; onClose: () => void; onDecide: (d: 'verified' | 'discrepancy', note?: string) => Promise<void> }) {
  const [raising, setRaising] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const failed = proof?.checks.some((c) => c.status === 'fail') ?? false;
  const open = proof && (proof.status === 'submitted' || proof.status === 'discrepancy');
  const can = Boolean(canVerify && open && !proof.mine);
  const act = async (d: 'verified' | 'discrepancy') => {
    setBusy(true);
    setError(null);
    try {
      await onDecide(d, d === 'discrepancy' ? note.trim() : undefined);
      setRaising(false);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={Boolean(proof)}
      onOpenChange={(o) => !o && onClose()}
      size="full"
      title={proof ? `Verify ${PROOF_LABEL[proof.proofType]} · ${proof.contractor} · ${monthLabel(proof.month)}` : ''}
      subtitle={proof ? `Handed in${proof.submittedBy ? ` by ${proof.submittedBy}` : ''}${proof.submittedOn ? ` on ${formatDate(D(proof.submittedOn))}` : ''}. ${proof.mine ? 'You handed it in, so someone else must verify it.' : canVerify ? "You can verify because you didn't hand it in." : 'Verifying needs the compliance key.'}` : undefined}
      footer={
        can ? (
          raising ? (
            <>
              <Button onClick={() => setRaising(false)}>Cancel</Button>
              <Button variant="danger" loading={busy} disabled={note.trim().length < 3} onClick={() => void act('discrepancy')}>Raise discrepancy</Button>
            </>
          ) : (
            <>
              <Button onClick={() => setRaising(true)}>Raise discrepancy</Button>
              <Button variant="primary" loading={busy} disabled={failed} onClick={() => void act('verified')}>Mark verified</Button>
            </>
          )
        ) : undefined
      }
    >
      {proof && (
        <div className="yx-ops-split">
          <DescriptionList
            items={[
              { label: 'Status', value: <Badge tone={STATUS_TONE[proof.status]}>{STATUS_TEXT[proof.status]}</Badge> },
              { label: 'Reference', value: proof.reference ?? 'Not given', mono: Boolean(proof.reference) },
              ...(proof.amount !== null ? [{ label: 'Amount', value: formatINR(Number(proof.amount)) }] : []),
              ...(proof.workersCovered !== null ? [{ label: 'Workers covered', value: String(proof.workersCovered) }] : []),
              ...(proof.paidOn ? [{ label: 'Paid on', value: formatDate(D(proof.paidOn)) }] : []),
              { label: 'File', value: proof.hasFile ? 'Attached (opens once the virus check is done)' : 'No file attached' },
              ...(proof.note ? [{ label: 'Note', value: proof.note }] : []),
            ]}
          />
          <div className="yx-ops-stack">
            <CheckList label="Automatic checks" items={proof.checks} />
            {raising && (
              <FormField label="What is wrong" required>
                <TextArea rows={3} value={note} onChange={setNote} />
              </FormField>
            )}
            {failed && can && !raising && <InlineAlert tone="danger">A check failed, so it cannot be verified. Raise a discrepancy with the contractor.</InlineAlert>}
            {error && <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert>}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function AddProofDrawer({ row, type, month, onClose, onSave }: { row: ComplianceRow; type: ProofType; month: string; onClose: () => void; onSave: (i: ProofInput) => Promise<void> }) {
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [covered, setCovered] = useState('');
  const [paidOn, setPaidOn] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [notRequired, setNotRequired] = useState(false);
  const [file, setFile] = useState<File | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const challan = type === 'pf' || type === 'esi';
  const money = amount.replace(/[,\s₹]/g, '');
  const ready = notRequired ? note.trim().length >= 3 : (!money || /^\d+(\.\d{1,2})?$/.test(money)) && (!covered || /^\d+$/.test(covered));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`${PROOF_LABEL[type]} · ${row.contractor} · ${monthLabel(month)}`}
      subtitle="Handed in by the contractor; you record it here. Someone else verifies it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!ready}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSave({ contractorId: row.contractorId, month, proofType: type, ...(notRequired ? { notRequired: true, note: note.trim() } : { ...(reference.trim() ? { reference: reference.trim() } : {}), ...(money ? { amount: money } : {}), ...(covered ? { workersCovered: Number(covered) } : {}), ...(paidOn ? { paidOn: isoOf(paidOn) } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(file ? { file } : {}) }) });
              } catch (e) {
                setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Add proof
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {type === 'pt_lwf' && <Checkbox label="Not required for this contractor this month" checked={notRequired} onChange={setNotRequired} />}
        {!notRequired && (
          <>
            <FieldRow>
              <FormField label={challan ? 'Challan or TRRN number' : 'Reference'} optional>
                <TextField value={reference} onChange={setReference} />
              </FormField>
              <FormField label="Amount" optional>
                <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" />
              </FormField>
            </FieldRow>
            {challan && (
              <FormField label="Workers covered" helper={`${plural(row.workers, 'worker')} deployed in ${longMonth(month)}.`}>
                <TextField value={covered} onChange={setCovered} inputMode="numeric" />
              </FormField>
            )}
            {type === 'wage_payment' && (
              <FormField label="Wages paid on">
                <DatePicker value={paidOn} onChange={setPaidOn} />
              </FormField>
            )}
            <FormField label="File" optional>
              <FileUpload accept={['.pdf', '.jpg', '.png']} multiple={false} upload={async (f) => setFile(f)} />
            </FormField>
          </>
        )}
        <FormField label={notRequired ? 'Why not required' : 'Note'} required={notRequired} optional={!notRequired}>
          <TextArea rows={2} value={note} onChange={setNote} />
        </FormField>
        {error && <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert>}
      </div>
    </Drawer>
  );
}

function DocumentsDrawer({ row, today, canSubmit, canVerify, load, onAdd, onDecide, onClose }: { row: ComplianceRow; today: string; canSubmit: boolean; canVerify: boolean; load: () => Promise<ContractorDocument[]>; onAdd: (i: DocumentInput) => Promise<unknown>; onDecide: (id: string, d: 'verified' | 'rejected', note?: string) => Promise<unknown>; onClose: () => void }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<ContractorDocument[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<DocumentInput>>({ kind: 'insurance' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => setDocs(await load());
  useEffect(() => {
    void refresh();
    // Loaded once when the drawer opens; writes refresh it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast({ tone: 'success', title: done });
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`Documents · ${row.contractor}`}
      subtitle="Registration, PF and ESI code letters and insurance, with when they expire. Someone other than who added a document checks it."
      footer={
        canSubmit ? (
          adding ? (
            <>
              <Button onClick={() => setAdding(false)}>Cancel</Button>
              <Button variant="primary" loading={busy} disabled={!draft.kind || Boolean(draft.validFrom && draft.validTo && draft.validTo < draft.validFrom)} onClick={async () => { if (await run(() => onAdd(draft as DocumentInput), `${DOC_KIND[draft.kind!]} added for ${row.contractor}`)) { setAdding(false); setDraft({ kind: 'insurance' }); } }}>
                Add document
              </Button>
            </>
          ) : (
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add document</Button>
          )
        ) : undefined
      }
    >
      <div className="yx-ops-stack">
        {docs === null ? (
          <p className="yx-ops-muted">Loading…</p>
        ) : docs.length ? (
          docs.map((d) => {
            const t = d.validTo ? expiryTone(D(d.validTo), D(today)) : null;
            return (
              <Card key={d.id} title={DOC_KIND[d.kind]} actions={<span className="yx-ops-row">{t && <Badge tone={t.tone}>{t.text}</Badge>}<Badge tone={d.status === 'verified' ? 'success' : d.status === 'rejected' ? 'danger' : 'info'}>{d.status === 'verified' ? 'Verified' : d.status === 'rejected' ? 'Rejected' : 'To check'}</Badge></span>}>
                <DescriptionList items={[{ label: 'Number', value: d.number ?? 'Not given', mono: Boolean(d.number) }, { label: 'Valid', value: d.validTo ? `${d.validFrom ? `${formatDate(D(d.validFrom))} to ` : 'Until '}${formatDate(D(d.validTo))}` : 'No expiry' }, { label: 'Added by', value: d.submittedBy ?? '—' }, ...(d.verifiedBy ? [{ label: 'Checked by', value: d.verifiedBy }] : []), ...(d.note ? [{ label: 'Note', value: d.note }] : [])]} />
                {canVerify && d.status === 'submitted' && !d.mine && (
                  <Actions end>
                    <Button size="sm" onClick={() => void run(() => onDecide(d.id, 'rejected', 'Not valid on checking'), 'Document rejected')}>Reject</Button>
                    <Button size="sm" variant="primary" onClick={() => void run(() => onDecide(d.id, 'verified'), 'Document verified')}>Mark verified</Button>
                  </Actions>
                )}
              </Card>
            );
          })
        ) : (
          <EmptyState compact title="No documents yet." description={canSubmit ? 'Add the registration certificate, PF and ESI code letters and the insurance policy.' : undefined} />
        )}
        {adding && (
          <>
            <FieldRow>
              <FormField label="Document" required>
                <Select value={draft.kind ?? null} onChange={(k) => setDraft({ ...draft, kind: (k ?? undefined) as DocumentInput['kind'] })} options={Object.entries(DOC_KIND).map(([value, label]) => ({ value, label }))} />
              </FormField>
              <FormField label="Number" optional>
                <TextField value={draft.number ?? ''} onChange={(n) => setDraft({ ...draft, number: n })} />
              </FormField>
            </FieldRow>
            <FieldRow>
              <FormField label="Valid from" optional>
                <DatePicker value={draft.validFrom ? D(draft.validFrom) : null} onChange={(d) => setDraft({ ...draft, validFrom: isoOf(d) || undefined })} />
              </FormField>
              <FormField label="Valid to" optional helper="Leave empty if it does not expire.">
                <DatePicker value={draft.validTo ? D(draft.validTo) : null} onChange={(d) => setDraft({ ...draft, validTo: isoOf(d) || undefined })} />
              </FormField>
            </FieldRow>
            <FormField label="File" optional>
              <FileUpload accept={['.pdf', '.jpg', '.png']} multiple={false} upload={async (f) => setDraft((x) => ({ ...x, file: f }))} />
            </FormField>
          </>
        )}
        {error && <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert>}
      </div>
    </Drawer>
  );
}

/* ========================================================================== CLB-04 · Registers & returns (live) */

export interface RegisterRow {
  id: string;
  kind: string;
  name: string;
  siteId: string;
  site: string;
  contractorId: string | null;
  period: string;
  format: string;
  status: 'ready' | 'no_data';
  rows: number;
  why: string | null;
}
export interface RegistersView {
  month: string;
  registers: RegisterRow[];
  chart: { months: string[]; sites: { siteId: string; site: string; values: number[] }[] };
  establishments: { id: string; name: string }[];
}
export interface AnnualReturn {
  siteId: string;
  site: string;
  year: number;
  contractors: number;
  workers: number;
  maxOnAnyDay: number;
  deployedDays: number;
  daysWorked: number | null;
  dueOn: string;
}
export interface RegistersLiveProps {
  state: LoadState;
  onRetry?: () => void;
  months: string[];
  month: string;
  onMonth: (m: string) => void;
  view: RegistersView | null;
  returns: AnnualReturn[] | null;
  year: number;
  onDownload: (r: RegisterRow) => void;
  onInspectionPack: (siteId: string) => void;
  onReturnFile: (r: AnnualReturn) => void;
  defaultTab?: 'registers' | 'returns';
}

export function RegistersLiveScreen(p: RegistersLiveProps) {
  const [tab, setTab] = useState(p.defaultTab ?? 'registers');
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const v = p.view;
  const chosen = (filters.find((f) => f.key === 'site' && f.type === 'multi') as { values: string[] } | undefined)?.values ?? [];
  const rows = (v?.registers ?? []).filter((r) => !chosen.length || chosen.includes(r.siteId));
  const site: FilterFieldDef = { key: 'site', label: 'Establishment', type: 'multi', options: (v?.establishments ?? []).map((e) => ({ value: e.id, label: e.name })) };
  const packSite = chosen.length === 1 ? chosen[0] : v?.establishments.length === 1 ? v.establishments[0].id : null;
  return (
    <div className="yx-auth__page">
      <PageHeader
        title="Registers & returns"
        description="Generated from contractor, licence and deployment records for each establishment and month. A register that needs data not recorded yet says what it needs."
        actions={
          <span className="yx-ops-row">
            <FormField id="clb-reg-month" label="Month">
              <Select value={p.month} onChange={(m) => m && p.onMonth(m)} options={p.months.map((m) => ({ value: m, label: monthLabel(m) }))} />
            </FormField>
            <Button icon={Download} disabled={!packSite} title={packSite ? undefined : 'Choose one establishment'} onClick={() => packSite && p.onInspectionPack(packSite)}>
              Inspection pack
            </Button>
          </span>
        }
      />
      <FilterBar fields={[site]} value={filters} onChange={setFilters} />
      <Tabs value={tab} onValueChange={(x) => setTab(x as typeof tab)}>
        <TabsList aria-label="Registers and returns">
          <TabsTrigger value="registers">Registers</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
        </TabsList>
        <TabsContent value="registers">
          <div className="yx-ops-stack">
            <BarChart title="Contract workers on site, by month" xLabel="Month" categories={(v?.chart.months ?? []).map((m) => SHORT[Number(m.slice(5, 7)) - 1])} series={(v?.chart.sites ?? []).filter((s) => !chosen.length || chosen.includes(s.siteId)).map((s) => ({ name: s.site, values: s.values }))} stacked loading={p.state === 'loading'} />
            <DataTable
              label="Registers"
              columns={[
                { key: 'n', header: 'Register', value: (r: RegisterRow) => r.name, width: 300 },
                { key: 'e', header: 'Establishment', value: (r) => r.site },
                { key: 'p', header: 'Period', value: (r) => monthLabel(r.period) },
                { key: 'f', header: 'Format', type: 'id', value: (r) => r.format, width: 240 },
                { key: 's', header: 'Status', type: 'status', value: (r) => (r.status === 'ready' ? 'Ready' : 'No data yet'), statusTone: (x) => (x === 'Ready' ? 'success' : 'neutral') },
                { key: 'w', header: 'Needs', value: (r) => r.why ?? '', width: 300 },
              ]}
              rows={rows}
              getRowId={(r) => r.id}
              state={p.state === 'loading' ? 'loading' : p.state === 'error' ? 'error' : 'ready'}
              onRetry={p.onRetry}
              rowButtons={(r) => (r.status === 'ready' ? <Button size="sm" icon={Download} onClick={() => p.onDownload(r)}>Excel</Button> : null)}
              empty={<EmptyState title="No establishments with contractors yet." description="Registers start once a contractor holds a licence for a site." />}
            />
          </div>
        </TabsContent>
        <TabsContent value="returns">
          <div className="yx-ops-stack">
            {(p.returns ?? []).filter((r) => !chosen.length || chosen.includes(r.siteId)).map((r) => (
              <Card key={r.siteId} title={`Annual return ${r.year} · ${r.site} (principal employer)`}>
                <div className="yx-ops-stack">
                  <StatusTrail steps={[{ label: 'Drafted from the year’s data' }, { label: 'Reviewed' }, { label: 'Signed' }, { label: 'Filed' }]} current={0} />
                  <Facts items={[{ label: 'Contractors', value: r.contractors }, { label: 'Max workers on any day', value: r.maxOnAnyDay }, { label: 'Days deployed', value: r.deployedDays.toLocaleString('en-IN') }, { label: 'Due', value: formatDate(D(r.dueOn)) }]} />
                  <p className="yx-ops-muted">Days worked need daily attendance of contract workers, which is not recorded yet; the draft says so.</p>
                  <Actions>
                    <Button icon={FileText} onClick={() => p.onReturnFile(r)}>Open draft</Button>
                  </Actions>
                </div>
              </Card>
            ))}
            {p.returns && !p.returns.length && <EmptyState title="No returns yet." description="An establishment with contractors gets its annual return here." />}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ========================================================================== Contract labour reports (designed 21 Oct 2026) */

export interface ReportsView {
  month: string;
  months: string[];
  headcount: { contractorId: string; contractor: string; values: number[] }[];
  movements: { month: string; deployed: number; released: number }[];
  licences: { id: string; licenceNo: string; contractor: string; site: string; maxWorkers: number; active: number; validTo: string }[];
  compliance: { contractorId: string; contractor: string; verified: number; submitted: number; discrepancy: number; missing: number }[];
}
export interface ReportsLiveProps {
  state: LoadState;
  onRetry?: () => void;
  today: string;
  months: string[];
  month: string;
  onMonth: (m: string) => void;
  /** "All entities" or the legal entity chosen in the top bar. */
  scopeLabel: string;
  view: ReportsView | null;
  defaultTab?: 'headcount' | 'licences' | 'movements' | 'compliance';
}

export function ContractReportsLiveScreen(p: ReportsLiveProps) {
  const [tab, setTab] = useState(p.defaultTab ?? 'headcount');
  const v = p.view;
  const loading = p.state === 'loading';
  const cats = (v?.months ?? []).map((m) => SHORT[Number(m.slice(5, 7)) - 1]);
  return (
    <div className="yx-auth__page">
      <PageHeader
        title="Contract labour reports"
        facts={`${monthLabel(p.month)} · ${p.scopeLabel}`}
        actions={
          <FormField id="clb-rep-month" label="Month">
            <Select value={p.month} onChange={(m) => m && p.onMonth(m)} options={p.months.map((m) => ({ value: m, label: monthLabel(m) }))} />
          </FormField>
        }
      />
      {p.state === 'error' && <InlineAlert tone="danger" title="We couldn't load the reports." actions={<Button size="sm" onClick={p.onRetry}>Try again</Button>}>Nothing has changed.</InlineAlert>}
      <Tabs value={tab} onValueChange={(x) => setTab(x as typeof tab)}>
        <TabsList aria-label="Reports">
          <TabsTrigger value="headcount">Headcount</TabsTrigger>
          <TabsTrigger value="licences">Licence use</TabsTrigger>
          <TabsTrigger value="movements">Deployed and released</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>
        <TabsContent value="headcount">
          <div className="yx-ops-stack">
            <BarChart title="Contract workers on site, by contractor" xLabel="Month" categories={cats} series={(v?.headcount ?? []).map((h) => ({ name: h.contractor, values: h.values }))} stacked loading={loading} />
            <DataTable
              label="Headcount by contractor"
              columns={[{ key: 'c', header: 'Contractor', value: (h: ReportsView['headcount'][number]) => h.contractor, width: 260 }, ...cats.map((c, i) => ({ key: `m${i}`, header: c, type: 'number' as const, value: (h: ReportsView['headcount'][number]) => h.values[i], total: 'sum' as const }))]}
              rows={v?.headcount ?? []}
              getRowId={(h) => h.contractorId}
              state={loading ? 'loading' : 'ready'}
              empty={<EmptyState compact title="No contractors yet." />}
            />
          </div>
        </TabsContent>
        <TabsContent value="licences">
          <DataTable
            label="Licence use"
            columns={[
              { key: 'l', header: 'Licence', type: 'id', value: (l: ReportsView['licences'][number]) => l.licenceNo, width: 200 },
              { key: 'c', header: 'Contractor', value: (l) => l.contractor, width: 220 },
              { key: 's', header: 'Site', value: (l) => l.site },
              { key: 'u', header: 'Workers / maximum', value: (l) => l.active, render: (l) => <Meter label={`${l.licenceNo} workers`} value={l.active} max={l.maxWorkers} warnAt={90} dangerAt={100} valueText={`${l.active} of ${l.maxWorkers}`} />, width: 200 },
              { key: 'v', header: 'Valid to', value: (l) => l.validTo, render: (l) => { const t = expiryTone(D(l.validTo), D(p.today)); return <span className="yx-ops-stack" data-gap="sm"><span>{formatDate(D(l.validTo))}</span><Badge tone={t.tone}>{t.text}</Badge></span>; }, width: 170 },
            ]}
            rows={v?.licences ?? []}
            getRowId={(l) => l.id}
            state={loading ? 'loading' : 'ready'}
            empty={<EmptyState compact title="No licences yet." />}
          />
        </TabsContent>
        <TabsContent value="movements">
          <CardGrid min="lg">
            <BarChart title="Workers deployed and released, by month" xLabel="Month" categories={cats} series={[{ name: 'Deployed', values: (v?.movements ?? []).map((m) => m.deployed) }, { name: 'Released', values: (v?.movements ?? []).map((m) => m.released) }]} loading={loading} />
          </CardGrid>
        </TabsContent>
        <TabsContent value="compliance">
          <DataTable
            label={`Proofs for ${monthLabel(p.month)} wages`}
            columns={[
              { key: 'c', header: 'Contractor', value: (r: ReportsView['compliance'][number]) => r.contractor, width: 260 },
              { key: 'v', header: 'Verified', type: 'number', value: (r) => r.verified, total: 'sum' },
              { key: 's', header: 'Waiting to be checked', type: 'number', value: (r) => r.submitted, total: 'sum' },
              { key: 'd', header: 'Discrepancy', type: 'number', value: (r) => r.discrepancy, total: 'sum' },
              { key: 'm', header: 'Not handed in', type: 'number', value: (r) => r.missing, total: 'sum' },
            ]}
            rows={v?.compliance ?? []}
            getRowId={(r) => r.contractorId}
            state={loading ? 'loading' : 'ready'}
            empty={<EmptyState compact title="No contractors yet." />}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
