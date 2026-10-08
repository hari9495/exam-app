import { useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { InlineAlert } from '../../components/feedback';
import { FormField, FormSection, type FormErrorItem } from '../../components/field';
import { Text } from '../../components/foundations';
import { MenuItem } from '../../components/menu';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { dayKey } from '../../lib/dates';
import { EditorDrawer, OrgPage, SectionHead, dateLabel, useConfirm, useRun } from './org-kit';
import type { LoadState, SettingDef, SettingInput, SettingOverride, SettingScope, SettingScopeChoices } from './types';

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

/** Words for the stored values; anything unlisted shows as stored (numbers). */
const VALUE_LABEL: Record<string, Record<string, string>> = {
  'employee_change.retro_limit': { current_fy: 'Start of this financial year', previous_fy: 'Start of last financial year' },
  'probation.auto_confirm_after_days': { off: 'Never (HR confirms)', '0': 'On the end date', '7': '7 days after', '15': '15 days after', '30': '30 days after' },
  'access.manager.view_scope': { all_reports: 'Everyone under them', direct_reports: 'Direct reports only' },
  'privacy.who_accessed': { on: 'Shown', off: 'Hidden' },
  'attendance.mode': { punch: 'Punch in and out', assumed_present: 'Present unless on leave', timesheet: 'Timesheet' },
  'attendance.missing_punch_effect': { block_payroll_approval: 'Hold payroll approval', warning_only: 'Warn only' },
};
export const valueLabel = (key: string, value: unknown) => VALUE_LABEL[key]?.[String(value)] ?? String(value);

export interface SettingsSection {
  title: string;
  description: string;
  keys: string[];
}

/** Settings group 1 (Organisation) and group 2 (People & Access). Codes and master ownership live on Legal entities. */
export const SETTING_SECTIONS: Record<'organisation' | 'access', SettingsSection[]> = {
  organisation: [
    { title: 'Job changes', description: 'How far back HR may date a change without a System Admin.', keys: ['employee_change.retro_limit'] },
    { title: 'Probation', description: 'Set for the company, then per entity, employment type or grade where they differ.', keys: ['probation.default_months', 'probation.max_total_months', 'probation.review_lead_days', 'probation.auto_confirm_after_days'] },
    { title: 'Attendance', description: 'Dated: a new value starts on the day you choose and earlier days keep the old one.', keys: ['attendance.mode', 'attendance.missing_punch_effect'] },
  ],
  access: [
    { title: 'Manager access', description: 'Managers always see their own reports. The company can narrow it.', keys: ['access.manager.view_scope'] },
    { title: 'Special permissions', description: 'A role that opens identity or bank data for many people asks for a confirmation first.', keys: ['access.risk.confidential_threshold'] },
    { title: 'Privacy', description: 'Every look at identity, bank and pay data is recorded either way.', keys: ['privacy.who_accessed'] },
    { title: 'Bank details', description: 'Protects pay from a hijacked account change.', keys: ['employee.bank_change.cooling_hours'] },
  ],
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
  if (!d.value || !def.values.includes(d.value)) errors.push({ fieldId: 'set-value', message: 'Choose the value' });
  const from = d.validFrom ? dayKey(d.validFrom) : null;
  if (def.dated && !from) errors.push({ fieldId: 'set-from', message: 'Choose the date it applies from' });
  if (errors.length) return { input: null, errors };
  return { input: { key, scopeType: d.scopeType, ...(d.scopeType === 'tenant' ? {} : { scopeId: d.scopeId! }), value: d.value!, ...(def.dated ? { validFrom: from! } : {}) }, errors };
}

function SettingEditor({ settingKey, def, choices, today, onClose, onSave }: { settingKey: string; def: SettingDef; choices: SettingScopeChoices; today: string; onClose: () => void; onSave: (input: SettingInput) => Promise<void> }) {
  // Only scopes with records to name (pay groups and people are set elsewhere).
  const scopes = def.scopes.filter((s) => s === 'tenant' || (choices[s]?.length ?? 0) > 0);
  const [draft, setDraft] = useState<Draft>({ scopeType: scopes[0] ?? 'tenant', scopeId: null, value: null, validFrom: null });
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const { input, errors } = settingInput(settingKey, def, draft);
  const from = draft.validFrom ? dayKey(draft.validFrom) : null;
  const errorOf = (id: string) => (showErrors ? errors.find((e) => e.fieldId === id)?.message : undefined);
  const save = () => {
    if (!input) return setShowErrors(true);
    void run('save', () => onSave(input)).then((ok) => ok && onClose());
  };
  return (
    <EditorDrawer open onClose={onClose} dirty={dirty} title={def.label} subtitle={`Starter value: ${valueLabel(settingKey, def.default)}`} errors={errors} showErrors={showErrors} saving={busy === 'save'} failed={error} saveLabel="Save" onSave={save}>
      <FormSection title="Applies to">
        {scopes.length > 1 && (
          <FormField id="set-scope" label="Applies to" helper="The most specific value wins: a grade over an employment type, an entity over the company.">
            <Select value={draft.scopeType} onChange={(v) => v && set({ scopeType: v, scopeId: null })} options={scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))} aria-label="Applies to" />
          </FormField>
        )}
        {draft.scopeType !== 'tenant' && (
          <FormField id="set-scope-id" label={SCOPE_LABEL[draft.scopeType]} required error={errorOf('set-scope-id')}>
            <Select value={draft.scopeId} onChange={(scopeId) => set({ scopeId })} options={choices[draft.scopeType] ?? []} searchable aria-label={SCOPE_LABEL[draft.scopeType]} />
          </FormField>
        )}
      </FormSection>
      <FormSection title="Value">
        <FormField id="set-value" label={def.label} required error={errorOf('set-value')}>
          <Select value={draft.value} onChange={(value) => set({ value })} options={def.values.map((v) => ({ value: v, label: valueLabel(settingKey, v) }))} aria-label={def.label} />
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
  const source = row ? (row.validFrom ? `Set for your company from ${dateLabel(row.validFrom)}` : 'Set for your company') : 'YukthiX starter, not changed yet';
  const inForce = (r: SettingOverride) => def.dated && r.validFrom !== null && r.validFrom <= today;
  const columns: TableColumn<SettingOverride>[] = [
    { key: 'scope', header: 'Applies to', value: names, render: (r) => <span className="yx-auth__item-main"><Text weight="medium">{names(r)}</Text>{r.scopeType !== 'tenant' && <Text tone="secondary" size="sm">{SCOPE_LABEL[r.scopeType]}</Text>}</span>, hideable: false },
    { key: 'value', header: 'Value', value: (r) => valueLabel(settingKey, r.value), width: 200 },
    ...(def.dated
      ? [{ key: 'from', header: 'From', value: (r: SettingOverride) => r.validFrom ?? '', render: (r: SettingOverride) => (r.validFrom ? <span>{dateLabel(r.validFrom)} {r.validFrom > today && <Badge tone="info">Scheduled</Badge>}</span> : '—'), width: 170 }]
      : []),
  ];
  return (
    <div className="yx-auth__stack yx-org__rule">
      <SectionHead
        title={def.label}
        description={`${valueLabel(settingKey, value)} · ${source}${blockedReason ? `. ${blockedReason}` : ''}`}
        action={blockedReason ? <Button size="sm" disabled>Change</Button> : canEdit ? <Button size="sm" onClick={onEdit}>Change</Button> : undefined}
      />
      {rows.length > 0 && (
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
  /** Group 1 (Organisation) or group 2 (People & Access). */
  section: 'organisation' | 'access';
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
}

/** Settings › Organisation › Company rules, and Settings › People & Access › Access and privacy (P01 §4.6, P02 §4.2, §7). */
export function CompanySettingsScreen(props: CompanySettingsScreenProps) {
  const [editing, setEditing] = useState<{ key: string; n: number } | null>(null);
  const [dialog, ask] = useConfirm();
  const access = props.section === 'access';
  const name = (r: SettingOverride) => (r.scopeType === 'tenant' ? 'Whole company' : (props.choices[r.scopeType]?.find((c) => c.value === r.scopeId)?.label ?? 'Archived record'));
  const editDef = editing ? props.registry[editing.key] : null;
  return (
    <OrgPage
      group={access ? 'People & Access' : 'Organisation'}
      crumb={access ? 'Access and privacy' : 'Company rules'}
      title={access ? 'Access and privacy' : 'Company rules'}
      description={access ? 'Who sees what beyond the roles you grant, and what employees see about their own data.' : 'Rules that apply to everyone unless an entity, employment type or grade has its own.'}
      state={props.state}
      onRetry={props.onRetry}
      what={access ? 'the access settings' : 'the company rules'}
    >
      {SETTING_SECTIONS[props.section].map((s) => {
        const keys = s.keys.filter((k) => props.registry[k]);
        if (!keys.length) return null;
        return (
          <section key={s.title} className="yx-auth__stack" aria-label={s.title}>
            <FormSection title={s.title} description={s.description}>
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
                        action: () => props.onRemove(r.id),
                      })
                    }
                  />
                );
              })}
            </FormSection>
          </section>
        );
      })}
      {dialog}
      {editing && editDef && <SettingEditor key={editing.n} settingKey={editing.key} def={editDef} choices={props.choices} today={props.today} onClose={() => setEditing(null)} onSave={props.onSave} />}
    </OrgPage>
  );
}
