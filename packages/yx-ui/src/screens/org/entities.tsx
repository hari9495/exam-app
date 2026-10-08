import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { MenuItem } from '../../components/menu';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField, FormSection, type FormErrorItem } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { AddressFields, ArchivedToggle, EditorDrawer, MONTHS, OrgPage, SectionHead, StatusBadge, addressDraft, addressEmpty, addressInput, errorText, lifecycleItems, useConfirm, useRun, type AddressDraft } from './org-kit';
import type { CompanyRules, LegalEntity, LegalEntityInput, LoadState, StateOption, StatutoryIds } from './types';

/* ---------- entity editor ---------- */

interface Draft {
  name: string;
  shortName: string;
  currency: string;
  fyStartMonth: number;
  address: AddressDraft;
}

export function entityInput(d: Draft): { input: LegalEntityInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (!d.name.trim()) errors.push({ fieldId: 'le-name', message: 'Enter the registered name' });
  if (!/^[A-Za-z0-9][A-Za-z0-9 &.-]{0,29}$/.test(d.shortName.trim())) errors.push({ fieldId: 'le-short', message: 'Short name: up to 30 letters, digits, spaces, & . or -' });
  if (!/^[A-Z]{3}$/.test(d.currency)) errors.push({ fieldId: 'le-currency', message: 'Currency is a 3-letter code such as INR' });
  const address = addressEmpty(d.address) ? { address: null, errors: [] } : addressInput(d.address, 'le-addr');
  errors.push(...address.errors);
  if (errors.length) return { input: null, errors };
  return { input: { name: d.name.trim(), shortName: d.shortName.trim(), currency: d.currency, fyStartMonth: d.fyStartMonth, registeredAddress: address.address }, errors };
}

function EntityEditor({ entity, states, onClose, onSave }: { entity: LegalEntity | null; states: StateOption[]; onClose: () => void; onSave: (input: LegalEntityInput) => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>({
    name: entity?.name ?? '',
    shortName: entity?.shortName ?? '',
    currency: entity?.currency ?? 'INR',
    fyStartMonth: entity?.fyStartMonth ?? 4,
    address: addressDraft(entity?.registeredAddress),
  });
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const { input, errors } = entityInput(draft);
  const errorOf = (id: string) => (showErrors ? errors.find((e) => e.fieldId === id)?.message : undefined);
  const save = () => {
    if (!input) return setShowErrors(true);
    void run('save', () => onSave(input)).then((ok) => ok && onClose());
  };
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title={entity ? `Edit ${entity.name}` : 'Add legal entity'}
      subtitle="India · data kept in India"
      errors={errors}
      showErrors={showErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel={entity ? 'Save changes' : 'Add legal entity'}
      onSave={save}
    >
      <FormSection title="Entity">
        <FormField id="le-name" label="Registered name" required error={errorOf('le-name')}>
          <TextField value={draft.name} onChange={(name) => set({ name })} maxLength={200} />
        </FormField>
        <FormField id="le-short" label="Short name" required helper="Shown in lists and filters, e.g. KFPL." error={errorOf('le-short')}>
          <TextField value={draft.shortName} onChange={(shortName) => set({ shortName })} maxLength={30} />
        </FormField>
        <FormField id="le-fy" label="Financial year starts in">
          <Select value={String(draft.fyStartMonth)} onChange={(v) => v && set({ fyStartMonth: Number(v) })} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} aria-label="Financial year starts in" />
        </FormField>
        <FormField id="le-currency" label="Currency" required error={errorOf('le-currency')}>
          <TextField value={draft.currency} onChange={(currency) => set({ currency: currency.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })} />
        </FormField>
      </FormSection>
      <FormSection title="Registered address">
        <AddressFields prefix="le-addr" draft={draft.address} onChange={(address) => set({ address })} states={states} errorOf={errorOf} required={!addressEmpty(draft.address)} />
      </FormSection>
    </EditorDrawer>
  );
}

/* ---------- Confidential identifiers (P02 §4.4) ---------- */

const ID_FIELDS: { key: keyof StatutoryIds; label: string; pattern: RegExp; hint: string; max: number }[] = [
  { key: 'pan', label: 'PAN', pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/, hint: '10 characters, like ABCDE1234F', max: 10 },
  { key: 'tan', label: 'TAN', pattern: /^[A-Z]{4}[0-9]{5}[A-Z]$/, hint: '10 characters, like BLRA01234B', max: 10 },
  { key: 'gstin', label: 'GSTIN', pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, hint: '15 characters; it contains the PAN', max: 15 },
  { key: 'cin', label: 'CIN or LLPIN', pattern: /^([LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}|[A-Z]{3}-[0-9]{4})$/, hint: '21-character CIN, or an LLPIN like AAB-1234', max: 21 },
];

export function statutoryErrors(ids: StatutoryIds): FormErrorItem[] {
  const errors: FormErrorItem[] = ID_FIELDS.filter((f) => ids[f.key] && !f.pattern.test(ids[f.key]!)).map((f) => ({ fieldId: `le-${f.key}`, message: `${f.label}: ${f.hint}` }));
  if (ids.gstin && ids.pan && ids.gstin.slice(2, 12) !== ids.pan) errors.push({ fieldId: 'le-gstin', message: 'The GSTIN does not contain this PAN' });
  return errors;
}

function StatutoryDrawer({ entity, onClose, onLoad, onSave }: { entity: LegalEntity; onClose: () => void; onLoad: () => Promise<StatutoryIds>; onSave: (ids: StatutoryIds) => Promise<void> }) {
  const [ids, setIds] = useState<StatutoryIds | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const { busy, error, run } = useRun();
  useEffect(() => {
    onLoad().then(setIds, (e) => setLoadError(errorText(e)));
    // Load once per opening: every read is recorded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const errors = ids ? statutoryErrors(ids) : [];
  const save = () => {
    if (!ids) return;
    if (errors.length) return setShowErrors(true);
    void run('save', () => onSave(ids)).then((ok) => ok && onClose());
  };
  return (
    <EditorDrawer open onClose={onClose} dirty={dirty} title={`Identifiers · ${entity.shortName}`} subtitle={entity.name} errors={errors} showErrors={showErrors} saving={busy === 'save'} failed={error} saveLabel="Save identifiers" onSave={save}>
      <InlineAlert tone="info">Opening and changing these is recorded. You confirm it’s you before saving.</InlineAlert>
      {loadError && <InlineAlert tone="danger" title="Couldn’t open the identifiers">{loadError}</InlineAlert>}
      {!ids && !loadError && <Skeleton height={200} />}
      {ids &&
        ID_FIELDS.map((f) => (
          <FormField key={f.key} id={`le-${f.key}`} label={f.label} helper={f.hint} error={showErrors ? errors.find((e) => e.fieldId === `le-${f.key}`)?.message : undefined}>
            <TextField
              value={ids[f.key] ?? ''}
              onChange={(v) => {
                const clean = v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, f.max);
                setIds({ ...ids, [f.key]: clean || null });
                setDirty(true);
              }}
              spellCheck={false}
              autoComplete="off"
            />
          </FormField>
        ))}
    </EditorDrawer>
  );
}

/* ---------- company rules (YX-ORG-12, YX-ORG-16) ---------- */

// `justSaved`: the form is redrawn with the saved rules, so "Saved." is remembered by the parent.
function RulesForm({ rules, canManage, onSave, justSaved = false }: { rules: CompanyRules; canManage: boolean; onSave: (changes: { employeeCodeScope?: string; defaultOwnership?: string }) => Promise<void>; justSaved?: boolean }) {
  const [codeScope, setCodeScope] = useState(rules.employeeCodeScope.value);
  const [ownership, setOwnership] = useState(rules.defaultOwnership.value);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useRun();
  const changes = {
    ...(codeScope !== rules.employeeCodeScope.value ? { employeeCodeScope: codeScope } : {}),
    ...(ownership !== rules.defaultOwnership.value ? { defaultOwnership: ownership } : {}),
  };
  const dirty = Object.keys(changes).length > 0;
  const source = (s: 'default' | 'company') => (s === 'default' ? 'YukthiX starter, not changed yet' : 'Set for your company');
  return (
    <form className="yx-auth__settings" onSubmit={(e) => { e.preventDefault(); void run('rules', () => onSave(changes)).then(setSaved); }} noValidate>
      <FormSection title="Company rules">
        <FormField label="Employee codes are unique" helper={`${source(rules.employeeCodeScope.source)}. Switching to company-wide is blocked while two people share a code.`}>
          <Segment label="Employee codes are unique" options={[{ value: 'legal_entity' as const, label: 'Per legal entity' }, { value: 'tenant' as const, label: 'Across the company' }]} value={codeScope} onChange={(v) => { setCodeScope(v); setSaved(false); }} />
        </FormField>
        <FormField label="New departments, designations and grades are" helper={`${source(rules.defaultOwnership.source)}. A shared one can still be limited to some entities.`}>
          <Segment label="New masters are" options={[{ value: 'shared' as const, label: 'Shared' }, { value: 'entity_only' as const, label: 'Entity-only' }]} value={ownership} onChange={(v) => { setOwnership(v); setSaved(false); }} />
        </FormField>
      </FormSection>
      {(saved || justSaved) && !dirty && <InlineAlert tone="success">Saved.</InlineAlert>}
      {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
      {canManage && (
        <div className="yx-auth__row yx-auth__save">
          <Button type="submit" variant="primary" loading={busy === 'rules'} disabled={!dirty}>Save rules</Button>
          <Button onClick={() => { setCodeScope(rules.employeeCodeScope.value); setOwnership(rules.defaultOwnership.value); }} disabled={!dirty || busy === 'rules'}>Discard changes</Button>
        </div>
      )}
    </form>
  );
}

/* ---------- screen ---------- */

export interface LegalEntitiesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  /** Active and archived. */
  entities: LegalEntity[];
  states: StateOption[];
  canManage: boolean;
  /** org.entity.statutory.manage: may open and change PAN, TAN, GSTIN, CIN. */
  canStatutory: boolean;
  rules: CompanyRules | null;
  onSaveRules: (changes: { employeeCodeScope?: string; defaultOwnership?: string }) => Promise<void>;
  onSave: (id: string | null, input: LegalEntityInput) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onLoadStatutory: (id: string) => Promise<StatutoryIds>;
  onSaveStatutory: (id: string, ids: StatutoryIds) => Promise<void>;
}

const ID_LABEL: Record<keyof LegalEntity['statutory'], string> = { pan: 'PAN', tan: 'TAN', gstin: 'GSTIN', cin: 'CIN' };

/** Settings › Organisation › Legal entities (P01 §4.1; YX-ORG-01). */
export function LegalEntitiesScreen(props: LegalEntitiesScreenProps) {
  const [editing, setEditing] = useState<{ entity: LegalEntity | null; key: number } | null>(null);
  const [ids, setIds] = useState<LegalEntity | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, ask] = useConfirm();
  const archived = props.entities.filter((e) => e.archivedAt).length;
  const rows = useMemo(() => props.entities.filter((e) => showArchived || !e.archivedAt), [props.entities, showArchived]);

  const columns: TableColumn<LegalEntity>[] = [
    {
      key: 'name',
      header: 'Entity',
      value: (e) => e.name,
      render: (e) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{e.name}</Text>
          <Text tone="secondary" size="sm">{e.shortName}{e.registeredAddress ? ` · ${e.registeredAddress.city}` : ''}</Text>
        </span>
      ),
      hideable: false,
    },
    { key: 'fy', header: 'Year starts', value: (e) => MONTHS[e.fyStartMonth - 1], width: 120, optional: true },
    {
      key: 'ids',
      header: 'Identifiers',
      value: (e) => Object.values(e.statutory).filter(Boolean).length,
      render: (e) => {
        const missing = (Object.keys(ID_LABEL) as (keyof LegalEntity['statutory'])[]).filter((k) => !e.statutory[k]).map((k) => ID_LABEL[k]);
        return missing.length ? <Badge tone="warning">{missing.length === 4 ? 'None on file' : `Missing ${missing.join(', ')}`}</Badge> : <Badge tone="neutral">All on file</Badge>;
      },
      width: 190,
      optional: true,
    },
    { key: 'status', header: 'Status', value: (e) => (e.archivedAt ? 'Archived' : e.isDefault ? 'Default' : 'Active'), render: (e) => <StatusBadge archived={Boolean(e.archivedAt)} isDefault={e.isDefault} />, width: 110 },
  ];

  const [rulesSaved, setRulesSaved] = useState(false);
  const add = <Button onClick={() => setEditing({ entity: null, key: Date.now() })}>Add legal entity</Button>;
  return (
    <OrgPage
      crumb="Legal entities"
      title="Legal entities"
      description="The registered employers in your company. Exactly one is the default for new hires and imports."
      actions={props.canManage ? add : undefined}
      state={props.state}
      onRetry={props.onRetry}
      what="the legal entities"
    >
      <section className="yx-auth__stack" aria-label="Legal entities">
        <SectionHead title="Entities" description="Archived entities are hidden here; their people and history stay." action={<ArchivedToggle checked={showArchived} onChange={setShowArchived} count={archived} />} />
        <DataTable
          label="Legal entities"
          columns={columns}
          rows={rows}
          getRowId={(e) => e.id}
          rowNoun={['entity', 'entities']}
          cardSummary
          empty={<EmptyState compact title="No legal entities yet." description="Add the company that employs your people." action={props.canManage ? add : undefined} />}
          rowActions={
            props.canManage
              ? (e) =>
                  e.isDefault ? null : (
                    <>
                      {!e.archivedAt && (
                        <MenuItem onSelect={() => ask({ title: `Make ${e.shortName} the default?`, consequence: 'New hires and imports start with this entity. Nothing else changes.', confirmLabel: 'Make default', action: () => props.onSetDefault(e.id) })}>
                          Make default
                        </MenuItem>
                      )}
                      {lifecycleItems(e.name, Boolean(e.archivedAt), ask, { archive: () => props.onArchive(e.id), restore: () => props.onRestore(e.id), remove: () => props.onDelete(e.id) }, 'It can no longer be chosen. Archive its locations and cost centres first.')}
                    </>
                  )
              : undefined
          }
          rowButtons={(e) => (
            <>
              {props.canManage && !e.archivedAt && <Button size="sm" onClick={() => setEditing({ entity: e, key: Date.now() })}>Edit</Button>}
              {props.canStatutory && <Button size="sm" onClick={() => setIds(e)} aria-label={`Identifiers of ${e.name}`}>Identifiers</Button>}
            </>
          )}
        />
      </section>

      {props.rules && <RulesForm key={JSON.stringify(props.rules)} rules={props.rules} canManage={props.canManage} justSaved={rulesSaved} onSave={(c) => props.onSaveRules(c).then(() => setRulesSaved(true))} />}

      {editing && <EntityEditor key={editing.key} entity={editing.entity} states={props.states} onClose={() => setEditing(null)} onSave={(input) => props.onSave(editing.entity?.id ?? null, input)} />}
      {dialog}
      {ids && <StatutoryDrawer key={ids.id} entity={ids} onClose={() => setIds(null)} onLoad={() => props.onLoadStatutory(ids.id)} onSave={(v) => props.onSaveStatutory(ids.id, v)} />}
    </OrgPage>
  );
}

