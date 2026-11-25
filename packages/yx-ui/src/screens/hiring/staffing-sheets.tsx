// Staffing desk slice 1 (HIR-14, HIR-15): the sheets drawn for the live pages: add or change a client, add or change a
// contact, add a rate-card line. Same kit parts as the designed screens; pressed too early, each shows the field's error
// and focuses it (the button is never greyed out); done is a toast. Slice 2 adds submit to client, new placement, add to
// bench, vendor and share-a-job sheets.
import { useEffect, useState } from 'react';
import { Send, Share2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { Segment } from '../../components/segment';
import { MultiSelect, Select } from '../../components/select';
import { formatDate, formatINR } from '../../lib/format';
import { Text } from '../../components/foundations';
import type { Choice } from './live/types';
import './hiring.css';

const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
const isoOf = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);
const dateOf = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00`) : null);
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Shared busy / error / toast handling for a sheet's save. */
function useSave(onDone: () => void) {
  const toast = useToastIfAny();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, title: string) => {
    setBusy(true);
    setFailed(null);
    try {
      await fn();
      toast?.toast({ tone: 'success', title });
      onDone();
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, failed, setFailed, run };
}

/* ---------------- Client ---------------- */

export interface ClientInput {
  name: string;
  legalName: string | null;
  gstin: string | null;
  state: string;
  billingAddress: string;
  status: 'onboarding' | 'active' | 'on_hold';
  accountManagerUserId: string | null;
  paymentTermsDays: number | null;
  contractStart: string | null;
  contractEnd: string | null;
  noticeDays: number | null;
  slaFirstSubmissionDays: number | null;
  slaFeedbackDays: number | null;
  /** Slice 3 (answer 454): TDS the client deducts and how its invoices are grouped. */
  tdsSection?: '194C' | '194J' | null;
  invoiceGrouping?: 'month' | 'placement';
}

export interface ClientSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Change: the client's current values; add: null. */
  initial: ClientInput | null;
  states: Choice[];
  people: Choice[];
  /** The company's default payment terms (Settings › Staffing desk). */
  defaultTermsDays: number;
  onSave: (input: ClientInput) => Promise<unknown>;
}

export function ClientSheet({ open, onOpenChange, initial, states, people, defaultTermsDays, onSave }: ClientSheetProps) {
  const [f, setF] = useState<ClientInput>(initial ?? { name: '', legalName: null, gstin: null, state: '', billingAddress: '', status: 'onboarding', accountManagerUserId: null, paymentTermsDays: null, contractStart: null, contractEnd: null, noticeDays: null, slaFirstSubmissionDays: null, slaFeedbackDays: null });
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  const set = (p: Partial<ClientInput>) => setF((x) => ({ ...x, ...p }));
  const gstBad = Boolean(f.gstin && !GSTIN.test(f.gstin.toUpperCase()));
  const datesBad = Boolean(f.contractStart && f.contractEnd && f.contractEnd < f.contractStart);
  const save = () => {
    setTried(true);
    if (!f.name.trim()) return focus('cl-name');
    if (gstBad) return focus('cl-gstin');
    if (!f.state) return focus('cl-state');
    if (!f.billingAddress.trim()) return focus('cl-address');
    if (datesBad) return focus('cl-end');
    void s.run(() => onSave({ ...f, name: f.name.trim(), legalName: f.legalName?.trim() || null, gstin: f.gstin?.trim().toUpperCase() || null, billingAddress: f.billingAddress.trim() }), initial ? 'Client saved' : 'Client added');
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={initial ? `Change ${initial.name}` : 'Add client'}
      subtitle="Clients"
      dirty
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={s.busy} onClick={save}>
            {initial ? 'Save client' : 'Add client'}
          </Button>
        </>
      }
    >
      <div className="yx-hire-stack">
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        <FormField id="cl-name" label="Client name" required error={tried && !f.name.trim() ? 'Enter the client’s name.' : null}>
          <TextField value={f.name} onChange={(v) => set({ name: v })} maxLength={200} />
        </FormField>
        <FieldRow>
          <FormField id="cl-legal" label="Legal name" optional>
            <TextField value={f.legalName ?? ''} onChange={(v) => set({ legalName: v })} maxLength={200} />
          </FormField>
          <FormField id="cl-gstin" label="GSTIN" optional helper="Its state must match the billing state." error={tried && gstBad ? 'A GSTIN has 15 characters, like 33AAFCN4521K1Z2.' : null}>
            <TextField value={f.gstin ?? ''} onChange={(v) => set({ gstin: v.toUpperCase() })} maxLength={15} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="cl-state" label="Billing state (place of supply)" required error={tried && !f.state ? 'Choose the billing state.' : null}>
            <Select value={f.state || null} onChange={(v) => set({ state: v ?? '' })} options={states} searchable placeholder="Choose a state" />
          </FormField>
          <FormField id="cl-status" label="Status">
            <Segment label="Status" value={f.status} onChange={(v) => set({ status: v })} options={[{ value: 'onboarding', label: 'Onboarding' }, { value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On hold' }]} />
          </FormField>
        </FieldRow>
        <FormField id="cl-address" label="Billing address" required error={tried && !f.billingAddress.trim() ? 'Enter the billing address.' : null}>
          <TextArea value={f.billingAddress} onChange={(v) => set({ billingAddress: v })} rows={2} maxLength={500} />
        </FormField>
        <FieldRow>
          <FormField id="cl-am" label="Account manager" optional>
            <Select value={f.accountManagerUserId} onChange={(v) => set({ accountManagerUserId: v })} options={people} searchable clearable placeholder="Nobody yet" />
          </FormField>
          <FormField id="cl-terms" label="Payment terms (days)" optional helper={`Empty: the company default, ${defaultTermsDays} days.`}>
            <NumberField value={f.paymentTermsDays} onChange={(v) => set({ paymentTermsDays: v })} min={0} max={180} />
          </FormField>
        </FieldRow>
        <Text size="sm" weight="medium">Contract</Text>
        <FieldRow>
          <FormField id="cl-start" label="Starts" optional>
            <DatePicker value={dateOf(f.contractStart)} onChange={(d) => set({ contractStart: isoOf(d) })} />
          </FormField>
          <FormField id="cl-end" label="Ends" optional error={tried && datesBad ? 'The contract cannot end before it starts.' : null}>
            <DatePicker value={dateOf(f.contractEnd)} onChange={(d) => set({ contractEnd: isoOf(d) })} />
          </FormField>
          <FormField id="cl-notice" label="Notice (days)" optional>
            <NumberField value={f.noticeDays} onChange={(v) => set({ noticeDays: v })} min={0} max={365} />
          </FormField>
        </FieldRow>
        <Text size="sm" weight="medium">SLAs</Text>
        <FieldRow>
          <FormField id="cl-sla1" label="First submission within (working days)" optional>
            <NumberField value={f.slaFirstSubmissionDays} onChange={(v) => set({ slaFirstSubmissionDays: v })} min={1} max={60} />
          </FormField>
          <FormField id="cl-sla2" label="Client feedback within (working days)" optional>
            <NumberField value={f.slaFeedbackDays} onChange={(v) => set({ slaFeedbackDays: v })} min={1} max={60} />
          </FormField>
        </FieldRow>
        <Text size="sm" weight="medium">Invoicing</Text>
        <FieldRow>
          <FormField id="cl-tds" label="TDS the client deducts" optional helper="Rates come from the TDS rule set.">
            <Segment label="TDS the client deducts" value={f.tdsSection ?? null} onChange={(v) => set({ tdsSection: v })} options={[{ value: '194C', label: '194C contract' }, { value: '194J', label: '194J professional' }]} />
          </FormField>
          <FormField id="cl-group" label="Invoices">
            <Segment label="Invoices" value={f.invoiceGrouping ?? 'month'} onChange={(v) => set({ invoiceGrouping: v })} options={[{ value: 'month', label: 'One a month' }, { value: 'placement', label: 'One per placement' }]} />
          </FormField>
        </FieldRow>
      </div>
    </Drawer>
  );
}

/* ---------------- Contact ---------------- */

export interface ContactInput {
  name: string;
  role: string;
  email: string;
  phone: string | null;
  billing: boolean;
}

export function ContactSheet({ open, onOpenChange, initial, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; initial: ContactInput | null; onSave: (input: ContactInput) => Promise<unknown> }) {
  const [f, setF] = useState<ContactInput>(initial ?? { name: '', role: '', email: '', phone: null, billing: false });
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  const set = (p: Partial<ContactInput>) => setF((x) => ({ ...x, ...p }));
  const emailBad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());
  const save = () => {
    setTried(true);
    if (!f.name.trim()) return focus('ct-name');
    if (!f.role.trim()) return focus('ct-role');
    if (emailBad) return focus('ct-email');
    void s.run(() => onSave({ ...f, name: f.name.trim(), role: f.role.trim(), email: f.email.trim(), phone: f.phone?.trim() || null }), initial ? 'Contact saved' : 'Contact added');
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={initial ? `Change ${initial.name}` : 'Add contact'} subtitle="Client contacts" dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={s.busy} onClick={save}>{initial ? 'Save contact' : 'Add contact'}</Button></>}>
      <div className="yx-hire-stack">
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        <FormField id="ct-name" label="Name" required error={tried && !f.name.trim() ? 'Enter the name.' : null}>
          <TextField value={f.name} onChange={(v) => set({ name: v })} maxLength={120} />
        </FormField>
        <FormField id="ct-role" label="Role" required error={tried && !f.role.trim() ? 'Enter their role, for example Accounts payable.' : null}>
          <TextField value={f.role} onChange={(v) => set({ role: v })} maxLength={120} />
        </FormField>
        <FieldRow>
          <FormField id="ct-email" label="Email" required error={tried && emailBad ? 'Enter a valid email.' : null}>
            <TextField value={f.email} onChange={(v) => set({ email: v })} maxLength={254} />
          </FormField>
          <FormField id="ct-phone" label="Phone" optional>
            <TextField value={f.phone ?? ''} onChange={(v) => set({ phone: v })} maxLength={16} />
          </FormField>
        </FieldRow>
        <Checkbox label="Billing contact (invoices and payment reminders go to them)" checked={f.billing} onChange={(c) => set({ billing: c })} />
      </div>
    </Drawer>
  );
}

/* ---------------- Rate-card line ---------------- */

export interface RateLineInput {
  role: string;
  skill: string;
  location: string;
  unit: 'hour' | 'day' | 'month';
  billRate: number;
  payRate: number;
  ot: string;
  holiday: string;
  validFrom: string;
}

const MULT = ['1', '1.25', '1.5', '1.75', '2', '2.5', '3'].map((v) => ({ value: v, label: `${v}×` }));

export function RateLineSheet({ open, onOpenChange, defaults, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; defaults: { ot: string; holiday: string; today: Date }; onSave: (input: RateLineInput) => Promise<unknown> }) {
  const [f, setF] = useState({ role: '', skill: '', location: '', unit: 'hour' as RateLineInput['unit'], bill: null as number | null, pay: null as number | null, ot: defaults.ot, holiday: defaults.holiday, from: defaults.today as Date | null });
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const payBad = f.pay == null || f.pay <= 0 || (f.bill != null && f.pay > f.bill);
  const margin = f.bill && f.pay != null && f.bill > 0 ? Math.round(((f.bill - f.pay) / f.bill) * 1000) / 10 : null;
  const save = () => {
    setTried(true);
    if (!f.role.trim()) return focus('rl-role');
    if (!f.skill.trim()) return focus('rl-skill');
    if (!f.location.trim()) return focus('rl-loc');
    if (f.bill == null || f.bill <= 0) return focus('rl-bill');
    if (payBad) return focus('rl-pay');
    if (!f.from) return focus('rl-from');
    void s.run(() => onSave({ role: f.role.trim(), skill: f.skill.trim(), location: f.location.trim(), unit: f.unit, billRate: f.bill!, payRate: f.pay!, ot: f.ot, holiday: f.holiday, validFrom: isoOf(f.from)! }), 'Role added to the rate card');
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Add role" subtitle="Rate card" dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={s.busy} onClick={save}>Add role</Button></>}>
      <div className="yx-hire-stack">
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        <FormField id="rl-role" label="Role" required error={tried && !f.role.trim() ? 'Enter the role.' : null}>
          <TextField value={f.role} onChange={(v) => set({ role: v })} maxLength={120} />
        </FormField>
        <FieldRow>
          <FormField id="rl-skill" label="Skills" required error={tried && !f.skill.trim() ? 'Enter the skills.' : null}>
            <TextField value={f.skill} onChange={(v) => set({ skill: v })} maxLength={200} />
          </FormField>
          <FormField id="rl-loc" label="Location" required error={tried && !f.location.trim() ? 'Enter the location.' : null}>
            <TextField value={f.location} onChange={(v) => set({ location: v })} maxLength={120} />
          </FormField>
        </FieldRow>
        <FormField id="rl-unit" label="Billed per">
          <Segment label="Billed per" value={f.unit} onChange={(v) => set({ unit: v })} options={[{ value: 'hour', label: 'Hour' }, { value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }]} />
        </FormField>
        <FieldRow>
          <FormField id="rl-bill" label="Bill rate" required error={tried && (f.bill == null || f.bill <= 0) ? 'Enter the bill rate.' : null}>
            <CurrencyField value={f.bill} onChange={(v) => set({ bill: v })} />
          </FormField>
          <FormField id="rl-pay" label="Pay rate" required error={tried && payBad ? (f.pay != null && f.bill != null && f.pay > f.bill ? 'The pay rate is above the bill rate.' : 'Enter the pay rate.') : null}>
            <CurrencyField value={f.pay} onChange={(v) => set({ pay: v })} />
          </FormField>
        </FieldRow>
        {margin != null && (
          <Text size="sm" tone="secondary" aria-live="polite">
            Gross margin {margin}%
          </Text>
        )}
        <FieldRow>
          <FormField id="rl-ot" label="OT multiplier" helper="Company default from Settings › Staffing desk.">
            <Select value={f.ot} onChange={(v) => v && set({ ot: v })} options={MULT} />
          </FormField>
          <FormField id="rl-hol" label="Holiday multiplier">
            <Select value={f.holiday} onChange={(v) => v && set({ holiday: v })} options={MULT} />
          </FormField>
        </FieldRow>
        <FormField id="rl-from" label="Valid from" required error={tried && !f.from ? 'Choose the day it starts.' : null}>
          <DatePicker value={f.from} onChange={(d) => set({ from: d })} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ---------------- Invoice series (Settings 6.2) ---------------- */

export interface InvoiceSeriesInput {
  legalEntityId: string;
  gstin: string;
  financialYear: string;
  prefix: string;
  nextNumber: number;
}

export interface InvoiceSeriesSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Change: the series; add: null. */
  initial: (InvoiceSeriesInput & { id: string }) | null;
  entities: { id: string; name: string; gstins: string[] }[];
  financialYear: string;
  onSave: (input: InvoiceSeriesInput) => Promise<unknown>;
}

export function InvoiceSeriesSheet({ open, onOpenChange, initial, entities, financialYear, onSave }: InvoiceSeriesSheetProps) {
  const [f, setF] = useState<{ legalEntityId: string | null; gstin: string | null; financialYear: string; prefix: string; nextNumber: number | null }>(initial ?? { legalEntityId: entities.length === 1 ? entities[0]!.id : null, gstin: null, financialYear, prefix: '', nextNumber: 1 });
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const gstins = entities.find((e) => e.id === f.legalEntityId)?.gstins ?? [];
  const prefixBad = !/^[A-Za-z0-9/-]{1,13}$/.test(f.prefix.trim());
  const fyBad = !/^\d{4}-\d{2}$/.test(f.financialYear) || (Number(f.financialYear.slice(0, 4)) + 1) % 100 !== Number(f.financialYear.slice(5));
  const nextBad = f.nextNumber == null || f.nextNumber < (initial?.nextNumber ?? 1);
  const save = () => {
    setTried(true);
    if (!f.legalEntityId) return focus('is-entity');
    if (!f.gstin) return focus('is-gstin');
    if (fyBad) return focus('is-fy');
    if (prefixBad) return focus('is-prefix');
    if (nextBad) return focus('is-next');
    void s.run(() => onSave({ legalEntityId: f.legalEntityId!, gstin: f.gstin!, financialYear: f.financialYear, prefix: f.prefix.trim(), nextNumber: f.nextNumber! }), initial ? 'Invoice series saved' : 'Invoice series added');
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={initial ? `Change ${initial.prefix}` : 'Add invoice series'} subtitle="Invoice numbering" dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={s.busy} onClick={save}>{initial ? 'Save series' : 'Add series'}</Button></>}>
      <div className="yx-hire-stack">
        <Text as="p" size="sm" tone="secondary">One continuous series for each GSTIN in each financial year (CGST Rules, 2017 r.46(b)). A number already used is never given again, so the next number can only go up.</Text>
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        <FieldRow>
          <FormField id="is-entity" label="Legal entity" required error={tried && !f.legalEntityId ? 'Choose the legal entity.' : null}>
            <Select value={f.legalEntityId} onChange={(v) => set({ legalEntityId: v, gstin: null })} options={entities.map((e) => ({ value: e.id, label: e.name }))} placeholder="Choose an entity" />
          </FormField>
          <FormField id="is-gstin" label="GSTIN" required helper={f.legalEntityId && !gstins.length ? 'This entity has no GSTIN yet (Settings › Legal entities).' : undefined} error={tried && !f.gstin ? 'Choose the GSTIN.' : null}>
            <Select value={f.gstin} onChange={(v) => set({ gstin: v })} options={gstins.map((g) => ({ value: g, label: g }))} placeholder={f.legalEntityId ? 'Choose a GSTIN' : 'Choose the entity first'} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="is-fy" label="Financial year" required error={tried && fyBad ? 'Give the year as 2026-27.' : null}>
            <TextField value={f.financialYear} onChange={(v) => set({ financialYear: v })} maxLength={7} />
          </FormField>
          <FormField id="is-prefix" label="Series" required helper="For example KFL/INV/26-27/" error={tried && prefixBad ? 'Up to 13 letters, digits, / or -.' : null}>
            <TextField value={f.prefix} onChange={(v) => set({ prefix: v })} maxLength={13} />
          </FormField>
          <FormField id="is-next" label="Next number" required error={tried && nextBad ? (initial ? `It cannot go below ${initial.nextNumber}.` : 'Enter 1 or more.') : null}>
            <NumberField value={f.nextNumber} onChange={(v) => set({ nextNumber: v })} min={1} max={99999999} />
          </FormField>
        </FieldRow>
      </div>
    </Drawer>
  );
}

/* ================================================================== Staffing slice 2 (HIR-16, HIR-17, HIR-21) */

export interface SubmitPerson {
  kind: 'employee' | 'candidate';
  id: string;
  name: string;
  note: string;
}
export interface SubmitOptions {
  job: { id: string; title: string; client: string };
  billRate: string | null;
  unit: string | null;
  mask: boolean;
  people: SubmitPerson[];
  contacts: { id: string; name: string; role: string }[];
}
export interface SubmitInput {
  jobId: string;
  people: { kind: 'employee' | 'candidate'; id: string }[];
  contactId: string;
  billRate: number;
  masked: boolean;
}

/** HIR-16 Submit to client: a client job, its people (bench first), a contact, the bill rate and whether to mask. */
export function SubmitToClientSheet({ open, onOpenChange, jobs, initialJobId = null, loadOptions, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; jobs: Choice[]; initialJobId?: string | null; loadOptions: (jobId: string) => Promise<SubmitOptions>; onSave: (input: SubmitInput) => Promise<unknown> }) {
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [opts, setOpts] = useState<SubmitOptions | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [contact, setContact] = useState<string | null>(null);
  const [bill, setBill] = useState<number | null>(null);
  const [masked, setMasked] = useState(true);
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  useEffect(() => {
    if (!jobId) return;
    let on = true;
    setOpts(null);
    setLoadErr(null);
    loadOptions(jobId)
      .then((o) => {
        if (!on) return;
        setOpts(o);
        setPeople([]);
        setContact(o.contacts.length === 1 ? o.contacts[0]!.id : null);
        setBill(o.billRate != null ? Number(o.billRate) : null);
        setMasked(o.mask);
      })
      .catch((e: unknown) => on && setLoadErr(e instanceof Error && e.message ? e.message : 'The job could not be loaded.'));
    return () => {
      on = false;
    };
  }, [jobId, loadOptions]);
  const key = (p: SubmitPerson) => `${p.kind}:${p.id}`;
  const save = () => {
    setTried(true);
    if (!jobId) return focus('sc-job');
    if (!opts) return;
    if (!people.length) return focus('sc-people');
    if (!contact) return focus('sc-contact');
    if (bill == null || bill <= 0) return focus('sc-bill');
    const chosen = opts.people.filter((p) => people.includes(key(p))).map((p) => ({ kind: p.kind, id: p.id }));
    void s.run(() => onSave({ jobId, people: chosen, contactId: contact, billRate: bill, masked }), people.length === 1 ? 'Submitted to the client' : `${people.length} people submitted to the client`);
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Submit to client"
      subtitle={opts ? `${opts.job.title} · ${opts.job.client}` : 'Submissions'}
      dirty
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" icon={Send} loading={s.busy} onClick={save}>
            {people.length > 1 ? `Submit ${people.length} people` : 'Submit'}
          </Button>
        </>
      }
    >
      <div className="yx-hire-stack">
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        <FormField id="sc-job" label="Client job" required error={tried && !jobId ? 'Choose the client job.' : null}>
          <Select value={jobId} onChange={setJobId} options={jobs} placeholder="Choose a client job" />
        </FormField>
        {loadErr && <InlineAlert tone="danger" title={loadErr} />}
        {opts && (
          <>
            <FormField id="sc-people" label="People" required helper="Bench people are listed first, then this job’s pipeline." error={tried && !people.length ? 'Choose at least one person.' : null}>
              <MultiSelect value={people} onChange={setPeople} options={opts.people.map((p) => ({ value: key(p), label: p.name, description: p.note }))} />
            </FormField>
            {opts.people.length === 0 && <Text size="sm" tone="secondary">No one is free for this job: the bench is empty and everyone in its pipeline is already submitted.</Text>}
            <FormField id="sc-contact" label="Client contact" required helper="They get one email naming the people." error={tried && !contact ? (opts.contacts.length ? 'Choose the client contact.' : 'Add a contact to this client first.') : null}>
              <Select value={contact} onChange={setContact} options={opts.contacts.map((c) => ({ value: c.id, label: `${c.name} · ${c.role}` }))} placeholder="Choose a contact" />
            </FormField>
            <FormField id="sc-bill" label={`Bill rate per ${opts.unit ?? 'hour'}`} required helper={opts.billRate ? `From the rate card: ${formatINR(Number(opts.billRate))}` : 'The rate card has no rate for this role today.'} error={tried && (bill == null || bill <= 0) ? 'Enter the bill rate.' : null}>
              <CurrencyField value={bill} onChange={setBill} />
            </FormField>
            <Checkbox label="Hide phone and email from the client until they shortlist" checked={masked} onChange={setMasked} />
            <InlineAlert tone="info">Pay rates and margins are never sent to the client.</InlineAlert>
          </>
        )}
      </div>
    </Drawer>
  );
}

export interface PlaceableRow {
  id: string;
  person: string;
  job: string;
  source: 'employee' | 'candidate' | 'vendor';
  /** CL-8: the client's sites (client establishments); our own employees placed there count against our licence. */
  sites?: { id: string; name: string }[];
}
export interface PlacementInput {
  submissionId: string;
  startOn: string;
  endOn: string;
  clientSiteId?: string;
}

/** HIR-17 New placement: a selected submission, its first and last day. */
export function PlacementSheet({ open, onOpenChange, placeable, today, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; placeable: PlaceableRow[]; today: Date; onSave: (input: PlacementInput) => Promise<unknown> }) {
  const [sub, setSub] = useState<string | null>(placeable.length === 1 ? placeable[0]!.id : null);
  const [start, setStart] = useState<Date | null>(today);
  const [end, setEnd] = useState<Date | null>(null);
  const [site, setSite] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  const chosen = placeable.find((p) => p.id === sub);
  const sites = chosen?.sites ?? [];
  // Answer 822: our own employee is placed at one of the client's sites once it has sites.
  const siteNeeded = chosen?.source === 'employee' && sites.length > 0 && !sites.some((x) => x.id === site);
  const endBad = !end || Boolean(start && end < start);
  const save = () => {
    setTried(true);
    if (!sub) return focus('pl-sub');
    if (!start) return focus('pl-start');
    if (endBad) return focus('pl-end');
    if (siteNeeded) return focus('pl-site');
    void s.run(() => onSave({ submissionId: sub, startOn: isoOf(start)!, endOn: isoOf(end)!, ...(site && sites.some((x) => x.id === site) ? { clientSiteId: site } : {}) }), 'Placement started');
  };
  const SOURCE = { employee: 'Own payroll', candidate: 'Pipeline candidate', vendor: 'Vendor supplied' } as const;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="New placement" subtitle="Placements" dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={s.busy} onClick={save}>Start placement</Button></>}>
      <div className="yx-hire-stack">
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        <FormField id="pl-sub" label="Selected by the client" required helper="Submissions the client selected that are not placed yet." error={tried && !sub ? (placeable.length ? 'Choose who is placed.' : 'No one is selected yet. Move a submission to Selected first.') : null}>
          <Select value={sub} onChange={setSub} options={placeable.map((p) => ({ value: p.id, label: p.person, description: `${p.job} · ${SOURCE[p.source]}` }))} placeholder="Choose a person" />
        </FormField>
        {chosen?.source === 'candidate' && <InlineAlert tone="warning">A pipeline candidate joins as an employee first (People › Onboarding); then submit them from the bench.</InlineAlert>}
        {sites.length > 0 && (
          <FormField id="pl-site" label="Client site" {...(chosen?.source === 'employee' ? { required: true } : { optional: true })} helper="Where they work. Our own staff at a site count against our contractor licence there." error={tried && siteNeeded ? 'Choose the client site where they will work.' : null}>
            <Select value={site} onChange={setSite} options={sites.map((x) => ({ value: x.id, label: x.name }))} placeholder="Choose a site" />
          </FormField>
        )}
        <FieldRow>
          <FormField id="pl-start" label="First day" required helper="The rate card must have a rate on this day." error={tried && !start ? 'Choose the first day.' : null}>
            <DatePicker value={start} onChange={setStart} />
          </FormField>
          <FormField id="pl-end" label="Last day" required error={tried && endBad ? (end ? 'The last day is before the first day.' : 'Choose the last day.') : null}>
            <DatePicker value={end} onChange={setEnd} min={start ?? undefined} />
          </FormField>
        </FieldRow>
        <Text size="sm" tone="secondary">Own payroll takes the person off the bench the day before the first day. A vendor’s candidate is paid at the vendor’s quote.</Text>
      </div>
    </Drawer>
  );
}

export interface BenchInput {
  employeeId: string;
  sinceOn: string;
  note: string | null;
}

/** HIR-17 Add to bench: an employee between placements, from a day. */
export function BenchSheet({ open, onOpenChange, people, today, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; people: Choice[]; today: Date; onSave: (input: BenchInput) => Promise<unknown> }) {
  const [who, setWho] = useState<string | null>(null);
  const [since, setSince] = useState<Date | null>(today);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  const save = () => {
    setTried(true);
    if (!who) return focus('bn-who');
    if (!since) return focus('bn-since');
    void s.run(() => onSave({ employeeId: who, sinceOn: isoOf(since)!, note: note.trim() || null }), 'Added to the bench');
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Add to bench" subtitle="Bench" dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={s.busy} onClick={save}>Add to bench</Button></>}>
      <div className="yx-hire-stack">
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        <FormField id="bn-who" label="Employee" required helper="Active employees who are not placed now and not on the bench." error={tried && !who ? 'Choose the employee.' : null}>
          <Select value={who} onChange={setWho} options={people} placeholder="Choose an employee" />
        </FormField>
        <FormField id="bn-since" label="On the bench from" required error={tried && !since ? 'Choose the day.' : null}>
          <DatePicker value={since} onChange={setSince} />
        </FormField>
        <FormField id="bn-note" label="Note" optional>
          <TextArea rows={2} value={note} onChange={setNote} maxLength={300} />
        </FormField>
      </div>
    </Drawer>
  );
}

export interface VendorInput {
  name: string;
  contactEmail: string | null;
  pan: string | null;
  gstin: string | null;
  tdsSection: '194C' | '194J' | null;
  tier: 'preferred' | 'standard' | 'probation' | null;
  agreementSignedOn: string | null;
  bankVerified: boolean;
  active: boolean;
}
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Changing a vendor: its portal link and the jobs shared with it (what the older agencies page did). */
export interface VendorLinks {
  link: string;
  jobs: { id: string; title: string; expiresOn: string | null }[];
  onNewLink: () => Promise<unknown>;
  onUnshare: (jobId: string) => Promise<unknown>;
}

/** HIR-21 Add or change a vendor: the documents that make it complete for client jobs. */
export function VendorSheet({ open, onOpenChange, initial, links, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; initial: VendorInput | null; links?: VendorLinks; onSave: (input: VendorInput) => Promise<unknown> }) {
  const toast = useToastIfAny();
  const [linkBusy, setLinkBusy] = useState(false);
  const [f, setF] = useState<VendorInput>(initial ?? { name: '', contactEmail: null, pan: null, gstin: null, tdsSection: null, tier: null, agreementSignedOn: null, bankVerified: false, active: true });
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  const set = (p: Partial<VendorInput>) => setF((x) => ({ ...x, ...p }));
  const emailBad = Boolean(f.contactEmail && !EMAIL.test(f.contactEmail));
  const panBad = Boolean(f.pan && !PAN.test(f.pan));
  const gstBad = Boolean(f.gstin && (!GSTIN.test(f.gstin) || (f.pan && f.gstin.slice(2, 12) !== f.pan)));
  const save = () => {
    setTried(true);
    if (!f.name.trim()) return focus('vd-name');
    if (emailBad) return focus('vd-email');
    if (panBad) return focus('vd-pan');
    if (gstBad) return focus('vd-gstin');
    void s.run(() => onSave({ ...f, name: f.name.trim(), contactEmail: f.contactEmail?.trim() || null, pan: f.pan || null, gstin: f.gstin || null }), initial ? 'Vendor saved' : 'Vendor added');
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="lg" title={initial ? `Change ${initial.name}` : 'Add vendor'} subtitle="Vendors" dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={s.busy} onClick={save}>{initial ? 'Save vendor' : 'Add vendor'}</Button></>}>
      <div className="yx-hire-stack">
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        <FieldRow>
          <FormField id="vd-name" label="Vendor name" required error={tried && !f.name.trim() ? 'Enter the vendor’s name.' : null}>
            <TextField value={f.name} onChange={(v) => set({ name: v })} maxLength={200} />
          </FormField>
          <FormField id="vd-email" label="Contact email" optional error={tried && emailBad ? 'Enter an email like ops@vendor.in.' : null}>
            <TextField value={f.contactEmail ?? ''} onChange={(v) => set({ contactEmail: v })} maxLength={254} />
          </FormField>
        </FieldRow>
        <Text size="sm" tone="secondary">A vendor gets client jobs only with a signed agreement, PAN, a verified bank account and a TDS section.</Text>
        <FieldRow>
          <FormField id="vd-pan" label="PAN" optional error={tried && panBad ? 'A PAN has 10 characters, like ABCDE1234F.' : null}>
            <TextField value={f.pan ?? ''} onChange={(v) => set({ pan: v.toUpperCase() })} maxLength={10} />
          </FormField>
          <FormField id="vd-gstin" label="GSTIN" optional helper="It carries the PAN." error={tried && gstBad ? (f.gstin && GSTIN.test(f.gstin) ? 'The GSTIN does not carry this PAN.' : 'A GSTIN has 15 characters, like 29ABCDE1234F1Z5.') : null}>
            <TextField value={f.gstin ?? ''} onChange={(v) => set({ gstin: v.toUpperCase() })} maxLength={15} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField id="vd-tds" label="TDS section" optional>
            <Segment label="TDS section" value={f.tdsSection} onChange={(v) => set({ tdsSection: v })} options={[{ value: '194C', label: '194C contract' }, { value: '194J', label: '194J professional' }]} />
          </FormField>
          <FormField id="vd-tier" label="Tier" optional>
            <Segment label="Tier" value={f.tier} onChange={(v) => set({ tier: v })} options={[{ value: 'preferred', label: 'Preferred' }, { value: 'standard', label: 'Standard' }, { value: 'probation', label: 'Probation' }]} />
          </FormField>
        </FieldRow>
        <FormField id="vd-agree" label="Agreement signed on" optional>
          <DatePicker value={dateOf(f.agreementSignedOn)} onChange={(d) => set({ agreementSignedOn: isoOf(d) })} />
        </FormField>
        <Checkbox label="Bank account verified (penny drop or cancelled cheque)" checked={f.bankVerified} onChange={(v) => set({ bankVerified: v })} />
        {initial && <Checkbox label="Active" description="An inactive vendor gets no new jobs; its portal link stops working." checked={f.active} onChange={(v) => set({ active: v })} />}
        {links && (
          <>
            <FormField id="vd-link" label="Portal link" helper="Send it to the vendor. A new link stops the old one at once.">
              <TextField value={links.link} onChange={() => {}} readOnly />
            </FormField>
            <div className="yx-hire-actions">
              <Button size="sm" onClick={() => void navigator.clipboard?.writeText(links.link).then(() => toast?.toast({ tone: 'success', title: 'Link copied' }))}>
                Copy link
              </Button>
              <Button
                size="sm"
                loading={linkBusy}
                onClick={() => {
                  setLinkBusy(true);
                  void links
                    .onNewLink()
                    .then(() => toast?.toast({ tone: 'success', title: 'New link made; the old one no longer works' }))
                    .catch((e: unknown) => s.setFailed(e instanceof Error ? e.message : 'That did not save.'))
                    .finally(() => setLinkBusy(false));
                }}
              >
                New link
              </Button>
            </div>
            <Text weight="semibold">Shared jobs</Text>
            {links.jobs.length === 0 ? (
              <Text size="sm" tone="secondary">No jobs shared yet. Use Share a job.</Text>
            ) : (
              <ul className="yx-hire-plainlist" aria-label="Shared jobs">
                {links.jobs.map((j) => (
                  <li key={j.id} className="yx-hire-actions">
                    <Text size="sm">
                      {j.title}
                      {j.expiresOn ? ` · until ${formatDate(new Date(`${j.expiresOn}T00:00:00`))}` : ''}
                    </Text>
                    <Button size="sm" onClick={() => void links.onUnshare(j.id).then(() => toast?.toast({ tone: 'success', title: `Stopped sharing ${j.title}` }), (e: unknown) => s.setFailed(e instanceof Error ? e.message : 'That did not save.'))}>
                      Stop sharing {j.title}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

export interface ShareOptions {
  job: { id: string; title: string; status: string };
  client: string | null;
  billRate: string | null;
  unit: string | null;
  targetMarginPct: number;
  suggestedCap: string | null;
  sharedWith: string[];
}
export interface ShareInput {
  jobId: string;
  agencyIds: string[];
  rateCap: number | null;
  maxSubmissions: number;
  expiresOn: string;
  maskClient: boolean;
}

/** HIR-21 Share a job with vendors: the rate cap (suggested from the target margin), the limit, the last day, a hidden client. */
export function ShareJobSheet({ open, onOpenChange, jobs, vendors, today, loadOptions, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; jobs: Choice[]; vendors: (Choice & { description?: string; disabled?: boolean; complete: boolean })[]; today: Date; loadOptions: (jobId: string) => Promise<ShareOptions>; onSave: (input: ShareInput) => Promise<unknown> }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [opts, setOpts] = useState<ShareOptions | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [cap, setCap] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(5);
  const [expires, setExpires] = useState<Date | null>(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30));
  const [mask, setMask] = useState(false);
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  useEffect(() => {
    if (!jobId) return;
    let on = true;
    setOpts(null);
    loadOptions(jobId).then((o) => {
      if (!on) return;
      setOpts(o);
      setCap(o.suggestedCap != null ? Number(o.suggestedCap) : null);
      setMask(Boolean(o.client));
    });
    return () => {
      on = false;
    };
  }, [jobId, loadOptions]);
  const clientJob = Boolean(opts?.billRate);
  const bill = opts?.billRate != null ? Number(opts.billRate) : null;
  const capBad = clientJob && (cap == null || cap <= 0 || (bill != null && cap > bill));
  const choices = vendors.map((v) => (clientJob && !v.complete ? { ...v, disabled: true } : v));
  const save = () => {
    setTried(true);
    if (!jobId) return focus('sh-job');
    if (!picked.length) return focus('sh-vendors');
    if (capBad) return focus('sh-cap');
    if (max == null || max < 1 || max > 100) return focus('sh-max');
    if (!expires) return focus('sh-exp');
    void s.run(() => onSave({ jobId, agencyIds: picked, rateCap: clientJob ? cap : null, maxSubmissions: max, expiresOn: isoOf(expires)!, maskClient: mask }), `Shared with ${picked.length} vendor${picked.length === 1 ? '' : 's'}`);
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="lg" title="Share job with vendors" subtitle={opts ? `${opts.job.title}${opts.client ? ` · ${opts.client}` : ''}${opts.billRate ? ` · bill rate ${formatINR(Number(opts.billRate))}/${opts.unit ?? 'hour'}` : ''}` : 'Vendors'} dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" icon={Share2} loading={s.busy} onClick={save}>{picked.length ? `Share with ${picked.length} vendor${picked.length === 1 ? '' : 's'}` : 'Share'}</Button></>}>
      <div className="yx-hire-sheet">
        <div className="yx-hire-sheet__form">
          {s.failed && <InlineAlert tone="danger" title={s.failed} />}
          <FormField id="sh-job" label="Job" required helper="Open jobs only." error={tried && !jobId ? 'Choose the job.' : null}>
            <Select value={jobId} onChange={setJobId} options={jobs} placeholder="Choose a job" />
          </FormField>
          <FormField id="sh-vendors" label="Vendors" required helper={clientJob ? 'A client job goes only to vendors with every document.' : 'Active vendors.'} error={tried && !picked.length ? 'Choose at least one vendor.' : null}>
            <MultiSelect value={picked} onChange={setPicked} options={choices} />
          </FormField>
          {clientJob && (
            <FormField id="sh-cap" label={`Rate cap per ${opts?.unit ?? 'hour'}`} required helper={`Suggested: bill rate less the ${opts?.targetMarginPct}% target margin (Settings › Staffing desk).`} error={tried && capBad ? (cap != null && bill != null && cap > bill ? 'The cap is above the bill rate: placements would run at a loss.' : 'Enter the rate cap.') : null}>
              <CurrencyField value={cap} onChange={setCap} />
            </FormField>
          )}
          <FieldRow>
            <FormField id="sh-max" label="Most submissions per vendor" required error={tried && (max == null || max < 1 || max > 100) ? 'Enter 1 to 100.' : null}>
              <NumberField value={max} onChange={setMax} min={1} max={100} />
            </FormField>
            <FormField id="sh-exp" label="Share ends on" required error={tried && !expires ? 'Choose the last day.' : null}>
              <DatePicker value={expires} onChange={setExpires} min={today} />
            </FormField>
          </FieldRow>
          {opts?.client && <Checkbox label="Hide the client’s name from vendors" checked={mask} onChange={setMask} />}
        </div>
        <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="What vendors see">
          <Text weight="semibold">What vendors see</Text>
          <ul className="yx-hire-plainlist">
            <li>The role, location and the last day to submit</li>
            {opts?.client && <li>Client: {mask ? 'hidden' : opts.client}</li>}
            {clientJob && <li>Rate cap {cap != null ? formatINR(cap) : '—'}; a quote above it waits for your exception</li>}
            <li>Never: bill rate, margin, other vendors, or who holds a duplicate</li>
          </ul>
        </aside>
      </div>
    </Drawer>
  );
}

export interface ClientJobInput {
  clientId: string;
  lineId: string;
  title: string | null;
  headcount: number;
}

/** HIR-16 New client job: an ordinary job on a client's rate-card line (pipeline, approvals and sharing as any job). */
export function ClientJobSheet({ open, onOpenChange, clients, loadLines, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; clients: Choice[]; loadLines: (clientId: string) => Promise<Choice[]>; onSave: (input: ClientJobInput) => Promise<unknown> }) {
  const [client, setClient] = useState<string | null>(clients.length === 1 ? clients[0]!.value : null);
  const [lines, setLines] = useState<Choice[] | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [count, setCount] = useState<number | null>(1);
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  useEffect(() => {
    if (!client) return;
    let on = true;
    setLines(null);
    setLine(null);
    void loadLines(client).then((l) => on && (setLines(l), l.length === 1 && setLine(l[0]!.value)));
    return () => {
      on = false;
    };
  }, [client, loadLines]);
  const save = () => {
    setTried(true);
    if (!client) return focus('cj-client');
    if (!line) return focus('cj-line');
    if (count == null || count < 1 || count > 500) return focus('cj-count');
    void s.run(() => onSave({ clientId: client, lineId: line, title: title.trim() || null, headcount: count }), 'Client job opened');
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="New client job" subtitle="Submissions" dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={s.busy} onClick={save}>Open job</Button></>}>
      <div className="yx-hire-stack">
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        <FormField id="cj-client" label="Client" required error={tried && !client ? 'Choose the client.' : null}>
          <Select value={client} onChange={setClient} options={clients} placeholder="Choose a client" />
        </FormField>
        <FormField id="cj-line" label="Rate-card role" required helper="The job's bill rate comes from this line of the rate card." error={tried && !line ? (lines && !lines.length ? 'This client has no rate card yet. Add a role first.' : 'Choose the role.') : null}>
          <Select value={line} onChange={setLine} options={lines ?? []} placeholder={client ? (lines ? 'Choose a role' : 'Loading…') : 'Choose a client first'} />
        </FormField>
        <FieldRow>
          <FormField id="cj-title" label="Job title" optional helper="Empty: the role's name.">
            <TextField value={title} onChange={setTitle} maxLength={200} />
          </FormField>
          <FormField id="cj-count" label="People needed" required error={tried && (count == null || count < 1 || count > 500) ? 'Enter 1 to 500.' : null}>
            <NumberField value={count} onChange={setCount} min={1} max={500} />
          </FormField>
        </FieldRow>
      </div>
    </Drawer>
  );
}

/* ================================================================== Answer 522: the accounting export */

export interface ExportOptions {
  series: { id: string; label: string; months: string[]; drafts: number }[];
}
export interface ExportInput {
  seriesId: string;
  month: string;
  format: 'tally' | 'zoho';
}

/** HIR-18 Export to accounting: one GSTIN series and month, as a Tally XML import or Zoho Books CSVs. Drafts never. */
export function ExportSheet({ open, onOpenChange, options, onExport }: { open: boolean; onOpenChange: (o: boolean) => void; options: ExportOptions; onExport: (input: ExportInput) => Promise<unknown> }) {
  const [series, setSeries] = useState<string | null>(options.series.length === 1 ? options.series[0]!.id : null);
  const s = options.series.find((x) => x.id === series);
  const [month, setMonth] = useState<string | null>(s?.months[0] ?? null);
  const [format, setFormat] = useState<'tally' | 'zoho'>('tally');
  const [tried, setTried] = useState(false);
  const run = useSave(() => onOpenChange(false));
  const label = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const save = () => {
    setTried(true);
    if (!series) return focus('ex-series');
    if (!month || !s?.months.includes(month)) return focus('ex-month');
    void run.run(() => onExport({ seriesId: series, month, format }), format === 'tally' ? 'Tally file downloaded' : 'Zoho Books files downloaded');
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Export to accounting" subtitle="Invoices" footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={run.busy} onClick={save}>Download</Button></>}>
      <div className="yx-hire-stack">
        {run.failed && <InlineAlert tone="danger" title={run.failed} />}
        <FormField id="ex-series" label="Invoice series (GSTIN)" required error={tried && !series ? 'Choose the series.' : null}>
          <Select value={series} onChange={(v) => (setSeries(v), setMonth(options.series.find((x) => x.id === v)?.months[0] ?? null))} options={options.series.map((x) => ({ value: x.id, label: x.label }))} placeholder="Choose a series" />
        </FormField>
        <FormField id="ex-month" label="Month" required helper="Invoices and credit notes issued in the month, and the receipts received in it against them." error={tried && (!month || !s?.months.includes(month)) ? (s && !s.months.length ? 'Nothing is issued in this series yet.' : 'Choose the month.') : null}>
          <Select value={month} onChange={setMonth} options={(s?.months ?? []).map((m) => ({ value: m, label: label(m) }))} placeholder={series ? 'Choose a month' : 'Choose a series first'} />
        </FormField>
        <FormField id="ex-format" label="For">
          <Segment label="For" value={format} onChange={setFormat} options={[{ value: 'tally', label: 'Tally (XML)' }, { value: 'zoho', label: 'Zoho Books (CSV)' }]} />
        </FormField>
        {s && s.drafts > 0 && <InlineAlert tone="warning">{s.drafts} draft{s.drafts === 1 ? ' is' : 's are'} not exported: issue {s.drafts === 1 ? 'it' : 'them'} first.</InlineAlert>}
        <Text size="sm" tone="secondary">Ledger names, GST ledgers, TDS, round-off and the bank ledger come from Settings › Staffing desk › Accounting export. Create the ledgers in Tally first; Zoho Books takes invoices, credit notes and customer payments as separate files.</Text>
      </div>
    </Drawer>
  );
}

/* ================================================================== Staffing slice 3 (HIR-18) */

export interface InvoiceOptions {
  clients: { id: string; name: string; months: string[] }[];
  series: { id: string; label: string; financialYear: string }[];
}
export interface DraftInput {
  clientId: string;
  month: string;
  seriesId: string;
  po: string | null;
}

/** HIR-18 Create invoices: a client, a month with approved hours not yet invoiced, the series to number from, a PO. */
export function CreateInvoicesSheet({ open, onOpenChange, options, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; options: InvoiceOptions; onSave: (input: DraftInput) => Promise<unknown> }) {
  const [client, setClient] = useState<string | null>(options.clients.length === 1 ? options.clients[0]!.id : null);
  const months = options.clients.find((c) => c.id === client)?.months ?? [];
  const [month, setMonth] = useState<string | null>(null);
  const [series, setSeries] = useState<string | null>(options.series.length === 1 ? options.series[0]!.id : null);
  const [po, setPo] = useState('');
  const [tried, setTried] = useState(false);
  const s = useSave(() => onOpenChange(false));
  const label = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const save = () => {
    setTried(true);
    if (!client) return focus('ci-client');
    if (!month || !months.includes(month)) return focus('ci-month');
    if (!series) return focus('ci-series');
    void s.run(() => onSave({ clientId: client, month, seriesId: series, po: po.trim() || null }), 'Draft invoices created');
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Create invoices" subtitle="Invoices" dirty footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={s.busy} onClick={save}>Create drafts</Button></>}>
      <div className="yx-hire-stack">
        {s.failed && <InlineAlert tone="danger" title={s.failed} />}
        {options.clients.length === 0 && <InlineAlert tone="info">No approved hours are waiting to be invoiced.</InlineAlert>}
        <FormField id="ci-client" label="Client" required helper="Clients with approved hours not invoiced yet." error={tried && !client ? 'Choose the client.' : null}>
          <Select value={client} onChange={(v) => (setClient(v), setMonth(null))} options={options.clients.map((c) => ({ value: c.id, label: c.name }))} placeholder="Choose a client" />
        </FormField>
        <FormField id="ci-month" label="Month" required helper="A week counts in the month of its Monday." error={tried && (!month || !months.includes(month)) ? 'Choose the month.' : null}>
          <Select value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: label(m) }))} placeholder={client ? 'Choose a month' : 'Choose a client first'} />
        </FormField>
        <FormField id="ci-series" label="Invoice series" required helper="The number is taken when you issue (Settings › Staffing desk)." error={tried && !series ? (options.series.length ? 'Choose the series.' : 'Add an invoice series first (Settings › Staffing desk).') : null}>
          <Select value={series} onChange={setSeries} options={options.series.map((x) => ({ value: x.id, label: x.label }))} placeholder="Choose a series" />
        </FormField>
        <FormField id="ci-po" label="Client PO" optional>
          <TextField value={po} onChange={setPo} maxLength={60} />
        </FormField>
        <Text size="sm" tone="secondary">The client&rsquo;s invoice grouping decides one draft for the month or one per placement. Check each draft, then issue it.</Text>
      </div>
    </Drawer>
  );
}
