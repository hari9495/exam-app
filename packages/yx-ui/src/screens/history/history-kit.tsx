import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { type FormErrorItem } from '../../components/field';
import { Text } from '../../components/foundations';
import { dayKey } from '../../lib/dates';
import { formatDate, formatMoney } from '../../lib/format';
import { dateLabel, daysBetweenIso } from '../org/org-kit';
import '../people/people.css';
import type { ChangeInput, ChangeOptions, ChangePayload, ChangeStatus, ChangeType, ChoiceOption, Impact, ImpactLine, MoveHandlers, MoveInput, PromotionRule, TransferOptions } from './types';

// Pieces shared by the job-history screens.

export const TYPE_LABEL: Record<ChangeType, string> = {
  join: 'Joined',
  promotion: 'Promotion',
  transfer: 'Transfer',
  redesignation: 'New designation',
  manager_change: 'Manager change',
  salary_revision: 'Salary revision',
  employment_type_change: 'Employment type or hours',
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
export const moneyLine = (v: string | null) => (v ? v.replace(/^([A-Z]{3}) (\S+)$/, (_, c: string, a: string) => money(a, c)) : '—');

export function Lines({ lines, money: isMoney }: { lines: ImpactLine[]; money?: boolean }) {
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

export const monthName = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return formatDate(new Date(y, m - 1, 1)).replace(/^\d+ /, '');
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
      {impact.warnings?.map((w) => (
        <InlineAlert key={w} tone="warning" title="Check before you approve">
          {w}
        </InlineAlert>
      ))}
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

/** PPL-04: a move to another legal entity is a one-person restructure (PPL-09 engine), not a job change. */
export const MOVE = 'entity_transfer' as const;
export type Raisable = Exclude<ChangeType, 'join'> | typeof MOVE;
export const kindLabel = (t: Raisable) => (t === MOVE ? 'Inter-entity transfer' : TYPE_LABEL[t]);
export const RAISABLE: Exclude<ChangeType, 'join'>[] = ['promotion', 'transfer', 'redesignation', 'manager_change', 'salary_revision', 'employment_type_change', 'confirmation', 'correction'];
export type ChangeField = 'locationId' | 'departmentId' | 'designationId' | 'gradeId' | 'skillClass' | 'employmentTypeId' | 'managerEmployeeId' | 'costCentreId';
/** 5c-D2: the minimum-wage skill class of the job (payroll checks pay against the state table for it). */
export const SKILL_CLASS_LABEL: Record<string, string> = { unskilled: 'Unskilled', semi_skilled: 'Semi-skilled', skilled: 'Skilled', highly_skilled: 'Highly skilled' };
/** PPL-04 design: each type asks only for what it needs (a transfer is the new location; a promotion the new job). */
export const FIELDS: Record<Raisable, ChangeField[]> = {
  promotion: ['designationId', 'gradeId'],
  transfer: ['locationId'],
  // The department and designation stay unless a new one is chosen (the engine checks the new entity may use them).
  entity_transfer: ['locationId', 'departmentId', 'designationId', 'employmentTypeId'],
  redesignation: ['designationId', 'skillClass'],
  manager_change: ['managerEmployeeId'],
  salary_revision: [],
  employment_type_change: ['employmentTypeId'],
  confirmation: [],
  correction: ['locationId', 'departmentId', 'designationId', 'gradeId', 'skillClass', 'employmentTypeId', 'managerEmployeeId'],
  // System changes from the exit flow: shown in history, never raised here.
  notice: [],
  notice_withdrawal: [],
  exit: [],
};
/** The fields a type cannot be sent without (the API refuses a transfer without a new location, a promotion without a new job). */
const REQUIRED: Partial<Record<Raisable, ChangeField[]>> = { transfer: ['locationId'], entity_transfer: ['locationId'], redesignation: ['designationId'], manager_change: ['managerEmployeeId'] };
/** A promotion's required fields follow the company's rule; 'either' needs one of the two (checked in changeInput). */
const PROMOTION_REQUIRED: Record<PromotionRule, ChangeField[]> = { either: [], both: ['designationId', 'gradeId'], grade: ['gradeId'], designation: ['designationId'] };
export const requiredFor = (type: Raisable, rule: PromotionRule): ChangeField[] => (type === 'promotion' ? PROMOTION_REQUIRED[rule] : (REQUIRED[type] ?? []));
export const PAY_TYPES = new Set(['promotion', 'salary_revision', 'correction']);
/** G1 (gap pass C1): contracted hours change with the employment type, or by a correction. */
export const HOURS_TYPES = new Set(['employment_type_change', 'correction']);
/** Hours a week: above 0, at most 80, in half hours (the API checks the normal week too). */
const hoursOk = (h: string) => /^\d{1,2}(\.5)?$/.test(h) && Number(h) > 0 && Number(h) <= 80;
/** M01 Q5: dotted-line managers move with a manager change (PPL-04 design: not on the transfer form). */
export const DOTTED_TYPES = new Set(['manager_change']);
export const FIELD_LABEL: Record<ChangeField, string> = {
  locationId: 'Location',
  departmentId: 'Department',
  designationId: 'Designation',
  gradeId: 'Grade',
  skillClass: 'Skill class',
  employmentTypeId: 'Employment type',
  managerEmployeeId: 'Manager',
  costCentreId: 'Cost centre',
};

export interface ChangeDraft {
  employeeId: string | null;
  changeType: Raisable | null;
  effectiveDate: Date | null;
  values: Partial<Record<ChangeField, string | null>>;
  /** null: dotted-line managers stay as they are; a list replaces them. */
  dotted: string[] | null;
  payMode: 'amount' | 'percent';
  pay: string;
  confirm: boolean;
  /** G1: hours a week: no change, back to full-time, or part-time hours. */
  hours?: 'keep' | 'full' | 'set';
  hoursValue?: string;
  reason: string;
  overrideReason: string;
  /** PPL-04 inter-entity transfer: the new legal entity and the options for this move. */
  entityId?: string | null;
  transfer?: TransferOptions | null;
}

type MoveFact = 'departmentId' | 'designationId' | 'employmentTypeId';
/** PPL-04: the job facts a move must choose anew, because the person's current one is not open to the new entity. */
export function moveNeeds(current: Partial<Record<MoveFact, string | null>> | null, o: Pick<ChangeOptions, 'departments' | 'designations' | 'employmentTypes'>, entityId: string | null): MoveFact[] {
  if (!current || !entityId) return [];
  const lists: Record<MoveFact, ChoiceOption[]> = { departmentId: o.departments, designationId: o.designations, employmentTypeId: o.employmentTypes };
  return (Object.keys(lists) as MoveFact[]).filter((f) => {
    const now = lists[f].find((x) => x.value === current[f]);
    return Boolean(current[f]) && (!now || !forEntity([now], entityId).length);
  });
}

/** PPL-04: the one-person move, or what to fix. The restructure engine checks everything again. */
export function moveInput(d: ChangeDraft, o: Pick<ChangeOptions, 'retroLimit'>, fromEntityId: string | null, needs: readonly MoveFact[] = []): { input: MoveInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (!d.employeeId) errors.push({ fieldId: 'ch-person', message: 'Choose the person' });
  if (!d.effectiveDate) errors.push({ fieldId: 'ch-date', message: 'Choose the date it takes effect' });
  if (!d.entityId) errors.push({ fieldId: 'ch-entity', message: 'Choose the new legal entity' });
  if (!d.values.locationId) errors.push({ fieldId: 'ch-locationId', message: 'Choose the new location' });
  for (const f of needs) if (!d.values[f]) errors.push({ fieldId: `ch-${f}`, message: `Choose the new ${FIELD_LABEL[f].toLowerCase()}` });
  if (d.reason.trim().length < 3) errors.push({ fieldId: 'ch-reason', message: 'Enter the reason for this change' });
  const date = d.effectiveDate ? dayKey(d.effectiveDate) : null;
  const beforeLimit = Boolean(date && date < o.retroLimit);
  if (beforeLimit && d.overrideReason.trim().length < 10) errors.push({ fieldId: 'ch-override', message: 'Explain why this goes back before the limit (10 characters or more)' });
  if (errors.length || !d.transfer || !fromEntityId) return { input: null, errors };
  const { departmentId, designationId, employmentTypeId } = d.values;
  return {
    input: { employeeId: d.employeeId!, fromEntityId, intoEntityId: d.entityId!, effectiveDate: date!, locationId: d.values.locationId!, ...(departmentId ? { departmentId } : {}), ...(designationId ? { designationId } : {}), ...(employmentTypeId ? { employmentTypeId } : {}), options: d.transfer, reason: d.reason.trim(), ...(beforeLimit ? { overrideReason: d.overrideReason.trim() } : {}) },
    errors,
  };
}

/** The request body, or what to fix. The API checks everything again. */
export function changeInput(d: ChangeDraft, o: Pick<ChangeOptions, 'canPay' | 'retroLimit'>, rule: PromotionRule = 'either'): { input: ChangeInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (!d.employeeId) errors.push({ fieldId: 'ch-person', message: 'Choose the person' });
  if (!d.changeType) errors.push({ fieldId: 'ch-type', message: 'Choose the kind of change' });
  if (!d.effectiveDate) errors.push({ fieldId: 'ch-date', message: 'Choose the date it takes effect' });
  const type = d.changeType;
  const payload: ChangePayload = {};
  if (type && type !== MOVE) {
    const missing = requiredFor(type, rule).filter((f) => !d.values[f]);
    for (const f of missing) errors.push({ fieldId: `ch-${f}`, message: `Choose the new ${FIELD_LABEL[f].toLowerCase()}` });
    if (type === 'promotion' && rule === 'either' && !d.values.designationId && !d.values.gradeId) missing.push('designationId'), errors.push({ fieldId: 'ch-designationId', message: 'Choose the new designation or grade' });
    const assignment: NonNullable<ChangePayload['assignment']> = {};
    for (const f of FIELDS[type]) {
      const v = d.values[f];
      if (!v) continue;
      if (f === 'costCentreId') assignment.costCentres = [{ costCentreId: v, percent: '100' }];
      else assignment[f] = v;
    }
    if (d.dotted !== null && DOTTED_TYPES.has(type)) assignment.dottedLineManagerIds = d.dotted;
    if (HOURS_TYPES.has(type) && d.hours === 'full') assignment.hoursPerWeek = null;
    if (HOURS_TYPES.has(type) && d.hours === 'set') {
      const h = (d.hoursValue ?? '').trim();
      if (!hoursOk(h)) errors.push({ fieldId: 'ch-hours', message: 'Enter the hours a week, e.g. 24 or 37.5 (at most 80)' });
      else assignment.hoursPerWeek = h;
    }
    if (Object.keys(assignment).length) payload.assignment = assignment;
    if (type === 'confirmation' || (type === 'correction' && d.confirm)) payload.status = 'confirmed';
    const pay = d.pay.trim();
    if (pay && o.canPay && PAY_TYPES.has(type)) {
      const pattern = d.payMode === 'amount' ? /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/ : /^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/;
      if (!pattern.test(pay)) errors.push({ fieldId: 'ch-pay', message: d.payMode === 'amount' ? 'Enter the annual CTC in rupees' : 'Enter the increase in percent, e.g. 8 or 7.5' });
      else payload.compensation = d.payMode === 'amount' ? { annualCtc: pay } : { increasePercent: pay };
    }
    if (type === 'salary_revision' && !payload.compensation && !errors.some((e) => e.fieldId === 'ch-pay')) errors.push({ fieldId: 'ch-pay', message: 'Enter the new pay' });
    if (!payload.assignment && !payload.status && !payload.compensation && type !== 'salary_revision' && !missing.length && !errors.some((e) => e.fieldId === 'ch-hours')) errors.push({ fieldId: 'ch-values', message: 'Choose at least one new value' });
  }
  if (d.reason.trim().length < 3) errors.push({ fieldId: 'ch-reason', message: 'Enter the reason for this change' });
  const date = d.effectiveDate ? dayKey(d.effectiveDate) : null;
  const beforeLimit = Boolean(date && date < o.retroLimit);
  if (beforeLimit && d.overrideReason.trim().length < 10) errors.push({ fieldId: 'ch-override', message: 'Explain why this goes back before the limit (10 characters or more)' });
  if (errors.length) return { input: null, errors };
  return {
    input: { employeeId: d.employeeId!, changeType: type as Exclude<ChangeType, 'join'>, effectiveDate: date!, payload, reason: d.reason.trim(), ...(beforeLimit ? { overrideReason: d.overrideReason.trim() } : {}) },
    errors,
  };
}

export const forEntity = (list: ChoiceOption[], entity: string | null) => list.filter((x) => !entity || x.entities.length === 0 || x.entities.includes(entity));

/** "A", "A or B", "A, B or C", "A, B, C or 2 others". */
export function orList(names: string[]): string {
  const shown = names.length > 4 ? [...names.slice(0, 3), `${names.length - 3} others`] : names;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} or ${shown[shown.length - 1]}` : (shown[0] ?? '');
}

/** PPL-04: the route line at the top of the change form ("Goes to Priya Nair."), or null when it cannot be told. */
export const routeLine = (approvers: string[] | null) => (approvers?.length ? `Goes to ${orList(approvers)}.` : null);

/** PPL-04 "Save draft": the form as stored (dates as yyyy-mm-dd), and back. */
export const draftForm = (d: ChangeDraft) => ({ ...d, effectiveDate: d.effectiveDate ? dayKey(d.effectiveDate) : null });
export function draftFromForm(form: Record<string, unknown>): ChangeDraft {
  const f = form as Partial<Omit<ChangeDraft, 'effectiveDate'>> & { effectiveDate?: string | null };
  const ymd = typeof f.effectiveDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.effectiveDate) ? f.effectiveDate.split('-').map(Number) : null;
  return { ...EMPTY_CHANGE, ...f, values: { ...(f.values ?? {}) }, effectiveDate: ymd ? new Date(ymd[0], ymd[1] - 1, ymd[2]) : null } as ChangeDraft;
}
export const EMPTY_CHANGE: ChangeDraft = { employeeId: null, changeType: null, effectiveDate: null, values: {}, dotted: null, payMode: 'amount', pay: '', confirm: false, hours: 'keep', hoursValue: '', reason: '', overrideReason: '', entityId: null, transfer: null };

export interface ChangeDrawerProps {
  options: ChangeOptions;
  /** Fixed when opened from a person's record. */
  employeeId?: string;
  /** A saved draft to carry on with. */
  initial?: ChangeDraft;
  onPreview: (input: ChangeInput) => Promise<Impact>;
  onSubmit: (input: ChangeInput) => Promise<void>;
  /** Who will decide it (names), for the route line; recomputed when the person, date or pay changes. */
  onRoute?: (employeeId: string, effectiveDate: string | null, pay: boolean) => Promise<string[]>;
  /** "Save draft": keep the half-filled change for later. */
  onSaveDraft?: (draft: ChangeDraft) => Promise<void>;
  /** PPL-04 inter-entity transfer (HR only; without it the type is not offered). */
  move?: MoveHandlers;
  onClose: () => void;
}
