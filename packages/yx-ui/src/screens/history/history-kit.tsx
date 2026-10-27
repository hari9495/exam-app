import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { ErrorSummary, FormField, type FormErrorItem, useSaveErrors } from '../../components/field';
import { Card } from '../../components/shell';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { RadioGroup } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { dayKey } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { dateLabel, daysBetweenIso, errorText, useRun } from '../org/org-kit';
import '../people/people.css';
import type { ChangeInput, ChangeOptions, ChangePayload, ChangeStatus, ChangeType, ChoiceOption, Impact, ImpactLine, MoveHandlers, MoveInput, TransferOptions } from './types';

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

/** PPL-04 "What changes": the impact as a Now / From table, then the warnings. */
export function DesignImpact({ impact }: { impact: Impact }) {
  const pay = impact.pay === 'hidden' ? [] : impact.pay;
  const rows = [...impact.facts.map((l) => ({ ...l, money: false })), ...pay.map((l) => ({ ...l, money: true }))];
  const value = (v: string | null, isMoney: boolean) => (isMoney ? moneyLine(v) : (v ?? '—'));
  return (
    <Card title={`What changes (${rows.length})`}>
      <div className="yx-ppl__stack">
        {rows.length === 0 ? (
          <Text as="p" tone="secondary">Nothing changes on that date: the values are already the same.</Text>
        ) : (
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="What changes, scrolls sideways on small screens">
            <table className="yx-ppl__impact">
              <thead>
                <tr>
                  <th scope="col">What changes</th>
                  <th scope="col">Now</th>
                  <th scope="col">From {dateLabel(impact.effectiveDate)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.fact}>
                    <th scope="row">{r.fact}</th>
                    <td>{value(r.from, r.money)}</td>
                    <td data-changed>{value(r.to, r.money)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {impact.pay === 'hidden' && <Text as="p" tone="secondary" size="sm">Pay changes too. Only people with pay access see the amounts.</Text>}
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
    </Card>
  );
}

/* ---------- raising a change (PPL-04) ---------- */

/** PPL-04: a move to another legal entity is a one-person restructure (PPL-09 engine), not a job change. */
const MOVE = 'entity_transfer' as const;
type Raisable = Exclude<ChangeType, 'join'> | typeof MOVE;
const kindLabel = (t: Raisable) => (t === MOVE ? 'Inter-entity transfer' : TYPE_LABEL[t]);
const RAISABLE: Exclude<ChangeType, 'join'>[] = ['promotion', 'transfer', 'redesignation', 'manager_change', 'salary_revision', 'employment_type_change', 'confirmation', 'correction'];
type Field = 'locationId' | 'departmentId' | 'designationId' | 'gradeId' | 'skillClass' | 'employmentTypeId' | 'managerEmployeeId' | 'costCentreId';
/** 5c-D2: the minimum-wage skill class of the job (payroll checks pay against the state table for it). */
export const SKILL_CLASS_LABEL: Record<string, string> = { unskilled: 'Unskilled', semi_skilled: 'Semi-skilled', skilled: 'Skilled', highly_skilled: 'Highly skilled' };
/** PPL-04 design: each type asks only for what it needs (a transfer is the new location; a promotion the new job). */
const FIELDS: Record<Raisable, Field[]> = {
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
const REQUIRED: Partial<Record<Raisable, Field[]>> = { promotion: ['designationId', 'gradeId'], transfer: ['locationId'], entity_transfer: ['locationId'], redesignation: ['designationId'], manager_change: ['managerEmployeeId'] };
const PAY_TYPES = new Set(['promotion', 'salary_revision', 'correction']);
/** G1 (gap pass C1): contracted hours change with the employment type, or by a correction. */
const HOURS_TYPES = new Set(['employment_type_change', 'correction']);
/** Hours a week: above 0, at most 80, in half hours (the API checks the normal week too). */
const hoursOk = (h: string) => /^\d{1,2}(\.5)?$/.test(h) && Number(h) > 0 && Number(h) <= 80;
/** M01 Q5: dotted-line managers move with a manager change (PPL-04 design: not on the transfer form). */
const DOTTED_TYPES = new Set(['manager_change']);
const FIELD_LABEL: Record<Field, string> = {
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
  values: Partial<Record<Field, string | null>>;
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
export function changeInput(d: ChangeDraft, o: Pick<ChangeOptions, 'canPay' | 'retroLimit'>): { input: ChangeInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (!d.employeeId) errors.push({ fieldId: 'ch-person', message: 'Choose the person' });
  if (!d.changeType) errors.push({ fieldId: 'ch-type', message: 'Choose the kind of change' });
  if (!d.effectiveDate) errors.push({ fieldId: 'ch-date', message: 'Choose the date it takes effect' });
  const type = d.changeType;
  const payload: ChangePayload = {};
  if (type && type !== MOVE) {
    const missing = (REQUIRED[type] ?? []).filter((f) => !d.values[f]);
    for (const f of missing) errors.push({ fieldId: `ch-${f}`, message: `Choose the new ${FIELD_LABEL[f].toLowerCase()}` });
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

const forEntity = (list: ChoiceOption[], entity: string | null) => list.filter((x) => !entity || x.entities.length === 0 || x.entities.includes(entity));

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
const EMPTY_CHANGE: ChangeDraft = { employeeId: null, changeType: null, effectiveDate: null, values: {}, dotted: null, payMode: 'amount', pay: '', confirm: false, hours: 'keep', hoursValue: '', reason: '', overrideReason: '', entityId: null, transfer: null };

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

/** PPL-04: pick the type, the date and the new values; what changes shows as you fill it in; send it for approval. */
export function ChangeDrawer({ options, employeeId, initial, onPreview, onSubmit, onRoute, onSaveDraft, move, onClose }: ChangeDrawerProps) {
  const [draft, setDraft] = useState<ChangeDraft>(initial ?? { ...EMPTY_CHANGE, employeeId: employeeId ?? null });
  const [route, setRoute] = useState<string[] | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<ChangeDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const person = options.people.find((p) => p.id === draft.employeeId) ?? null;
  const moving = draft.changeType === MOVE;
  const [defaults, setDefaults] = useState<Awaited<ReturnType<MoveHandlers['onDefaults']>> | null>(null);
  // Required where the person's current one is only for the old entity; optional (it stays) otherwise.
  const needs = moving ? moveNeeds(defaults?.current ?? null, options, draft.entityId ?? null) : [];
  const built = moving ? moveInput(draft, options, person?.legalEntityId ?? null, needs) : changeInput(draft, options);
  const { input, errors } = built;
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  // A move offers the new entity's locations and masters; every other change the person's own entity's.
  const entity = moving ? (draft.entityId ?? null) : (person?.legalEntityId ?? null);
  useEffect(() => {
    if (!moving || !draft.employeeId || !move) return;
    let current = true;
    move.onDefaults(draft.employeeId).then(
      (d) => {
        if (!current) return;
        setDefaults(d);
        setDraft((x) => (x.transfer ? x : { ...x, transfer: d.options }));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, draft.employeeId]);
  const setOption = <K extends keyof TransferOptions>(k: K, v: TransferOptions[K]) => draft.transfer && set({ transfer: { ...draft.transfer, [k]: v } });
  const choices: Record<Field, { value: string; label: string }[]> = useMemo(
    () => ({
      locationId: forEntity(options.locations, entity),
      departmentId: forEntity(options.departments, entity),
      designationId: forEntity(options.designations, entity),
      gradeId: forEntity(options.grades, entity),
      skillClass: Object.entries(SKILL_CLASS_LABEL).map(([value, label]) => ({ value, label })),
      employmentTypeId: forEntity(options.employmentTypes, entity),
      costCentreId: forEntity(options.costCentres, entity),
      managerEmployeeId: (options.managers ?? options.people).filter((p) => p.id !== draft.employeeId).map((p) => ({ value: p.id, label: `${p.name}${p.employeeCode ? ` · ${p.employeeCode}` : ''}` })),
    }),
    [options, entity, draft.employeeId],
  );
  const date = draft.effectiveDate ? dayKey(draft.effectiveDate) : null;
  // What changes follows the form: worked out a moment after the last edit, once the change is complete.
  const key = input ? JSON.stringify(input) : null;
  useEffect(() => {
    setImpact(null);
    setPreviewError(null);
    if (!key) return;
    let current = true;
    const t = setTimeout(() => {
      (moving && move ? move.onPreview(JSON.parse(key) as MoveInput) : onPreview(JSON.parse(key) as ChangeInput)).then(
        (i) => current && setImpact(i),
        (e) => current && setPreviewError(errorText(e)),
      );
    }, 500);
    return () => {
      current = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // The route depends on the person, the date and whether pay is on the change (pay goes only to those who see pay).
  const withPay = Boolean(draft.changeType && options.canPay && PAY_TYPES.has(draft.changeType) && draft.pay.trim());
  useEffect(() => {
    setRoute(null);
    if (!onRoute || !draft.employeeId) return;
    let current = true;
    onRoute(draft.employeeId, date, withPay).then(
      (names) => current && setRoute(names),
      () => undefined,
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.employeeId, date, withPay]);
  const submit = () => {
    if (!input || !impact) return saveErrors.reveal();
    void run('submit', () => (moving && move ? move.onSubmit(input as MoveInput) : onSubmit(input as ChangeInput))).then((ok) => ok && onClose());
  };
  const saveDraft = () => onSaveDraft && void run('draft', () => onSaveDraft(draft)).then((ok) => ok && onClose());
  const types: Raisable[] = [...(options.types ?? RAISABLE).filter((t) => t !== 'salary_revision' || options.canPay), ...(move ? [MOVE] : [])];
  const label = (f: Field) => (draft.changeType === 'correction' ? FIELD_LABEL[f] : `New ${FIELD_LABEL[f].toLowerCase()}`);
  const past = date && date < options.today;
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      dirty={dirty}
      title={person ? `Change for ${person.name}` : 'Change action'}
      subtitle={person ? [person.designation, person.department, person.location].filter(Boolean).join(' · ') : 'Raise a change for one person.'}
      footer={
        <>
          <Button onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
          {onSaveDraft && (
            <Button loading={busy === 'draft'} disabled={busy === 'submit' || !draft.employeeId} onClick={saveDraft}>
              Save draft
            </Button>
          )}
          <Button variant="primary" loading={busy === 'submit'} disabled={busy === 'draft'} onClick={submit}>
            Send for approval
          </Button>
        </>
      }
    >
      <form
        className="yx-ppl__stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <ErrorSummary errors={saveErrors.shownErrors} />
        <Text size="sm" tone="secondary" as="p">
          {routeLine(route) ?? 'Someone who approves job changes decides it before it takes effect. Nobody approves their own.'}
        </Text>
        <div className="yx-ppl__form">
          {!employeeId && (
            <FormField id="ch-person" label="Person" required error={errorOf('ch-person')}>
              <Select value={draft.employeeId} onChange={(v) => set({ employeeId: v, values: {} })} options={options.people.map((p) => ({ value: p.id, label: `${p.name}${p.employeeCode ? ` · ${p.employeeCode}` : ''}` }))} searchable aria-label="Person" />
            </FormField>
          )}
          <FormField id="ch-type" label="Change type" required error={errorOf('ch-type')}>
            <Select value={draft.changeType} onChange={(v) => set({ changeType: v, values: {}, dotted: null, pay: '', confirm: false, hours: 'keep', hoursValue: '', entityId: null, transfer: defaults?.options ?? null })} options={types.map((t) => ({ value: t, label: kindLabel(t) }))} aria-label="Change type" />
          </FormField>
          <FormField
            id="ch-date"
            label="Effective date"
            required
            helper={past ? (draft.changeType === 'correction' ? 'This corrects the record from that date. The earlier record is kept and marked as corrected.' : 'This date is in the past, so payroll settles any difference in the next run.') : 'Applied at the start of that day where the person works.'}
            error={errorOf('ch-date')}
          >
            <DatePicker value={draft.effectiveDate} onChange={(effectiveDate) => set({ effectiveDate })} aria-label="Effective date" />
          </FormField>
          {draft.changeType && errorOf('ch-values') && <InlineAlert tone="danger">{errorOf('ch-values')}</InlineAlert>}
          {moving && (
            <FormField id="ch-entity" label="New legal entity" required error={errorOf('ch-entity')}>
              <Select value={draft.entityId ?? null} onChange={(entityId) => set({ entityId, values: {} })} options={(move?.entities ?? []).filter((x) => x.value !== person?.legalEntityId)} aria-label="New legal entity" />
            </FormField>
          )}
          {draft.changeType &&
            (!moving || draft.entityId) &&
            FIELDS[draft.changeType].map((f) => {
              const required = Boolean(REQUIRED[draft.changeType!]?.includes(f)) || (needs as string[]).includes(f);
              return (
                <FormField key={f} id={`ch-${f}`} label={label(f)} required={required} optional={!required} error={errorOf(`ch-${f}`)}>
                  <Select value={draft.values[f] ?? null} onChange={(v) => set({ values: { ...draft.values, [f]: v } })} options={choices[f]} searchable clearable={!required} placeholder={required ? 'Choose' : 'No change'} aria-label={label(f)} />
                </FormField>
              );
            })}
          {draft.changeType && DOTTED_TYPES.has(draft.changeType) && (
            <FormField label="Dotted-line managers" helper="They see the person and give feedback; they do not approve requests.">
              <Segment label="Dotted-line managers" options={[{ value: 'keep' as const, label: 'No change' }, { value: 'set' as const, label: 'Set new ones' }]} value={draft.dotted === null ? 'keep' : 'set'} onChange={(v) => set({ dotted: v === 'keep' ? null : [] })} />
            </FormField>
          )}
          {draft.changeType && DOTTED_TYPES.has(draft.changeType) && draft.dotted !== null && (
            <FormField id="ch-dotted" label="New dotted-line managers" optional helper="Leave empty to remove them all.">
              <MultiSelect value={draft.dotted} onChange={(dotted) => set({ dotted })} options={choices.managerEmployeeId} searchable aria-label="New dotted-line managers" />
            </FormField>
          )}
          {draft.changeType && HOURS_TYPES.has(draft.changeType) && (
            <FormField label="Hours a week" helper="Full-time follows the normal week where the person works. FTE is worked out from it.">
              <Segment label="Hours a week" options={[{ value: 'keep' as const, label: 'No change' }, { value: 'full' as const, label: 'Full-time' }, { value: 'set' as const, label: 'Part-time' }]} value={draft.hours ?? 'keep'} onChange={(hours) => set({ hours })} />
            </FormField>
          )}
          {draft.changeType && HOURS_TYPES.has(draft.changeType) && draft.hours === 'set' && (
            <FormField id="ch-hours" label="Part-time hours a week" required helper="For example 24 or 37.5." error={errorOf('ch-hours')}>
              <TextField value={draft.hoursValue ?? ''} onChange={(hoursValue) => set({ hoursValue: hoursValue.trim() })} inputMode="decimal" maxLength={4} />
            </FormField>
          )}
          {moving && (
            <Card title="Transfer options">
              <div className="yx-ppl__stack">
                <Text size="sm" tone="secondary" as="p">
                  Company defaults are selected. Change them for this transfer only.
                </Text>
                {draft.transfer ? (
                  <>
                    <FormField label="Leave balance">
                      <RadioGroup value={draft.transfer.leave} onChange={(v) => setOption('leave', v as TransferOptions['leave'])} options={[{ value: 'carry', label: 'Carry over' }, { value: 'lapse', label: 'Lapse' }]} orientation="horizontal" />
                    </FormField>
                    <FormField label="Service continuity (gratuity, seniority, notice)">
                      <RadioGroup value={draft.transfer.service} onChange={(v) => setOption('service', v as TransferOptions['service'])} options={[{ value: 'keep', label: defaults ? `Continue from ${dateLabel(defaults.serviceFrom)}` : 'Continue' }, { value: 'restart', label: 'Restart' }]} orientation="horizontal" />
                    </FormField>
                    <FormField label="Employee code">
                      <RadioGroup value={draft.transfer.code} onChange={(v) => setOption('code', v as TransferOptions['code'])} options={[{ value: 'keep', label: defaults ? `Keep ${defaults.employeeCode}` : 'Keep' }, { value: 'new', label: 'New code in the target series' }]} orientation="horizontal" />
                    </FormField>
                    <FormField label="Salary structure">
                      <RadioGroup value={draft.transfer.salary} onChange={(v) => setOption('salary', v as TransferOptions['salary'])} options={[{ value: 'keep', label: 'Keep' }, { value: 'new', label: 'Assign new' }]} orientation="horizontal" />
                    </FormField>
                  </>
                ) : (
                  <Text size="sm" tone="secondary" as="p">
                    Loading the company defaults…
                  </Text>
                )}
                <Text size="sm" tone="secondary" as="p">
                  There is no settlement at the old entity. HR approves the move in People › Restructure. A continuity checklist opens on it: UAN transfer, ESI IP, Form 12B, declarations, loans, leave and gratuity.
                </Text>
              </div>
            </Card>
          )}
          {draft.changeType === 'confirmation' && (
            <Text as="p" tone="secondary">
              The probation ends and the person is confirmed from this date.
            </Text>
          )}
          {draft.changeType === 'correction' && (
            <FormField label="Employment status">
              <Segment label="Employment status" options={[{ value: 'keep' as const, label: 'No change' }, { value: 'confirmed' as const, label: 'Confirmed' }]} value={draft.confirm ? 'confirmed' : 'keep'} onChange={(v) => set({ confirm: v === 'confirmed' })} />
            </FormField>
          )}
          {draft.changeType && options.canPay && PAY_TYPES.has(draft.changeType) && (
            <>
              <FormField label="Pay given as">
                <Segment label="Pay given as" options={[{ value: 'amount' as const, label: 'New annual CTC' }, { value: 'percent' as const, label: 'Increase %' }]} value={draft.payMode} onChange={(payMode) => set({ payMode, pay: '' })} />
              </FormField>
              <FormField
                id="ch-pay"
                label={draft.payMode === 'amount' ? 'New annual CTC (₹)' : 'Increase (%)'}
                optional={draft.changeType !== 'salary_revision'}
                helper={draft.payMode === 'percent' ? 'Applied to the pay in force on the date, even if that changes later.' : 'The compensation record is created in this same change.'}
                error={errorOf('ch-pay')}
              >
                <TextField value={draft.pay} onChange={(pay) => set({ pay: pay.trim() })} inputMode="decimal" maxLength={16} />
              </FormField>
            </>
          )}
          {draft.changeType && !options.canPay && PAY_TYPES.has(draft.changeType) && draft.changeType !== 'correction' && (
            <InlineAlert tone="info" title="Pay is added before approval">
              You don&apos;t have pay access, so someone who has it adds the new CTC before approval.
            </InlineAlert>
          )}
          <FormField id="ch-reason" label="Reason" required helper="Shown on the person's timeline and to the approver." error={errorOf('ch-reason')}>
            <TextArea value={draft.reason} onChange={(reason) => set({ reason })} rows={2} maxLength={1000} />
          </FormField>
          {date && date < options.retroLimit && (
            <FormField id="ch-override" label="Why go back this far" required helper={`Dates before ${dateLabel(options.retroLimit)} need a System Admin and a reason.`} error={errorOf('ch-override')}>
              <TextArea value={draft.overrideReason} onChange={(overrideReason) => set({ overrideReason })} rows={2} maxLength={1000} />
            </FormField>
          )}
        </div>
        {impact ? (
          <DesignImpact impact={impact} />
        ) : previewError ? (
          <InlineAlert tone="warning" title="We couldn't work out what changes">
            {previewError}
          </InlineAlert>
        ) : (
          <Text as="p" tone="secondary" size="sm">
            Fill in every required field, including the reason, to see what changes.
          </Text>
        )}
        {error && (
          <InlineAlert tone="danger" title="Not sent">
            {error}
          </InlineAlert>
        )}
      </form>
    </Drawer>
  );
}
