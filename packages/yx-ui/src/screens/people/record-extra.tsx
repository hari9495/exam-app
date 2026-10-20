// The live person record's identity panel (PPL-34), work authorisations tab (PPL-45) and international bank details
// with split pay (PPL-46). The API decides every field and action; this file lays them out as the designs do.
import { useEffect, useState } from 'react';
import { IdCard, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Card } from '../../components/shell';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { Text } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { isBic, isIban } from './people-logic';
import { StatusBadge, Segment } from './people-kit';

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work. Try again.');

/** One dialog with a primary action that may fail: the error shows inside it. */
function ActionDialog({ title, action, disabled, onClose, onSubmit, children }: { title: string; action: string; disabled?: boolean; onClose: () => void; onSubmit: () => Promise<void>; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={title}
      size="md"
      preventClose={busy}
      notice={error && <InlineAlert tone="danger">{error}</InlineAlert>}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={disabled}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit();
                onClose();
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {action}
          </Button>
        </>
      }
    >
      <div className="yx-ppl__form">{children}</div>
    </Dialog>
  );
}

/* ================================================================== PPL-34 identity panel */

export interface IdentityData {
  consent: { jurisdiction: string; status: 'Given' | 'Refused'; point: string; on: string }[];
  checks: { id: string; on: string; point: string; result: string; kind: string; by: string; note: string | null }[];
  canRecord: boolean;
}
export interface IdentityCheckInput {
  point: string;
  result: 'match' | 'mismatch' | 'attested' | 'id_only' | 'requested';
  jurisdiction?: string | null;
  consent?: 'given' | 'refused' | null;
  note?: string | null;
}
export interface LiveIdentity {
  /** Called when the panel opens: the checks load only then (every load is an audited view). */
  onLoad: () => void;
  data: IdentityData | null;
  state: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  onRecord: (input: IdentityCheckInput) => Promise<void>;
}

const RESULT_OPTIONS = [
  { value: 'attested', label: 'Attested against the original ID' },
  { value: 'match', label: 'Match' },
  { value: 'mismatch', label: 'Mismatch: HR review' },
  { value: 'id_only', label: 'ID check only (face consent refused)' },
];

/** Record an HR attestation or check, with the consent behind it. */
export function IdentityCheckDialog({ onClose, onRecord, reverify = false }: { onClose: () => void; onRecord: (input: IdentityCheckInput) => Promise<void>; reverify?: boolean }) {
  const [point, setPoint] = useState(reverify ? 'Re-verification' : 'HR attestation');
  const [result, setResult] = useState<IdentityCheckInput['result']>(reverify ? 'requested' : 'attested');
  const [jurisdiction, setJurisdiction] = useState('');
  const [consent, setConsent] = useState<'given' | 'refused' | null>(null);
  const [note, setNote] = useState('');
  const needNote = result === 'mismatch' || reverify;
  return (
    <ActionDialog
      title={reverify ? 'Request re-verification' : 'Record HR attestation'}
      action={reverify ? 'Request re-verification' : 'Record'}
      disabled={point.trim().length < 3 || (needNote && !note.trim()) || (consent !== null && !jurisdiction.trim())}
      onClose={onClose}
      onSubmit={() => onRecord({ point: point.trim(), result, ...(jurisdiction.trim() ? { jurisdiction: jurisdiction.trim() } : {}), ...(consent ? { consent } : {}), ...(note.trim() ? { note: note.trim() } : {}) })}
    >
      {!reverify && (
        <>
          <FormField label="Check" required>
            <TextField value={point} onChange={setPoint} maxLength={60} placeholder="Day-1 identity check" />
          </FormField>
          <FormField label="Result" required>
            <Select options={RESULT_OPTIONS} value={result} onChange={(v) => v && setResult(v as IdentityCheckInput['result'])} />
          </FormField>
          <FormField label="Consent recorded" helper="Only if the person gave or refused face consent at this check.">
            <Segment label="Consent recorded" options={[{ value: 'given', label: 'Given' }, { value: 'refused', label: 'Refused' }]} value={consent} onChange={setConsent} />
          </FormField>
          {consent && (
            <FormField label="Under which law" required>
              <TextField value={jurisdiction} onChange={setJurisdiction} maxLength={60} placeholder="India (DPDP)" />
            </FormField>
          )}
        </>
      )}
      <FormField label={reverify ? 'Why' : 'Note'} required={needNote}>
        <TextArea rows={2} value={note} onChange={setNote} maxLength={500} placeholder={reverify ? 'Ask for a fresh ID and selfie' : undefined} />
      </FormField>
    </ActionDialog>
  );
}

export function LiveIdentityPanel({ live, onClose }: { live: LiveIdentity; onClose?: () => void }) {
  const [ask, setAsk] = useState<'attest' | 'reverify' | null>(null);
  useEffect(() => live.onLoad(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const d = live.data;
  const latest = d?.checks.at(-1);
  return (
    <Card title="Identity" actions={onClose && <Button size="sm" onClick={onClose}>Close</Button>}>
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the identity checks" description="Try again in a moment." onRetry={live.onRetry} />
      ) : !d ? (
        <Skeleton height={160} />
      ) : (
        <div className="yx-ppl__stack">
          <Text size="sm" tone="secondary" as="p">
            Confidential. No face image is shown here. Views are recorded.
          </Text>
          {d.consent.length > 0 && (
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Consent by jurisdiction, scrolls sideways on small screens">
              <table className="yx-ppl__impact">
                <caption className="yx-ppl__sub">Consent by jurisdiction</caption>
                <thead>
                  <tr>
                    <th scope="col">Jurisdiction</th>
                    <th scope="col">Status</th>
                    <th scope="col">Captured at</th>
                  </tr>
                </thead>
                <tbody>
                  {d.consent.map((c) => (
                    <tr key={c.jurisdiction}>
                      <td>{c.jurisdiction}</td>
                      <td>
                        <StatusBadge status={c.status === 'Given' ? 'Approved' : 'Refused'} />
                      </td>
                      <td>
                        {c.point}, {formatDate(day(c.on))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.checks.length ? (
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Checks across hiring and joining, scrolls sideways on small screens">
              <table className="yx-ppl__impact">
                <caption className="yx-ppl__sub">Checks across hiring and joining</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Point</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {d.checks.map((c) => (
                    <tr key={c.id}>
                      <td>{formatDate(day(c.on))}</td>
                      <td>
                        {c.point}
                        <Text size="sm" tone="secondary" as="div">{c.note ? `${c.by} · ${c.note}` : c.by}</Text>
                      </td>
                      <td>
                        <Badge tone={c.kind === 'mismatch' ? 'danger' : c.kind === 'match' || c.kind === 'captured' ? 'success' : c.kind === 'requested' ? 'warning' : 'neutral'}>{c.result}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Text as="p">No identity checks recorded yet.</Text>
          )}
          {latest?.kind === 'mismatch' && (
            <InlineAlert tone="warning" title="Identity flag for HR review">
              A mismatch never blocks joining. Ask for a fresh ID and selfie, or attest against the original ID.
            </InlineAlert>
          )}
          {d.canRecord && (
            <div className="yx-ppl__row">
              <Button icon={IdCard} onClick={() => setAsk('reverify')}>
                Request re-verification
              </Button>
              <Button onClick={() => setAsk('attest')}>Record HR attestation</Button>
            </div>
          )}
        </div>
      )}
      {ask && <IdentityCheckDialog reverify={ask === 'reverify'} onClose={() => setAsk(null)} onRecord={live.onRecord} />}
    </Card>
  );
}

/* ================================================================== PPL-45 work authorisations */

export interface WorkAuthRow {
  id: string;
  country: string;
  type: string;
  number: string;
  sponsor: string | null;
  occupation: string | null;
  occupationDiffers: boolean;
  issued: string | null;
  expires: string;
  daysLeft: number;
  status: 'Valid' | 'Expiring' | 'Expired';
}
export interface WorkAuthInput {
  country: string;
  type: string;
  number: string;
  sponsor?: string | null;
  occupation?: string | null;
  issuedOn?: string | null;
  expiresOn: string;
}
export interface LiveWorkAuth {
  rows: WorkAuthRow[];
  designation: string | null;
  canAdd: boolean;
  onAdd: (input: WorkAuthInput) => Promise<void>;
}

export const COUNTRIES = [
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'IN', label: 'India' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'QA', label: 'Qatar' },
  { value: 'SG', label: 'Singapore' },
  { value: 'US', label: 'United States' },
];
const DOC_TYPES = ['Employment visa', 'Work permit', 'Residence permit', 'National ID', 'Emirates ID', 'Passport'];
const countryName = (code: string) => COUNTRIES.find((c) => c.value === code)?.label ?? code;

export function AddWorkAuthDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (input: WorkAuthInput) => Promise<void> }) {
  const [country, setCountry] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [occupation, setOccupation] = useState('');
  const [issued, setIssued] = useState<Date | null>(null);
  const [expires, setExpires] = useState<Date | null>(null);
  const badDates = Boolean(issued && expires && expires <= issued);
  return (
    <ActionDialog
      title="Add a document"
      action="Add document"
      disabled={!country || !type || number.trim().length < 4 || !expires || badDates}
      onClose={onClose}
      onSubmit={() => onAdd({ country: country!, type: type!, number: number.trim(), sponsor: sponsor.trim() || null, occupation: occupation.trim() || null, issuedOn: issued ? isoOf(issued) : null, expiresOn: isoOf(expires!) })}
    >
      <FormField label="Country" required>
        <Select options={COUNTRIES} value={country} onChange={setCountry} placeholder="Choose a country" />
      </FormField>
      <FormField label="Document" required>
        <Select options={DOC_TYPES.map((t) => ({ value: t, label: t }))} value={type} onChange={setType} placeholder="Choose a document" />
      </FormField>
      <FormField label="Number" required helper="Stored encrypted; only the last 4 characters are shown.">
        <TextField value={number} onChange={setNumber} maxLength={30} className="yx-mono" />
      </FormField>
      <FormField label="Sponsor">
        <TextField value={sponsor} onChange={setSponsor} maxLength={120} />
      </FormField>
      <FormField label="Occupation on permit">
        <TextField value={occupation} onChange={setOccupation} maxLength={120} />
      </FormField>
      <div className="yx-ppl__row">
        <FormField label="Issued on">
          <DatePicker value={issued} onChange={setIssued} />
        </FormField>
        <FormField label="Expires on" required error={badDates ? 'The expiry date is after the issue date.' : null}>
          <DatePicker value={expires} onChange={setExpires} />
        </FormField>
      </div>
    </ActionDialog>
  );
}

export function LiveWorkAuthTab({ live }: { live: LiveWorkAuth }) {
  const [adding, setAdding] = useState(false);
  const cols: TableColumn<WorkAuthRow>[] = [
    { key: 'type', header: 'Document', value: (r) => r.type, render: (r) => <span>{r.type}<Text size="sm" tone="secondary" as="div">{countryName(r.country)}</Text></span>, width: 200 },
    { key: 'number', header: 'Number', type: 'id', value: (r) => r.number, width: 170 },
    { key: 'sponsor', header: 'Sponsor', value: (r) => r.sponsor ?? '—', width: 160 },
    { key: 'occupation', header: 'Occupation on permit', value: (r) => r.occupation ?? '—', render: (r) => (r.occupationDiffers ? <span>{r.occupation} <Badge tone="warning">Differs from designation</Badge></span> : (r.occupation ?? '—')), width: 260 },
    { key: 'expires', header: 'Expires', type: 'date', value: (r) => day(r.expires), width: 130 },
    { key: 'left', header: 'Days left', type: 'number', value: (r) => r.daysLeft, width: 110 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Expiring' ? 'warning' : v === 'Expired' ? 'danger' : 'success'), width: 120 },
  ];
  const soon = live.rows.filter((r) => r.status !== 'Valid' && (r.type === 'Employment visa' || r.type === 'Work permit'))[0];
  const add = live.canAdd ? (
    <Button icon={Plus} size="sm" onClick={() => setAdding(true)}>
      Add document
    </Button>
  ) : undefined;
  return (
    <div className="yx-ppl__stack">
      {soon && (
        <InlineAlert tone={soon.status === 'Expired' ? 'danger' : 'warning'} title={`${soon.type} ${soon.status === 'Expired' ? 'expired on' : 'expires on'} ${formatDate(day(soon.expires))}`}>
          {soon.status === 'Expired' ? 'Renew it before the person works there again.' : `${soon.daysLeft} days left. Start the renewal with the sponsor.`}
        </InlineAlert>
      )}
      <DataTable
        label="Work authorisations"
        columns={cols}
        rows={live.rows}
        getRowId={(r) => r.id}
        empty={<EmptyState title="No work authorisations" description="Add visas, permits or national IDs for people who work outside their home country." action={live.canAdd ? <Button variant="primary" onClick={() => setAdding(true)}>Add document</Button> : undefined} />}
        toolbar={add}
      />
      {adding && <AddWorkAuthDialog onClose={() => setAdding(false)} onAdd={live.onAdd} />}
    </div>
  );
}

/* ================================================================== PPL-46 international bank details */

export interface IntlAccountView {
  kind: 'iban' | 'india';
  label: string;
  rule: 'remainder' | 'fixed' | 'percent';
  value: number;
  bic?: string;
  bankAccountId?: string;
}
export interface IntlSplitView {
  id: string;
  country: string;
  currency: string;
  accounts: IntlAccountView[];
  usableFrom: string | null;
  requestedBy: string | null;
  version: number;
}
export interface IntlAccountInput {
  kind: 'iban' | 'india';
  iban?: string;
  bic?: string;
  bankName?: string;
  bankAccountId?: string;
  rule: 'remainder' | 'fixed' | 'percent';
  value: number;
}
export interface LiveIntlBank {
  current: IntlSplitView | null;
  pending: IntlSplitView | null;
  indianAccounts: { id: string; label: string }[];
  canRequest: boolean;
  canDecide: boolean;
  self: boolean;
  onRequest: (input: { country: string; currency: string; accounts: IntlAccountInput[] }) => Promise<void>;
  onDecide: (approve: boolean, note: string | null) => Promise<void>;
}

const RULES = [
  { value: 'remainder', label: 'Remainder' },
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'percent', label: 'Percentage' },
];
const ruleText = (a: { rule: string; value: number }) => (a.rule === 'remainder' ? 'Remainder' : a.rule === 'percent' ? `${a.value}%` : `${a.value.toLocaleString('en-IN')} fixed`);

/** The other accounts of a split: an IBAN or one of the person's Indian accounts. */
interface ExtraRow {
  id: string;
  kind: 'iban' | 'india';
  iban: string;
  bic: string;
  bankAccountId: string | null;
  rule: 'fixed' | 'percent';
  value: number;
}

export function LiveIntlBankCard({ live }: { live: LiveIntlBank }) {
  const [editing, setEditing] = useState(false);
  const [country, setCountry] = useState('AE');
  const [iban, setIban] = useState('');
  const [bic, setBic] = useState('');
  const [bankName, setBankName] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [extra, setExtra] = useState<ExtraRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const ibanOk = isIban(iban);
  const bicOk = isBic(bic);
  const extraOk = extra.every((x) => (x.kind === 'india' ? Boolean(x.bankAccountId) : isIban(x.iban) && isBic(x.bic)) && x.value > 0 && (x.rule === 'fixed' || x.value <= 100));
  const pct = extra.filter((x) => x.rule === 'percent').reduce((s, x) => s + x.value, 0);
  const shown = (s: IntlSplitView, title: string, status: string) => (
    <div className="yx-ppl__stack">
      <div className="yx-ppl__row yx-ppl__row--between">
        <Text as="p">
          {title} · {countryName(s.country)} · paid in {s.currency}
        </Text>
        <StatusBadge status={status} />
      </div>
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label={`${title}, scrolls sideways on small screens`}>
        <table className="yx-ppl__impact">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Rule</th>
            </tr>
          </thead>
          <tbody>
            {s.accounts.map((a) => (
              <tr key={a.label}>
                <td className="yx-mono">
                  {a.label}
                  {a.bic && <Text size="sm" tone="secondary" as="div">BIC {a.bic}</Text>}
                </td>
                <td>{ruleText(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await live.onRequest({
        country,
        currency,
        accounts: [
          { kind: 'iban', iban, bic, ...(bankName.trim() ? { bankName: bankName.trim() } : {}), rule: 'remainder', value: 0 },
          ...extra.map((x): IntlAccountInput => (x.kind === 'india' ? { kind: 'india', bankAccountId: x.bankAccountId!, rule: x.rule, value: x.value } : { kind: 'iban', iban: x.iban, bic: x.bic, rule: x.rule, value: x.value })),
        ],
      });
      setEditing(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Bank accounts (international)" actions={live.canRequest && !live.pending && !editing ? <Button size="sm" onClick={() => setEditing(true)}>{live.current ? 'Change accounts' : 'Add accounts'}</Button> : undefined}>
      <div className="yx-ppl__stack">
        {live.current && shown(live.current, 'Paid now', live.current.usableFrom && new Date(live.current.usableFrom) > new Date() ? 'Cooling period' : 'Active')}
        {live.pending && (
          <>
            {shown(live.pending, `Change waiting for approval${live.pending.requestedBy ? ` (asked by ${live.pending.requestedBy})` : ''}`, 'Pending approval')}
            {live.canDecide && (
              <div className="yx-ppl__row">
                <Button onClick={() => setRejecting(true)}>Reject</Button>
                <Button variant="approve" loading={busy} onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await live.onDecide(true, null);
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setBusy(false);
                  }
                }}>
                  Approve
                </Button>
              </div>
            )}
          </>
        )}
        {!live.current && !live.pending && !editing && <Text as="p">No international account on file.</Text>}
        {editing && (
          <>
            <div className="yx-ppl__form">
              <FormField label="Country of account" required>
                <Select options={COUNTRIES.filter((c) => c.value !== 'IN' && c.value !== 'US' && c.value !== 'SG')} value={country} onChange={(v) => v && setCountry(v)} />
              </FormField>
              <FormField label="IBAN" required error={iban && !ibanOk ? 'Enter a valid IBAN for the country, like AE07 0331 2345 6789 0123 456.' : null} helper={ibanOk ? 'IBAN check passed (country length and check digits).' : undefined}>
                <TextField value={iban} onChange={setIban} className="yx-mono" />
              </FormField>
              <FormField label="BIC / SWIFT" required error={bic && !bicOk ? 'Enter an 8 or 11 character BIC, like ECBKAEAD.' : null}>
                <TextField value={bic} onChange={setBic} />
              </FormField>
              <FormField label="Bank name">
                <TextField value={bankName} onChange={setBankName} maxLength={80} />
              </FormField>
              <FormField label="Payout currency">
                <Select options={[{ value: 'AED', label: 'AED · UAE dirham' }, { value: 'GBP', label: 'GBP · Pound sterling' }, { value: 'SAR', label: 'SAR · Saudi riyal' }, { value: 'QAR', label: 'QAR · Qatari riyal' }, { value: 'INR', label: 'INR · Indian rupee' }]} value={currency} onChange={(v) => v && setCurrency(v)} />
              </FormField>
            </div>
            <Card title="Split net pay">
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Split net pay, scrolls sideways on small screens">
                <table className="yx-ppl__impact">
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col">Rule</th>
                      <th scope="col">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="yx-mono">{iban ? `${iban.replace(/\s+/g, '').slice(0, 4)} •••• ${iban.replace(/\s+/g, '').slice(-4)}` : 'The IBAN above'} (primary)</td>
                      <td>Remainder</td>
                      <td>—</td>
                    </tr>
                    {extra.map((x) => (
                      <tr key={x.id}>
                        <td>
                          {x.kind === 'india' ? (
                            <Select aria-label="Indian account" size="sm" options={live.indianAccounts.map((b) => ({ value: b.id, label: b.label }))} value={x.bankAccountId} onChange={(v) => setExtra((xs) => xs.map((y) => (y.id === x.id ? { ...y, bankAccountId: v } : y)))} placeholder="Choose an account" />
                          ) : (
                            <span className="yx-ppl__type">
                              <TextField aria-label="IBAN" size="sm" value={x.iban} onChange={(v) => setExtra((xs) => xs.map((y) => (y.id === x.id ? { ...y, iban: v } : y)))} className="yx-mono" />
                              <TextField aria-label="BIC" size="sm" value={x.bic} onChange={(v) => setExtra((xs) => xs.map((y) => (y.id === x.id ? { ...y, bic: v } : y)))} placeholder="BIC" />
                            </span>
                          )}
                        </td>
                        <td>
                          <Select aria-label="Rule" size="sm" options={RULES.slice(1)} value={x.rule} onChange={(v) => v && setExtra((xs) => xs.map((y) => (y.id === x.id ? { ...y, rule: v as ExtraRow['rule'] } : y)))} />
                        </td>
                        <td>
                          <span className="yx-ppl__row">
                            <NumberField aria-label="Value" size="sm" value={x.value} onChange={(v) => setExtra((xs) => xs.map((y) => (y.id === x.id ? { ...y, value: v ?? 0 } : y)))} />
                            <Button size="sm" onClick={() => setExtra((xs) => xs.filter((y) => y.id !== x.id))}>
                              Remove
                            </Button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pct > 100 && (
                <InlineAlert tone="danger" title="This split can't be saved">
                  The percentages add up to more than 100.
                </InlineAlert>
              )}
              <div className="yx-ppl__row">
                <Button icon={Plus} size="sm" disabled={extra.length >= 2} onClick={() => setExtra((xs) => [...xs, { id: `n${Date.now()}`, kind: 'iban', iban: '', bic: '', bankAccountId: null, rule: 'fixed', value: 0 }])}>
                  Add account
                </Button>
                {live.indianAccounts.length > 0 && (
                  <Button size="sm" disabled={extra.length >= 2} onClick={() => setExtra((xs) => [...xs, { id: `n${Date.now()}`, kind: 'india', iban: '', bic: '', bankAccountId: live.indianAccounts[0].id, rule: 'fixed', value: 0 }])}>
                    Add Indian account
                  </Button>
                )}
                <Text size="sm" tone="secondary">
                  Up to 3 accounts: fixed amounts first, then percentages, remainder to the primary.
                </Text>
              </div>
            </Card>
            <InlineAlert tone="info">Changes need approval and a cooling period before the first payout. {live.self ? 'We tell you when it is approved.' : 'The employee sees the change on their record.'}</InlineAlert>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <div className="yx-ppl__row">
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" loading={busy} disabled={!ibanOk || !bicOk || !extraOk || pct > 100} onClick={() => void send()}>
                Send for approval
              </Button>
            </div>
          </>
        )}
        {error && !editing && <InlineAlert tone="danger">{error}</InlineAlert>}
      </div>
      {rejecting && <RejectDialog onClose={() => setRejecting(false)} onReject={(note) => live.onDecide(false, note)} />}
    </Card>
  );
}

function RejectDialog({ onClose, onReject }: { onClose: () => void; onReject: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  return (
    <ActionDialog title="Reject the bank change?" action="Reject" disabled={note.trim().length < 3} onClose={onClose} onSubmit={() => onReject(note.trim())}>
      <FormField label="Reason" required>
        <TextArea rows={2} value={note} onChange={setNote} maxLength={500} />
      </FormField>
    </ActionDialog>
  );
}
