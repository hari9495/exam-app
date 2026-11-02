import { Fragment, useState } from 'react';
import { Checkbox } from '../../components/choice';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { TextArea } from '../../components/inputs';
import { FormField, FormSection, type FormErrorItem, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { MenuItem } from '../../components/menu';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { useToast } from '../../components/notify';
import { Card } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { PlainTable } from '../../components/plain-table';
import { formatDate } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import { EditorDrawer, OrgPage, dateLabel, useConfirm, useRun } from './org-kit';
import type { ErasureCounts, ErasurePerson, ErasureReport, LoadState, SettingDef, SettingInput, SettingOverride, SettingScope, SettingScopeChoices } from './types';

// Settings › company rules (P01 §4.6): every registered key with the value in force, where it comes from
// (YX-ORG-12), and the overrides per entity, location, department, employment type or grade, most specific
// winning (YX-ORG-18). Dated values in force stay; a change is a new value from a later date (YX-HIS-07).

export const SCOPE_LABEL: Record<SettingScope, string> = {
  tenant: 'Whole company',
  legal_entity: 'Legal entity',
  location: 'Location',
  department: 'Department',
  employment_type: 'Employment type',
  grade: 'Grade',
  designation: 'Designation',
  employee: 'Person',
  pay_group: 'Pay group',
};

/** Broadest first, as the table lists them. */
const SCOPES = Object.keys(SCOPE_LABEL) as SettingScope[];

/** Loan interest values (stored as numbers) as "% a year". */
function rates(): Record<string, string> {
  return Object.fromEntries(['4', '5', '6', '7', '7.5', '8', '8.5', '9', '10', '12'].map((v) => [v, `${v}% a year`]));
}

/** Year counts as words ("1 year", "3 years"). */
function years(values: string[]): Record<string, string> {
  return Object.fromEntries(values.map((v) => [v, v === '1' ? '1 year' : `${v} years`]));
}

/** Words for the stored values; anything unlisted shows as stored (numbers). */
const VALUE_LABEL: Record<string, Record<string, string>> = {
  'employee_change.retro_limit': { current_fy: 'Start of this financial year', previous_fy: 'Start of last financial year' },
  'probation.auto_confirm_after_days': { off: 'Never (HR confirms)', '0': 'On the end date', '7': '7 days after', '15': '15 days after', '30': '30 days after' },
  'access.manager.view_scope': { all_reports: 'Everyone under them', direct_reports: 'Direct reports only' },
  'privacy.who_accessed': { on: 'Shown', off: 'Hidden' },
  'employee.profile_change.proof': { required: 'Required', optional: 'Optional' },
  'home.pay_on_employee_home': { off: 'Not shown', on: 'Shown, hidden until the employee asks' },
  'attendance.mode': { punch: 'Punch in and out', assumed_present: 'Present unless on leave', timesheet: 'Timesheet' },
  'attendance.missing_punch_effect': { block_payroll_approval: 'Hold payroll approval', warning_only: 'Warn only' },
  'attendance.factories_act': { covered: 'Covered: overtime is paid', not_covered: 'Not covered' },
  'work.normal_week_hours': { pack: 'From the country pack' },
  'privacy.retention.internal_years': years(['3', '5', '8', '10']),
  'privacy.retention.personal_years': years(['1', '3', '5', '8']),
  'privacy.retention.special_years': { '0': 'Delete when they leave', ...years(['1', '3']) },
  'privacy.erasure.enabled': { off: 'Off: nothing is deleted', on: 'On: deleted every night' },
  'contract.max_years': { '1': '1 year', '2': '2 years', '3': '3 years', '4': '4 years', '5': '5 years', none: 'No limit' },
  'contract_end.action': { alert: 'Remind HR to extend, convert or exit', auto_exit: 'Start the exit by itself a week before the end' },
  'joining.reporting_time': { '08:00': '8:00 am', '08:30': '8:30 am', '09:00': '9:00 am', '09:30': '9:30 am', '10:00': '10:00 am', '10:30': '10:30 am', '11:00': '11:00 am' },
  'pay.band.above_max': { warn: 'Warn only', cap: 'Cap at the maximum', block: 'Block' },
  'promotion.must_change': { either: 'Designation or grade', both: 'Both', grade: 'Grade only', designation: 'Designation only' },
  'bfsi.declaration_due': { '04-30': '30 April', '06-30': '30 June', '09-30': '30 September', '10-15': '15 October', '12-31': '31 December' },
  'bfsi.preclearance_threshold': { '500000': '₹5,00,000', '1000000': '₹10,00,000', '2500000': '₹25,00,000' },
  'work_auth.reminder_days': { '90,60,30': '90, 60 and 30 days before', '60,30': '60 and 30 days before', '30': '30 days before', off: 'No reminders' },
  'transfer.leave': { carry: 'Carry over', lapse: 'Lapse' },
  'transfer.service': { keep: 'Continue from original joining date', restart: 'Restart' },
  'transfer.code': { keep: 'Keep', new: 'New in target series' },
  'transfer.salary': { keep: 'Keep', new: 'Assign new' },
  'pay_access.scope': { team: 'Their whole team', person: 'Only the person asked about' },
  'pay_access.days': { '7': '7 days', '15': '15 days', '30': '30 days', '60': '60 days', '90': '90 days' },
  'employee.personal.required': { dateOfBirth: 'Date of birth', gender: 'Gender', maritalStatus: 'Marital status', personalEmail: 'Personal email', personalPhone: 'Personal phone', addressLine1: 'Address', addressLine2: 'Address line 2', city: 'City', stateCode: 'State', postalCode: 'PIN code' },
  'people.language': { en: 'English', hi: 'हिन्दी (Hindi)', ta: 'தமிழ் (Tamil)', te: 'తెలుగు (Telugu)' },
  // Settings › Payroll & Statutory › Payroll rules.
  'payroll.bonus.eligibility_rate_on': { last_day: "Rate on the month's last day", first_day: "Rate on the month's first day", highest_in_month: 'Highest rate in the month' },
  'payroll.bonus.year_start_month': { '1': 'January', '2': 'February', '3': 'March', '4': 'April', '5': 'May', '6': 'June', '7': 'July', '8': 'August', '9': 'September', '10': 'October', '11': 'November', '12': 'December' },
  'payroll.bonus.eligibility_wage': { '21000': '₹21,000', '25000': '₹25,000', '30000': '₹30,000', '35000': '₹35,000', '40000': '₹40,000', '50000': '₹50,000' },
  'payroll.bonus.calculation_ceiling': { '7000': '₹7,000', '10000': '₹10,000', '15000': '₹15,000', '21000': '₹21,000' },
  'payroll.bonus.min_rate': { '8.33': '8.33%', '10': '10%', '12': '12%', '15': '15%', '20': '20%' },
  'payroll.bonus.max_rate': { '8.33': '8.33%', '10': '10%', '12': '12%', '15': '15%', '20': '20%' },
  'payroll.bonus.min_working_days': { '1': '1 day', '15': '15 days', '30': '30 days' },
  'payroll.bonus.min_amount': { '100': '₹100', '500': '₹500', '1000': '₹1,000' },
  'payroll.bonus.allocable_percent': { '60': '60%', '67': '67% (some companies, section 2(4))' },
  'payroll.bonus.carry_years': { '4': '4 years' },
  'payroll.bonus.due_months': Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), `${i + 1} ${i ? 'months' : 'month'}`])),
  'payroll.reports_access.days': { '7': '7 days', '30': '30 days', '60': '60 days', '90': '90 days', '180': '180 days', '365': '365 days' },
  'payroll.loan.max_gross_months': { none: 'No limit', '1': '1 month', '2': '2 months', '3': '3 months', '4': '4 months', '6': '6 months', '12': '12 months' },
  'payroll.loan.after_probation': { confirmed: 'Confirmed employees only (after probation)', everyone: 'Everyone, during probation too' },
  'payroll.loan.interest_rate.advance': { '0': 'Interest-free', ...rates() },
  'payroll.loan.interest_rate.loan': { '0': 'Interest-free', ...rates() },
};
export const valueLabel = (key: string, value: unknown) => {
  const v = String(value);
  if (VALUE_LABEL[key]?.[v]) return VALUE_LABEL[key][v];
  // A text setting (one thing a line) reads as one line.
  if (v.includes('\n')) return v.split('\n').join(' · ');
  // A list (a multi setting): each part in words; an empty list is none.
  return v ? v.split(',').map((p) => VALUE_LABEL[key]?.[p] ?? p).join(', ') : 'None';
};

/** A single choice of 2-4 short options is the joined Segment control, never a dropdown (DESIGN R11; validation 8 Oct 2026). */
const isPickOne = (count: number) => count >= 2 && count <= 4;

export interface SettingsSection {
  title: string;
  description: string;
  keys: string[];
}

export type SettingsArea = 'organisation' | 'access' | 'payroll';

/** Settings group 1 (Organisation), group 2 (People & Access) and group 4's Payroll rules. Codes and master ownership live on Legal entities. */
export const SETTING_SECTIONS: Record<SettingsArea, SettingsSection[]> = {
  organisation: [
    { title: 'Job changes', description: 'How far back HR may date a change without a System Admin, and what a promotion must change (a new designation, a new grade, or both).', keys: ['employee_change.retro_limit', 'promotion.must_change'] },
    { title: 'Inter-entity transfer defaults', description: 'Applied to every move between legal entities (People › Restructure, and one person in Change action). HR can change them for one transfer.', keys: ['transfer.leave', 'transfer.service', 'transfer.code', 'transfer.salary'] },
    { title: 'Probation', description: 'Set for the company, then per entity, employment type or grade where they differ.', keys: ['probation.default_months', 'probation.max_total_months', 'probation.review_lead_days', 'probation.auto_confirm_after_days'] },
    { title: 'Fixed-term contracts', description: 'How long a fixed-term contract may run, counted from the joining day. Setting or extending an end past it is refused; make the person permanent instead. HR is reminded 30 and 7 days before the end; the company can also have the exit start by itself a week before it.', keys: ['contract.max_years', 'contract_end.action'] },
    { title: 'Joining day', description: 'The time joiners report on their first day, and what they bring. Joiners see both in their joining checklist, with the place, their manager and their buddy.', keys: ['joining.reporting_time', 'joining.bring_on_day_one'] },
    { title: 'Attendance', description: 'Dated: a new value starts on the day you choose and earlier days keep the old one.', keys: ['attendance.mode', 'attendance.missing_punch_effect', 'attendance.factories_act'] },
    { title: 'Team pay access', description: 'A manager can ask to see the pay of their team, with a reason. Two different HR people approve; the access ends by itself. The approving HR person can change the length and who it covers on each request.', keys: ['pay_access.days', 'pay_access.scope'] },
    { title: 'Pay ranges', description: 'When a raise takes someone above the top of their grade’s pay range (set per grade in Structure). Warn lets the approver decide; Cap holds the new pay at the maximum; Block stops the change until it is lowered.', keys: ['pay.band.above_max'] },
    { title: 'Work permits and visas', description: 'The person is reminded before a visa, permit or national ID on their record expires. An expired employment visa or work permit holds payroll approval.', keys: ['work_auth.reminder_days'] },
    { title: 'Regulated declarations', description: 'For designated persons (BFSI): when each financial year’s holdings, related persons and conflicts are due, and the trading pre-clearance rules.', keys: ['bfsi.declaration_due', 'bfsi.preclearance_threshold', 'bfsi.preclearance_valid_days', 'bfsi.preclearance_decide_days'] },
    { title: 'Employee records', description: 'The personal details every record must hold. The personal details form marks them Required and does not save without them.', keys: ['employee.personal.required'] },
    { title: 'Working week and language', description: 'A full-time week (part-time jobs show their share of it) and the language people see your company words in.', keys: ['work.normal_week_hours', 'people.language'] },
  ],
  access: [
    { title: 'Manager access', description: 'Managers always see their own reports. The company can narrow it.', keys: ['access.manager.view_scope'] },
    { title: 'Special permissions', description: 'A role that opens identity or bank data for many people asks for a confirmation first.', keys: ['access.risk.confidential_threshold'] },
    { title: 'Privacy', description: 'Every look at identity, bank and pay data is recorded either way. Employees see how long each kind of data is kept on their Privacy page; pay documents follow the payroll rule. Special data is deleted only once you turn that on; read what it would delete below first.', keys: ['privacy.who_accessed', 'privacy.retention.internal_years', 'privacy.retention.personal_years', 'privacy.retention.special_years', 'privacy.erasure.enabled'] },
    { title: 'Bank details', description: 'Protects pay from a hijacked account change.', keys: ['employee.bank_change.cooling_hours'] },
    { title: 'Home page', description: 'What employees see on their home. When net pay is shown, the amount stays hidden until the person selects Show amount, and hides again on every visit. Only their own pay, never anyone else’s.', keys: ['home.pay_on_employee_home'] },
  ],
  // Founder 30 Oct 2026 (last 10, items 1 and 5). The starter values are the Act's; a company may only be more generous.
  payroll: [
    {
      title: 'Statutory bonus',
      description: 'Payment of Bonus Act rules used when payroll works out the yearly bonus (Payroll › Statutory bonus). A change applies the next time a bonus is worked out; an approved bonus keeps the rules it was worked out with.',
      keys: ['payroll.bonus.eligibility_rate_on', 'payroll.bonus.eligibility_wage', 'payroll.bonus.calculation_ceiling', 'payroll.bonus.min_rate', 'payroll.bonus.max_rate', 'payroll.bonus.min_working_days', 'payroll.bonus.min_amount', 'payroll.bonus.allocable_percent', 'payroll.bonus.carry_years', 'payroll.bonus.year_start_month', 'payroll.bonus.due_months'],
    },
    {
      title: 'Loans and advances',
      description: 'The most a person may borrow, who may ask, and the yearly interest for each type. Employees never type the interest: a new request uses the rate in force that day, and loans already given keep theirs.',
      keys: ['payroll.loan.max_gross_months', 'payroll.loan.after_probation', 'payroll.loan.interest_rate.advance', 'payroll.loan.interest_rate.loan'],
    },
    {
      title: 'Payroll reports access',
      description: 'When someone asks for payroll reports and it is approved, they get read-only access to the reports of their legal entity for this many days. It ends by itself; Roles & access shows it with its last day.',
      keys: ['payroll.reports_access.days'],
    },
  ],
};

const AREA: Record<SettingsArea, { group: string; title: string; description: string; what: string }> = {
  organisation: { group: 'Organisation', title: 'Company rules', description: 'Rules that apply to everyone unless an entity, employment type or grade has its own.', what: 'the company rules' },
  access: { group: 'People & Access', title: 'Access and privacy', description: 'Who sees what beyond the roles you grant, and what employees see about their own data.', what: 'the access settings' },
  payroll: { group: 'Payroll & Statutory', title: 'Payroll rules', description: 'Statutory bonus, loan and reports-access rules for the whole company, or for one legal entity where it differs.', what: 'the payroll rules' },
};

/** The company-wide value in force on `today`, and its row (none: the starter value). */
export function companyValue(def: SettingDef, rows: SettingOverride[], today: string): { value: unknown; row: SettingOverride | null } {
  const company = rows.filter((r) => r.scopeType === 'tenant' && (!def.dated || (r.validFrom !== null && r.validFrom <= today)));
  const row = company.reduce<SettingOverride | null>((a, b) => (!a || (b.validFrom ?? '') > (a.validFrom ?? '') ? b : a), null);
  return { value: row ? row.value : def.default, row };
}

interface Draft {
  scopeType: SettingScope;
  scopeId: string | null;
  value: string | null;
  validFrom: Date | null;
}

/** The request body, or what to fix. The API checks again. */
export function settingInput(key: string, def: SettingDef, d: Draft): { input: SettingInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (d.scopeType !== 'tenant' && !d.scopeId) errors.push({ fieldId: 'set-scope-id', message: `Choose the ${SCOPE_LABEL[d.scopeType].toLowerCase()}` });
  const text = def.text ? (d.value ?? '').replace(/\r\n?/g, '\n').trim() : null;
  if (def.text) {
    if (!text) errors.push({ fieldId: 'set-value', message: 'Write it, one thing a line' });
    else if (text.length > def.text.maxLength) errors.push({ fieldId: 'set-value', message: `Keep it to ${def.text.maxLength} characters or fewer (now ${text.length})` });
  } else if (def.multi ? (d.value ?? '').split(',').some((p) => p && !def.values.includes(p)) : !d.value || !def.values.includes(d.value)) errors.push({ fieldId: 'set-value', message: 'Choose the value' });
  const from = d.validFrom ? dayKey(d.validFrom) : null;
  if (def.dated && !from) errors.push({ fieldId: 'set-from', message: 'Choose the date it applies from' });
  if (errors.length) return { input: null, errors };
  return { input: { key, scopeType: d.scopeType, ...(d.scopeType === 'tenant' ? {} : { scopeId: d.scopeId! }), value: text ?? d.value ?? '', ...(def.dated ? { validFrom: from! } : {}) }, errors };
}

/** Focuses a form field by its FormField id: the control itself, or the first control inside it. */
function focusField(id: string | undefined) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el?.matches('input, select, textarea, button')) return el.focus();
  // A control with no id of its own (Segment, Select): the first tabbable control in the field.
  const field = el?.closest('.yx-field') ?? document.querySelector(`label[for="${id}"]`)?.closest('.yx-field');
  field?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button:not([tabindex="-1"]), [tabindex="0"]')?.focus();
}

function SettingEditor({ settingKey, def, current, choices, today, tooEarly = false, onClose, onSave }: { settingKey: string; def: SettingDef; current?: string; choices: SettingScopeChoices; today: string; tooEarly?: boolean; onClose: () => void; onSave: (input: SettingInput) => Promise<void> }) {
  // Only scopes with records to name (pay groups and people are set elsewhere).
  const scopes = def.scopes.filter((s) => s === 'tenant' || (choices[s]?.length ?? 0) > 0);
  // A multi setting starts from the company's current list (the starter value until one is set).
  const [draft, setDraft] = useState<Draft>({ scopeType: scopes[0] ?? 'tenant', scopeId: null, value: def.multi || def.text ? current ?? def.default : null, validFrom: null });
  const picked = (draft.value ?? '').split(',').filter(Boolean);
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const { input, errors } = settingInput(settingKey, def, draft);
  const from = draft.validFrom ? dayKey(draft.validFrom) : null;
  const saveErrors = useSaveErrors(errors, tooEarly);
  const { errorOf } = saveErrors;
  const save = () => {
    if (!input) {
      saveErrors.reveal();
      // Pressed too early: the first field with an error takes focus, after the error summary has rendered.
      const first = errors[0]?.fieldId;
      return void setTimeout(() => focusField(first));
    }
    void run('save', () => onSave(input)).then((ok) => ok && onClose());
  };
  return (
    <EditorDrawer open onClose={onClose} dirty={dirty} title={def.label} subtitle={`Starter value: ${valueLabel(settingKey, def.default)}`} errors={saveErrors.shownErrors} saving={busy === 'save'} failed={error} saveLabel="Save" onSave={save}>
      {/* A company-only setting has nothing to choose here: no empty "Applies to" heading (founder review 14 Oct 2026). */}
      {(scopes.length > 1 || draft.scopeType !== 'tenant') && (
      <FormSection title="Applies to">
        {scopes.length > 1 && (
          <FormField id="set-scope" label="Applies to" helper="The most specific value wins: a grade over an employment type, an entity over the company.">
            {isPickOne(scopes.length) ? (
              <Segment label="Applies to" value={draft.scopeType} onChange={(scopeType) => set({ scopeType, scopeId: null })} options={scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))} />
            ) : (
              <Select value={draft.scopeType} onChange={(v) => v && set({ scopeType: v, scopeId: null })} options={scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))} aria-label="Applies to" />
            )}
          </FormField>
        )}
        {draft.scopeType !== 'tenant' && (
          <FormField id="set-scope-id" label={SCOPE_LABEL[draft.scopeType]} required error={errorOf('set-scope-id')}>
            <Select value={draft.scopeId} onChange={(scopeId) => set({ scopeId })} options={choices[draft.scopeType] ?? []} searchable aria-label={SCOPE_LABEL[draft.scopeType]} />
          </FormField>
        )}
      </FormSection>
      )}
      <FormSection title="Value">
        <FormField id="set-value" label="New value" required error={errorOf('set-value')} helper={def.text ? `One thing a line, up to ${def.text.maxLength} characters (${(draft.value ?? '').length} now).` : undefined}>
          {def.text ? (
            <TextArea value={draft.value ?? ''} onChange={(value) => set({ value })} rows={5} aria-label={def.label} />
          ) : def.multi ? (
            def.values.map((v) => <Checkbox key={v} checked={picked.includes(v)} onChange={(c) => set({ value: def.values.filter((x) => (x === v ? c : picked.includes(x))).join(',') })} label={valueLabel(settingKey, v)} />)
          ) : isPickOne(def.values.length) ? (
            <Segment label={def.label} value={draft.value ?? ''} onChange={(value) => set({ value })} options={def.values.map((v) => ({ value: v, label: valueLabel(settingKey, v) }))} />
          ) : (
            <Select value={draft.value} onChange={(value) => set({ value })} options={def.values.map((v) => ({ value: v, label: valueLabel(settingKey, v) }))} aria-label={def.label} />
          )}
        </FormField>
        {def.dated && (
          <FormField id="set-from" label="Applies from" required helper="Earlier days keep the value they had." error={errorOf('set-from')}>
            <DatePicker value={draft.validFrom} onChange={(validFrom) => set({ validFrom })} aria-label="Applies from" />
          </FormField>
        )}
        {def.dated && from && from <= today && <InlineAlert tone="warning">This date has passed: days from then on read the new value, including any payroll re-run for them.</InlineAlert>}
      </FormSection>
    </EditorDrawer>
  );
}

function SettingBlock({ settingKey, def, rows, names, canEdit, blockedReason, today, onEdit, onRemove }: {
  settingKey: string;
  def: SettingDef;
  rows: SettingOverride[];
  names: (r: SettingOverride) => string;
  canEdit: boolean;
  blockedReason: string | null;
  today: string;
  onEdit: () => void;
  onRemove: (r: SettingOverride) => void;
}) {
  const { value, row } = companyValue(def, rows, today);
  const source = row ? (row.validFrom ? `Set for your company from ${dateLabel(row.validFrom)}` : 'Set for your company') : null;
  // One company-wide value and no dates: the line above already says it, so no table (founder review 14 Oct 2026).
  const companyOnly = !def.dated && rows.every((r) => r.scopeType === 'tenant');
  const inForce = (r: SettingOverride) => def.dated && r.validFrom !== null && r.validFrom <= today;
  const columns: TableColumn<SettingOverride>[] = [
    { key: 'scope', header: 'Applies to', value: names, render: (r) => <span className="yx-auth__item-main"><Text weight="medium">{names(r)}</Text>{r.scopeType !== 'tenant' && <Text tone="secondary" size="sm">{SCOPE_LABEL[r.scopeType]}</Text>}</span>, hideable: false },
    { key: 'value', header: 'Value', value: (r) => valueLabel(settingKey, r.value), width: 200 },
    ...(def.dated
      ? [{ key: 'from', header: 'From', value: (r: SettingOverride) => r.validFrom ?? '', render: (r: SettingOverride) => (r.validFrom ? <span className="yx-org__from">{dateLabel(r.validFrom)}{r.validFrom > today && <Badge tone="info">Scheduled</Badge>}</span> : '—'), width: 230 }]
      : []),
  ];
  return (
    <div className="yx-auth__stack yx-org__rule">
      {/* The value reads first, in bold; where it comes from is a quiet tag (founder review 14 Oct 2026). */}
      <div className="yx-org__head">
        <span className="yx-auth__item-main">
          <Text as="p" weight="medium">{def.label}</Text>
          <span className="yx-org__now">
            <Text weight="semibold">{valueLabel(settingKey, value)}</Text>
            {source ? <Text tone="secondary" size="sm">{source}</Text> : <Badge>Starter value</Badge>}
          </span>
          {blockedReason && <Text as="p" tone="secondary" size="sm">{blockedReason}</Text>}
        </span>
        {blockedReason ? (
          <Button size="sm" disabled>Change</Button>
        ) : canEdit ? (
          <span className="yx-org__acts">
            {companyOnly && row && <Button size="sm" onClick={() => onRemove(row)}>Use starter value</Button>}
            <Button size="sm" onClick={onEdit}>Change</Button>
          </span>
        ) : undefined}
      </div>
      {rows.length > 0 && !companyOnly && (
        <DataTable
          label={`${def.label}: values set`}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          rowNoun={['value', 'values']}
          rowActions={canEdit && !blockedReason ? (r) => (inForce(r) ? null : <MenuItem destructive onSelect={() => onRemove(r)}>Remove</MenuItem>) : undefined}
        />
      )}
    </div>
  );
}

export interface CompanySettingsScreenProps {
  /** Group 1 (Organisation), group 2 (People & Access) or group 4's Payroll rules. */
  section: SettingsArea;
  state: LoadState;
  onRetry?: () => void;
  registry: Record<string, SettingDef>;
  overrides: SettingOverride[];
  /** Names for the records a value can apply to. */
  choices: SettingScopeChoices;
  /** org.settings.manage. */
  canManage: boolean;
  /** Keys held, for settings with a guard (access.role.manage). */
  heldGuards: string[];
  /** YYYY-MM-DD in the company's time zone. */
  today: string;
  onSave: (input: SettingInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** Stories only: open the editor of a key, with the pressed-too-early errors shown. */
  story?: { editing?: string; tooEarly?: boolean };
  /** Access and privacy: the Special data erasure's dry run and last run (company-wide settings managers only). */
  erasure?: ErasureReport;
}

const ERASED: { key: keyof ErasureCounts; what: string }[] = [
  { key: 'people', what: 'People past the period (left, or never joined)' },
  { key: 'aadhaar', what: 'Aadhaar numbers on their records and joining forms' },
  { key: 'documents', what: 'Aadhaar copies, background check reports and disability certificates' },
  { key: 'backgroundChecks', what: 'Background check notes' },
  { key: 'disability', what: 'Disability details (the yes or no answer stays)' },
];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Follow-up 12 and the founder's answers (30 Oct 2026): what the nightly job would delete today and from whom (name,
 * employee code, last day or the day the joining was cancelled; never a value), what it keeps, and its last run.
 */
function ErasureCard({ report }: { report: ErasureReport }) {
  const last = report.lastRun;
  const due = report.enabled ? 'Due at the next run' : 'If it ran today, it would delete';
  return (
    <Card title="Deleting Special data" className="yx-org__group">
      <Text as="p" tone="secondary" size="sm" className="yx-org__group-desc">
        {report.enabled
          ? 'On. Every night, Special data past its period is deleted for good, and each deletion is recorded with counts only.'
          : 'Off. Nothing is deleted. Check what it would delete today, then turn it on above.'}
      </Text>
      <PlainTable
        label={due}
        caption={due}
        columns={[
          { key: 'what', header: 'What', rowHeader: true, cell: (r: (typeof ERASED)[number]) => r.what },
          { key: 'count', header: 'How many', cell: (r: (typeof ERASED)[number]) => report.due[r.key] },
        ]}
        rows={ERASED}
        getRowId={(r) => r.key}
      />
      {report.who.length ? (
        <PlainTable
          label="Whose data"
          caption="Whose data"
          columns={[
            { key: 'name', header: 'Name', rowHeader: true, cell: (p: ErasurePerson) => p.name },
            { key: 'code', header: 'Employee code', cell: (p: ErasurePerson) => p.employeeCode ?? 'None (never joined)' },
            { key: 'day', header: 'Last day', date: true, cell: (p: ErasurePerson) => (p.neverJoined ? `Joining cancelled ${dateLabel(p.day)}` : dateLabel(p.day)) },
          ]}
          rows={report.who}
          getRowId={(p) => `${p.name}-${p.employeeCode ?? ''}-${p.day}`}
        />
      ) : (
        <EmptyState compact title="No one's data is due." description="People appear here once their period has passed." />
      )}
      <Text as="p" tone="secondary" size="sm">
        Kept: consent records, background check results (clear or discrepancy), and pay records and filings, Aadhaar included (they follow the payroll period).
      </Text>
      <Text as="p" size="sm">
        {last
          ? `Last run ${formatDate(new Date(last.at))}: ${plural(last.people, 'person', 'people')}, ${plural(last.aadhaar, 'Aadhaar number', 'Aadhaar numbers')}, ${plural(last.documents, 'document', 'documents')}, ${plural(last.backgroundChecks, 'check note', 'check notes')}, ${plural(last.disability, 'disability declaration', 'disability declarations')}.`
          : 'It has not run yet.'}
      </Text>
      {last && last.failed > 0 && (
        <InlineAlert tone="warning" title={`${plural(last.failed, 'person was', 'people were')} not done`}>
          It tries again tomorrow night. If it keeps failing, contact YukthiX support.
        </InlineAlert>
      )}
    </Card>
  );
}

/** Settings › Organisation › Company rules, and Settings › People & Access › Access and privacy (P01 §4.6, P02 §4.2, §7). */
export function CompanySettingsScreen(props: CompanySettingsScreenProps) {
  const [editing, setEditing] = useState<{ key: string; n: number } | null>(props.story?.editing ? { key: props.story.editing, n: 0 } : null);
  const [dialog, ask] = useConfirm();
  const { toast } = useToast();
  const area = AREA[props.section];
  const name = (r: SettingOverride) => (r.scopeType === 'tenant' ? 'Whole company' : (props.choices[r.scopeType]?.find((c) => c.value === r.scopeId)?.label ?? 'Archived record'));
  const editDef = editing ? props.registry[editing.key] : null;
  return (
    <OrgPage
      group={area.group}
      crumb={area.title}
      title={area.title}
      description={area.description}
      state={props.state}
      onRetry={props.onRetry}
      what={area.what}
    >
      {SETTING_SECTIONS[props.section].map((s) => {
        const keys = s.keys.filter((k) => props.registry[k]);
        if (!keys.length) return null;
        return (
          <Fragment key={s.title}>
            <Card title={s.title} className="yx-org__group">
              {s.description && <Text as="p" tone="secondary" size="sm" className="yx-org__group-desc">{s.description}</Text>}
              <div className="yx-org__rules">
                {keys.map((k) => {
                  const def = props.registry[k];
                  const guard = def.guard && !props.heldGuards.includes(def.guard);
                  return (
                    <SettingBlock
                      key={k}
                      settingKey={k}
                      def={def}
                      rows={props.overrides.filter((r) => r.key === k).sort((x, y) => SCOPES.indexOf(x.scopeType) - SCOPES.indexOf(y.scopeType) || (x.validFrom ?? '').localeCompare(y.validFrom ?? ''))}
                      names={name}
                      canEdit={props.canManage}
                      blockedReason={props.canManage && guard ? 'Only an admin who manages roles and access changes this' : null}
                      today={props.today}
                      onEdit={() => setEditing({ key: k, n: Date.now() })}
                      onRemove={(r) =>
                        ask({
                          title: `Remove this value for ${name(r)}?`,
                          consequence: r.scopeType === 'tenant' ? `The company goes back to the starter value, ${valueLabel(k, def.default)}.` : 'It takes the value set above it again.',
                          confirmLabel: 'Remove',
                          destructive: true,
                          action: async () => {
                            await props.onRemove(r.id);
                            toast({ tone: 'success', title: r.scopeType === 'tenant' ? 'Back to the starter value.' : 'Removed.' });
                          },
                        })
                      }
                    />
                  );
                })}
              </div>
            </Card>
            {s.title === 'Privacy' && props.erasure && <ErasureCard report={props.erasure} />}
          </Fragment>
        );
      })}
      {dialog}
      {editing && editDef && <SettingEditor key={editing.n} settingKey={editing.key} def={editDef} current={String(companyValue(editDef, props.overrides.filter((r) => r.key === editing.key), props.today).value)} choices={props.choices} today={props.today} tooEarly={props.story?.tooEarly} onClose={() => setEditing(null)} onSave={async (input) => {
        await props.onSave(input);
        toast({ tone: 'success', title: 'Saved.' });
      }} />}
    </OrgPage>
  );
}
