import { useMemo, useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { ErrorSummary, FormField, FormSection, type FormErrorItem, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { MultiSelect, Select } from '../../components/select';
import { dayKey } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { dateLabel, daysBetweenIso, useRun } from '../org/org-kit';
import type { ChangeInput, ChangeOptions, ChangePayload, ChangeStatus, ChangeType, ChoiceOption, Impact, ImpactLine } from './types';

// Pieces shared by the job-history screens.

export const TYPE_LABEL: Record<ChangeType, string> = {
  join: 'Joined',
  promotion: 'Promotion',
  transfer: 'Transfer',
  redesignation: 'New designation',
  manager_change: 'Manager change',
  salary_revision: 'Salary revision',
  employment_type_change: 'Employment type change',
  confirmation: 'Confirmation',
  correction: 'Correction',
  notice: 'Notice period',
  notice_withdrawal: 'Resignation withdrawn',
  exit: 'Left',
};

const STATUS: Record<ChangeStatus, { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' }> = {
  pending: { label: 'Waiting for approval', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  effective: { label: 'In effect', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const STATUS_LABEL: Record<string, string> = { probation: 'On probation', confirmed: 'Confirmed', notice: 'Serving notice' };

export function ChangeStatusBadge({ status }: { status: ChangeStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

/** "in 6 days" (amber within a week) or "15 days ago". */
export function WhenBadge({ date, today }: { date: string; today: string }) {
  const days = daysBetweenIso(today, date);
  if (days === 0) return <Badge tone="warning">Today</Badge>;
  if (days > 0) return <Badge tone={days <= 7 ? 'warning' : 'neutral'}>{`in ${days} day${days === 1 ? '' : 's'}`}</Badge>;
  return <Badge tone="neutral">{`${-days} day${days === -1 ? '' : 's'} ago`}</Badge>;
}

export const money = (amount: string, currency: string) => formatMoney(Number(amount), currency);
const moneyLine = (v: string | null) => (v ? v.replace(/^([A-Z]{3}) (\S+)$/, (_, c: string, a: string) => money(a, c)) : '—');

function Lines({ lines, money: isMoney }: { lines: ImpactLine[]; money?: boolean }) {
  return (
    <ul className="yx-hist__lines">
      {lines.map((l) => (
        <li key={l.fact}>
          <Text tone="secondary" size="sm">{l.fact}</Text>
          <Text>
            {isMoney ? moneyLine(l.from) : (l.from ?? '—')} → <strong>{isMoney ? moneyLine(l.to) : (l.to ?? '—')}</strong>
          </Text>
        </li>
      ))}
    </ul>
  );
}

const monthName = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** P06 §4.3 impact preview (YX-HIS-11). */
export function ImpactPanel({ impact }: { impact: Impact }) {
  const nothing = impact.facts.length === 0 && (impact.pay === 'hidden' || impact.pay.length === 0);
  return (
    <div className="yx-hist__impact">
      <Text as="p" weight="semibold">On {dateLabel(impact.effectiveDate)}</Text>
      {nothing ? <Text as="p" tone="secondary">Nothing changes on that date: the values are already the same.</Text> : <Lines lines={impact.facts} />}
      {impact.pay === 'hidden' ? (
        <Text as="p" tone="secondary" size="sm">Pay changes too. Only people with pay access see the amounts.</Text>
      ) : (
        impact.pay.length > 0 && <Lines lines={impact.pay} money />
      )}
      {impact.retro && (
        <InlineAlert tone="warning" title="This changes the past">
          {`Payroll will settle the difference for ${impact.retro.months.map(monthName).join(', ')} in the next run. Payslips already issued stay as they are.`}
        </InlineAlert>
      )}
      {impact.rebased.length > 0 && (
        <InlineAlert tone="warning" title={`${impact.rebased.length} later change${impact.rebased.length === 1 ? '' : 's'} will be recalculated`}>
          <ul className="yx-hist__rebased">
            {impact.rebased.map((r) => (
              <li key={r.changeId}>
                <Text weight="medium">{`${TYPE_LABEL[r.changeType]} on ${dateLabel(r.effectiveDate)}`}</Text>
                <Lines lines={r.facts} />
                {r.pay === 'hidden' ? <Text tone="secondary" size="sm">Its pay is recalculated too.</Text> : r.pay.length > 0 && <Lines lines={r.pay} money />}
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}
    </div>
  );
}

/* ---------- raising a change (PPL-04) ---------- */

const RAISABLE: Exclude<ChangeType, 'join'>[] = ['promotion', 'transfer', 'redesignation', 'manager_change', 'salary_revision', 'employment_type_change', 'confirmation', 'correction'];
type Field = 'locationId' | 'departmentId' | 'designationId' | 'gradeId' | 'employmentTypeId' | 'managerEmployeeId' | 'costCentreId';
const FIELDS: Record<Exclude<ChangeType, 'join'>, Field[]> = {
  promotion: ['designationId', 'gradeId'],
  transfer: ['locationId', 'departmentId', 'managerEmployeeId', 'costCentreId'],
  redesignation: ['designationId'],
  manager_change: ['managerEmployeeId'],
  salary_revision: [],
  employment_type_change: ['employmentTypeId'],
  confirmation: [],
  correction: ['locationId', 'departmentId', 'designationId', 'gradeId', 'employmentTypeId', 'managerEmployeeId'],
  // System changes from the exit flow: shown in history, never raised here.
  notice: [],
  notice_withdrawal: [],
  exit: [],
};
const PAY_TYPES = new Set(['promotion', 'salary_revision', 'correction']);
/** M01 Q5: dotted-line managers move with a manager change or a transfer. */
const DOTTED_TYPES = new Set(['manager_change', 'transfer']);
const FIELD_LABEL: Record<Field, string> = {
  locationId: 'Location',
  departmentId: 'Department',
  designationId: 'Designation',
  gradeId: 'Grade',
  employmentTypeId: 'Employment type',
  managerEmployeeId: 'Manager',
  costCentreId: 'Cost centre',
};

export interface ChangeDraft {
  employeeId: string | null;
  changeType: Exclude<ChangeType, 'join'> | null;
  effectiveDate: Date | null;
  values: Partial<Record<Field, string | null>>;
  /** null: dotted-line managers stay as they are; a list replaces them. */
  dotted: string[] | null;
  payMode: 'amount' | 'percent';
  pay: string;
  confirm: boolean;
  reason: string;
  overrideReason: string;
}

/** The request body, or what to fix. The API checks everything again. */
export function changeInput(d: ChangeDraft, o: Pick<ChangeOptions, 'canPay' | 'retroLimit'>): { input: ChangeInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (!d.employeeId) errors.push({ fieldId: 'ch-person', message: 'Choose the person' });
  if (!d.changeType) errors.push({ fieldId: 'ch-type', message: 'Choose the kind of change' });
  if (!d.effectiveDate) errors.push({ fieldId: 'ch-date', message: 'Choose the date it takes effect' });
  const type = d.changeType;
  const payload: ChangePayload = {};
  if (type) {
    const assignment: NonNullable<ChangePayload['assignment']> = {};
    for (const f of FIELDS[type]) {
      const v = d.values[f];
      if (!v) continue;
      if (f === 'costCentreId') assignment.costCentres = [{ costCentreId: v, percent: '100' }];
      else assignment[f] = v;
    }
    if (d.dotted !== null && DOTTED_TYPES.has(type)) assignment.dottedLineManagerIds = d.dotted;
    if (Object.keys(assignment).length) payload.assignment = assignment;
    if (type === 'confirmation' || (type === 'correction' && d.confirm)) payload.status = 'confirmed';
    const pay = d.pay.trim();
    if (pay && o.canPay && PAY_TYPES.has(type)) {
      const pattern = d.payMode === 'amount' ? /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/ : /^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/;
      if (!pattern.test(pay)) errors.push({ fieldId: 'ch-pay', message: d.payMode === 'amount' ? 'Enter the annual CTC in rupees' : 'Enter the increase in percent, e.g. 8 or 7.5' });
      else payload.compensation = d.payMode === 'amount' ? { annualCtc: pay } : { increasePercent: pay };
    }
    if (type === 'salary_revision' && !payload.compensation && !errors.some((e) => e.fieldId === 'ch-pay')) errors.push({ fieldId: 'ch-pay', message: 'Enter the new pay' });
    if (!payload.assignment && !payload.status && !payload.compensation && type !== 'salary_revision') errors.push({ fieldId: 'ch-values', message: 'Choose at least one new value' });
  }
  if (d.reason.trim().length < 3) errors.push({ fieldId: 'ch-reason', message: 'Say why, in a few words' });
  const date = d.effectiveDate ? dayKey(d.effectiveDate) : null;
  const beforeLimit = Boolean(date && date < o.retroLimit);
  if (beforeLimit && d.overrideReason.trim().length < 10) errors.push({ fieldId: 'ch-override', message: 'Explain why this goes back before the limit (10 characters or more)' });
  if (errors.length) return { input: null, errors };
  return {
    input: { employeeId: d.employeeId!, changeType: type!, effectiveDate: date!, payload, reason: d.reason.trim(), ...(beforeLimit ? { overrideReason: d.overrideReason.trim() } : {}) },
    errors,
  };
}

const forEntity = (list: ChoiceOption[], entity: string | null) => list.filter((x) => !entity || x.entities.length === 0 || x.entities.includes(entity));

export interface ChangeDrawerProps {
  options: ChangeOptions;
  /** Fixed when opened from a person's record. */
  employeeId?: string;
  onPreview: (input: ChangeInput) => Promise<Impact>;
  onSubmit: (input: ChangeInput) => Promise<void>;
  onClose: () => void;
}

/** Pick the kind of change, the date and the new values; preview the impact; send it for approval. */
export function ChangeDrawer({ options, employeeId, onPreview, onSubmit, onClose }: ChangeDrawerProps) {
  const [draft, setDraft] = useState<ChangeDraft>({ employeeId: employeeId ?? null, changeType: null, effectiveDate: null, values: {}, dotted: null, payMode: 'amount', pay: '', confirm: false, reason: '', overrideReason: '' });
  const [impact, setImpact] = useState<Impact | null>(null);
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<ChangeDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setImpact(null);
    setDirty(true);
  };
  const { input, errors } = changeInput(draft, options);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const person = options.people.find((p) => p.id === draft.employeeId) ?? null;
  const entity = person?.legalEntityId ?? null;
  const choices: Record<Field, { value: string; label: string }[]> = useMemo(
    () => ({
      locationId: forEntity(options.locations, entity),
      departmentId: forEntity(options.departments, entity),
      designationId: forEntity(options.designations, entity),
      gradeId: forEntity(options.grades, entity),
      employmentTypeId: forEntity(options.employmentTypes, entity),
      costCentreId: forEntity(options.costCentres, entity),
      managerEmployeeId: (options.managers ?? options.people).filter((p) => p.id !== draft.employeeId).map((p) => ({ value: p.id, label: `${p.name}${p.employeeCode ? ` · ${p.employeeCode}` : ''}` })),
    }),
    [options, entity, draft.employeeId],
  );
  const date = draft.effectiveDate ? dayKey(draft.effectiveDate) : null;
  const preview = () => {
    if (!input) return saveErrors.reveal();
    void run('preview', async () => setImpact(await onPreview(input)));
  };
  const submit = () => {
    if (!input || !impact) return saveErrors.reveal();
    void run('submit', () => onSubmit(input)).then((ok) => ok && onClose());
  };
  const types = (options.types ?? RAISABLE).filter((t) => t !== 'salary_revision' || options.canPay);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      dirty={dirty}
      title={person ? `Change for ${person.name}` : 'New job change'}
      subtitle="Someone else approves it before it takes effect."
      footer={
        <>
          <Button onClick={onClose} disabled={busy !== null}>Cancel</Button>
          <Button loading={busy === 'preview'} onClick={preview}>Preview impact</Button>
          <Button variant="primary" loading={busy === 'submit'} disabled={!impact} onClick={submit}>Send for approval</Button>
        </>
      }
    >
      <form className="yx-org__editor" onSubmit={(e) => { e.preventDefault(); preview(); }} noValidate>
        <ErrorSummary errors={saveErrors.shownErrors} />
        <FormSection title="The change">
          {!employeeId && (
            <FormField id="ch-person" label="Person" required error={errorOf('ch-person')}>
              <Select value={draft.employeeId} onChange={(v) => set({ employeeId: v, values: {} })} options={options.people.map((p) => ({ value: p.id, label: `${p.name}${p.employeeCode ? ` · ${p.employeeCode}` : ''}` }))} searchable aria-label="Person" />
            </FormField>
          )}
          <FormField id="ch-type" label="Kind of change" required error={errorOf('ch-type')}>
            <Select value={draft.changeType} onChange={(v) => set({ changeType: v, values: {}, dotted: null, pay: '', confirm: false })} options={types.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} aria-label="Kind of change" />
          </FormField>
          <FormField id="ch-date" label="Takes effect on" required helper="The day starts at midnight where the person works." error={errorOf('ch-date')}>
            <DatePicker value={draft.effectiveDate} onChange={(effectiveDate) => set({ effectiveDate })} aria-label="Takes effect on" />
          </FormField>
          {date && date < options.today && (
            <InlineAlert tone="warning">{draft.changeType === 'correction' ? 'This corrects the record from that date. The earlier record is kept and marked as corrected.' : 'This date is in the past. Payroll settles any difference in the next run.'}</InlineAlert>
          )}
        </FormSection>
        {draft.changeType && (
          <FormSection title="New values">
            {errorOf('ch-values') && <InlineAlert tone="danger">{errorOf('ch-values')}</InlineAlert>}
            {FIELDS[draft.changeType].map((f) => (
              <FormField key={f} id={`ch-${f}`} label={FIELD_LABEL[f]} optional={draft.changeType === 'correction' || draft.changeType === 'transfer' || f === 'gradeId'}>
                <Select value={draft.values[f] ?? null} onChange={(v) => set({ values: { ...draft.values, [f]: v } })} options={choices[f]} searchable clearable placeholder="No change" aria-label={FIELD_LABEL[f]} />
              </FormField>
            ))}
            {DOTTED_TYPES.has(draft.changeType) && (
              <FormField label="Dotted-line managers" helper="They see the person and give feedback; they do not approve requests.">
                <Segment label="Dotted-line managers" options={[{ value: 'keep' as const, label: 'No change' }, { value: 'set' as const, label: 'Set new ones' }]} value={draft.dotted === null ? 'keep' : 'set'} onChange={(v) => set({ dotted: v === 'keep' ? null : [] })} />
              </FormField>
            )}
            {DOTTED_TYPES.has(draft.changeType) && draft.dotted !== null && (
              <FormField id="ch-dotted" label="New dotted-line managers" optional helper="Leave empty to remove them all.">
                <MultiSelect value={draft.dotted} onChange={(dotted) => set({ dotted })} options={choices.managerEmployeeId} searchable aria-label="New dotted-line managers" />
              </FormField>
            )}
            {draft.changeType === 'confirmation' && <Text as="p" tone="secondary">The probation ends and the person is confirmed from this date.</Text>}
            {draft.changeType === 'correction' && (
              <FormField label="Employment status">
                <Segment label="Employment status" options={[{ value: 'keep' as const, label: 'No change' }, { value: 'confirmed' as const, label: 'Confirmed' }]} value={draft.confirm ? 'confirmed' : 'keep'} onChange={(v) => set({ confirm: v === 'confirmed' })} />
              </FormField>
            )}
            {options.canPay && PAY_TYPES.has(draft.changeType) && (
              <>
                <FormField label="Pay given as">
                  <Segment label="Pay given as" options={[{ value: 'amount' as const, label: 'New annual CTC' }, { value: 'percent' as const, label: 'Increase %' }]} value={draft.payMode} onChange={(payMode) => set({ payMode, pay: '' })} />
                </FormField>
                <FormField id="ch-pay" label={draft.payMode === 'amount' ? 'Annual CTC (₹)' : 'Increase (%)'} optional={draft.changeType !== 'salary_revision'} helper={draft.payMode === 'percent' ? 'Applied to the pay in force on the date, even if that changes later.' : undefined} error={errorOf('ch-pay')}>
                  <TextField value={draft.pay} onChange={(pay) => set({ pay: pay.trim() })} inputMode="decimal" maxLength={16} />
                </FormField>
              </>
            )}
          </FormSection>
        )}
        <FormSection title="Why">
          <FormField id="ch-reason" label="Reason" required helper="Shown on the person's timeline and to the approver." error={errorOf('ch-reason')}>
            <TextArea value={draft.reason} onChange={(reason) => set({ reason })} rows={2} maxLength={1000} />
          </FormField>
          {date && date < options.retroLimit && (
            <FormField id="ch-override" label="Why go back this far" required helper={`Dates before ${dateLabel(options.retroLimit)} need a System Admin and a reason.`} error={errorOf('ch-override')}>
              <TextArea value={draft.overrideReason} onChange={(overrideReason) => set({ overrideReason })} rows={2} maxLength={1000} />
            </FormField>
          )}
        </FormSection>
        {impact ? <ImpactPanel impact={impact} /> : <Text as="p" tone="secondary" size="sm">Preview the impact to send it for approval.</Text>}
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
      </form>
    </Drawer>
  );
}
