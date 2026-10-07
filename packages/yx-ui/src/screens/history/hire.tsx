import { useMemo, useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { ErrorSummary, FieldRow, FormField, FormSection, type FormErrorItem } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { dayKey } from '../../lib/dates';
import { errorText } from '../org/org-kit';
import type { ChangeOptions, ChoiceOption } from './types';

// People › Add person (P01 §4.4 / §4.5a, M01 §3.2, PPL-36): the record, its employment and first assignment,
// written by a join change. An email or phone that already belongs to a person comes back as a possible match
// (YX-ORG-27); HR confirms it is the same person before the record is linked to them.

export interface HireInput {
  givenName: string;
  familyName?: string;
  workEmail?: string;
  mobilePhone?: string;
  personId?: string;
  legalEntityId: string;
  employeeCode?: string;
  joinedOn: string;
  status: 'probation' | 'confirmed';
  assignment: {
    locationId: string;
    departmentId: string;
    designationId: string;
    employmentTypeId: string;
    gradeId: string | null;
    managerEmployeeId: string | null;
    costCentres: { costCentreId: string; percent: string }[];
  };
  compensation?: { currency: string; annualCtc: string };
  reason: string;
  /** P06 YX-HIS-12: why a joining date goes back before the company's retro limit. */
  overrideReason?: string;
}

export interface HireDraft {
  givenName: string;
  familyName: string;
  workEmail: string;
  mobilePhone: string;
  legalEntityId: string | null;
  employeeCode: string;
  joinedOn: Date | null;
  status: 'probation' | 'confirmed';
  locationId: string | null;
  departmentId: string | null;
  designationId: string | null;
  employmentTypeId: string | null;
  gradeId: string | null;
  managerEmployeeId: string | null;
  costCentreId: string | null;
  annualCtc: string;
  reason: string;
  overrideReason: string;
}

export const EMPTY_HIRE: HireDraft = {
  givenName: '',
  familyName: '',
  workEmail: '',
  mobilePhone: '',
  legalEntityId: null,
  employeeCode: '',
  joinedOn: null,
  status: 'probation',
  locationId: null,
  departmentId: null,
  designationId: null,
  employmentTypeId: null,
  gradeId: null,
  managerEmployeeId: null,
  costCentreId: null,
  annualCtc: '',
  reason: '',
  overrideReason: '',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{8,20}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,29}$/;
const AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

/** The request body, or what to fix. Mirrors the API's checks; the API checks again (and the masters' entities). */
export function hireInput(d: HireDraft, canPay: boolean): { input: HireInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  const need = (v: unknown, fieldId: string, message: string) => !v && errors.push({ fieldId, message });
  need(d.givenName.trim(), 'hire-given', 'Enter the first name');
  if (d.workEmail.trim() && !EMAIL.test(d.workEmail.trim())) errors.push({ fieldId: 'hire-email', message: 'Enter an email such as name@company.in' });
  if (d.mobilePhone.trim() && !PHONE.test(d.mobilePhone.trim())) errors.push({ fieldId: 'hire-phone', message: 'Enter a mobile number such as +91 98450 12345' });
  need(d.legalEntityId, 'hire-entity', 'Choose the legal entity');
  if (d.employeeCode && !CODE.test(d.employeeCode)) errors.push({ fieldId: 'hire-code', message: 'Code: up to 30 letters, digits, /, - or _' });
  need(d.joinedOn, 'hire-joined', 'Choose the joining date');
  need(d.locationId, 'hire-location', 'Choose the location');
  need(d.departmentId, 'hire-department', 'Choose the department');
  need(d.designationId, 'hire-designation', 'Choose the designation');
  need(d.employmentTypeId, 'hire-type', 'Choose the employment type');
  need(d.costCentreId, 'hire-cc', 'Choose the cost centre');
  const ctc = d.annualCtc.trim();
  if (canPay && ctc && !AMOUNT.test(ctc)) errors.push({ fieldId: 'hire-ctc', message: 'Enter the annual CTC in rupees' });
  if (d.reason.trim().length < 3) errors.push({ fieldId: 'hire-reason', message: 'Say why, in a few words' });
  const back = d.overrideReason.trim();
  if (back && back.length < 10) errors.push({ fieldId: 'hire-back', message: 'Say why it goes back that far, in at least 10 characters' });
  if (errors.length) return { input: null, errors };
  return {
    input: {
      givenName: d.givenName.trim(),
      ...(d.familyName.trim() ? { familyName: d.familyName.trim() } : {}),
      ...(d.workEmail.trim() ? { workEmail: d.workEmail.trim() } : {}),
      ...(d.mobilePhone.trim() ? { mobilePhone: d.mobilePhone.trim() } : {}),
      legalEntityId: d.legalEntityId!,
      ...(d.employeeCode ? { employeeCode: d.employeeCode } : {}),
      joinedOn: dayKey(d.joinedOn!),
      status: d.status,
      assignment: {
        locationId: d.locationId!,
        departmentId: d.departmentId!,
        designationId: d.designationId!,
        employmentTypeId: d.employmentTypeId!,
        gradeId: d.gradeId,
        managerEmployeeId: d.managerEmployeeId,
        costCentres: [{ costCentreId: d.costCentreId!, percent: '100' }],
      },
      // R1: pay only from someone who may set it.
      ...(canPay && ctc ? { compensation: { currency: 'INR', annualCtc: ctc } } : {}),
      reason: d.reason.trim(),
      ...(back ? { overrideReason: back } : {}),
    },
    errors,
  };
}

const forEntity = (list: ChoiceOption[], entity: string | null) => (entity ? list.filter((x) => x.entities.length === 0 || x.entities.includes(entity)) : []);

/** The API refused because the email or phone already belongs to one person (YX-ORG-27). */
const possibleMatch = (e: unknown): string | null => {
  const err = e as { code?: string; body?: { personIds?: unknown } };
  const ids = err?.code === 'POSSIBLE_SAME_PERSON' ? err.body?.personIds : null;
  return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string' ? ids[0] : null;
};

export interface HireDrawerProps {
  options: ChangeOptions;
  legalEntities: { value: string; label: string }[];
  onSubmit: (input: HireInput) => Promise<{ id: string }>;
  onClose: () => void;
  /** After the record is created, e.g. open it. */
  onCreated?: (id: string) => void;
}

/** Add a person: their details, where they work from the joining date, then save. */
export function HireDrawer({ options, legalEntities, onSubmit, onClose, onCreated }: HireDrawerProps) {
  const [draft, setDraft] = useState<HireDraft>(EMPTY_HIRE);
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [match, setMatch] = useState<string | null>(null);
  const [sameConfirmed, setSameConfirmed] = useState(false);
  const set = (patch: Partial<HireDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    // A different email or phone may no longer match.
    if ('workEmail' in patch || 'mobilePhone' in patch) {
      setMatch(null);
      setSameConfirmed(false);
    }
  };
  const { input, errors } = hireInput(draft, options.canPay);
  const errorOf = (id: string) => (showErrors ? errors.find((e) => e.fieldId === id)?.message : undefined);
  const entity = draft.legalEntityId;
  const choices = useMemo(
    () => ({
      locations: forEntity(options.locations, entity),
      departments: forEntity(options.departments, entity),
      designations: forEntity(options.designations, entity),
      grades: forEntity(options.grades, entity),
      employmentTypes: forEntity(options.employmentTypes, entity),
      costCentres: forEntity(options.costCentres, entity),
      managers: (options.managers ?? options.people).map((p) => ({ value: p.id, label: `${p.name}${p.employeeCode ? ` · ${p.employeeCode}` : ''}` })),
    }),
    [options, entity],
  );
  const save = async () => {
    if (!input) return setShowErrors(true);
    if (match && !sameConfirmed) return;
    setBusy(true);
    setFailed(null);
    try {
      const created = await onSubmit(match ? { ...input, personId: match } : input);
      onClose();
      onCreated?.(created.id);
    } catch (e) {
      const found = possibleMatch(e);
      if (found) setMatch(found);
      else setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const blocked = Boolean(match && !sameConfirmed);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      dirty={dirty}
      title="Add person"
      subtitle="Creates their record with the job they start in. Later changes go through Job changes."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={blocked} onClick={() => void save()}>{match ? 'Link and add' : 'Add person'}</Button>
        </>
      }
    >
      <form className="yx-org__editor" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        {showErrors && errors.length > 0 && <ErrorSummary errors={errors} />}
        <FormSection title="Person">
          <FieldRow>
            <FormField id="hire-given" label="First name" required error={errorOf('hire-given')}>
              <TextField value={draft.givenName} onChange={(givenName) => set({ givenName })} maxLength={100} autoComplete="off" />
            </FormField>
            <FormField id="hire-family" label="Last name" optional>
              <TextField value={draft.familyName} onChange={(familyName) => set({ familyName })} maxLength={100} autoComplete="off" />
            </FormField>
          </FieldRow>
          <FormField id="hire-email" label="Work email" optional helper="Their login is linked to the record only when it uses this email." error={errorOf('hire-email')}>
            <TextField type="email" value={draft.workEmail} onChange={(workEmail) => set({ workEmail })} maxLength={200} autoComplete="off" />
          </FormField>
          <FormField id="hire-phone" label="Mobile" optional error={errorOf('hire-phone')}>
            <TextField type="tel" value={draft.mobilePhone} onChange={(mobilePhone) => set({ mobilePhone })} maxLength={20} inputMode="tel" autoComplete="off" />
          </FormField>
          {match && (
            <InlineAlert tone="warning" title="This email or phone already belongs to someone here">
              It may be the same person (a rehire, a former candidate or contractor). Check before linking: their history stays with them. If it is someone else, change the email or phone.
            </InlineAlert>
          )}
          {match && <Checkbox label="I checked: this is the same person" checked={sameConfirmed} onChange={setSameConfirmed} />}
        </FormSection>
        <FormSection title="Employment">
          <FormField id="hire-entity" label="Legal entity" required error={errorOf('hire-entity')}>
            <Select value={draft.legalEntityId} onChange={(legalEntityId) => set({ legalEntityId, locationId: null, departmentId: null, designationId: null, gradeId: null, employmentTypeId: null, costCentreId: null })} options={legalEntities} aria-label="Legal entity" />
          </FormField>
          <FieldRow>
            <FormField id="hire-joined" label="Joins on" required error={errorOf('hire-joined')}>
              <DatePicker value={draft.joinedOn} onChange={(joinedOn) => set({ joinedOn })} aria-label="Joins on" />
            </FormField>
            <FormField id="hire-code" label="Employee code" optional helper="Left empty, the next free code is used." error={errorOf('hire-code')}>
              <TextField value={draft.employeeCode} onChange={(v) => set({ employeeCode: v.replace(/\s/g, '').slice(0, 30) })} autoComplete="off" spellCheck={false} />
            </FormField>
          </FieldRow>
          <FormField label="Starts">
            <Segment label="Starts" options={[{ value: 'probation' as const, label: 'On probation' }, { value: 'confirmed' as const, label: 'Confirmed' }]} value={draft.status} onChange={(status) => set({ status })} />
          </FormField>
        </FormSection>
        <FormSection title="Job" description={entity ? undefined : 'Choose the legal entity first: it decides what can be picked.'}>
          {(
            [
              ['hire-location', 'Location', 'locationId', choices.locations],
              ['hire-department', 'Department', 'departmentId', choices.departments],
              ['hire-designation', 'Designation', 'designationId', choices.designations],
              ['hire-type', 'Employment type', 'employmentTypeId', choices.employmentTypes],
              ['hire-cc', 'Cost centre', 'costCentreId', choices.costCentres],
            ] as const
          ).map(([fieldId, label, key, list]) => (
            <FormField key={fieldId} id={fieldId} label={label} required error={errorOf(fieldId)}>
              <Select value={draft[key]} onChange={(v) => set({ [key]: v })} options={list} searchable disabled={!entity} aria-label={label} />
            </FormField>
          ))}
          <FormField id="hire-grade" label="Grade" optional>
            <Select value={draft.gradeId} onChange={(gradeId) => set({ gradeId })} options={choices.grades} searchable clearable disabled={!entity} aria-label="Grade" />
          </FormField>
          <FormField id="hire-manager" label="Manager" optional>
            <Select value={draft.managerEmployeeId} onChange={(managerEmployeeId) => set({ managerEmployeeId })} options={choices.managers} searchable clearable aria-label="Manager" />
          </FormField>
          {options.canPay && (
            <FormField id="hire-ctc" label="Annual CTC (₹)" optional helper="Goes to another approver as a pay change from the joining date." error={errorOf('hire-ctc')}>
              <TextField value={draft.annualCtc} onChange={(annualCtc) => set({ annualCtc: annualCtc.trim() })} inputMode="decimal" maxLength={16} />
            </FormField>
          )}
        </FormSection>
        <FormSection title="Why">
          <FormField id="hire-reason" label="Reason" required helper="Shown on their timeline, e.g. the offer or requisition." error={errorOf('hire-reason')}>
            <TextArea value={draft.reason} onChange={(reason) => set({ reason })} rows={2} maxLength={1000} />
          </FormField>
          {draft.joinedOn && dayKey(draft.joinedOn) < dayKey(new Date()) && (
            <FormField id="hire-back" label="Reason for the past date" optional helper="Needed when the joining date is before the company's limit for past-dated changes." error={errorOf('hire-back')}>
              <TextArea value={draft.overrideReason} onChange={(overrideReason) => set({ overrideReason })} rows={2} maxLength={1000} />
            </FormField>
          )}
        </FormSection>
        {failed && <InlineAlert tone="danger" title="Not added">{failed}</InlineAlert>}
      </form>
    </Drawer>
  );
}
