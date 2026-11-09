// Staffing desk slice 1 (HIR-14, HIR-15): the sheets drawn for the live pages: add or change a client, add or change a
// contact, add a rate-card line. Same kit parts as the designed screens; pressed too early, each shows the field's error
// and focuses it (the button is never greyed out); done is a toast.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
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
