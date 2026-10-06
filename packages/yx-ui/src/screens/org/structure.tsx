import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { ErrorSummary, FieldRow, FormField, FormSection, type FormErrorItem } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { MultiSelect, Select } from '../../components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dayKey } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { ArchivedToggle, EditorDrawer, OrgPage, SectionHead, StatusBadge, dateLabel, daysBetweenIso, entityName, errorText, lifecycleItems, ownershipLabel, useConfirm, useRun, type Ask } from './org-kit';
import { EMPLOYMENT_CATEGORIES, type EmploymentCategory, type LegalEntity, type LoadState, type MasterInput, type MasterKind, type MasterLists, type MasterRecord, type PayAmounts, type PayRange, type PayRangeInput } from './types';

export const KINDS: { kind: MasterKind; label: string; one: string; description: string }[] = [
  { kind: 'departments', label: 'Departments', one: 'department', description: 'A tree of any depth. A division is a top-level department that groups others.' },
  { kind: 'designations', label: 'Designations', one: 'designation', description: 'Job titles.' },
  { kind: 'grades', label: 'Grades', one: 'grade', description: 'Levels used by leave, expense and travel rules. Pay ranges are shown only to people with pay access.' },
  { kind: 'employment-types', label: 'Employment types', one: 'employment type', description: 'Each category carries the PF, ESI and gratuity rules the law sets.' },
  { kind: 'cost-centres', label: 'Cost centres', one: 'cost centre', description: 'Where cost is booked. Each belongs to one legal entity.' },
];

export const CATEGORY_LABEL: Record<EmploymentCategory, string> = {
  permanent: 'Permanent',
  probation: 'Probation',
  fixed_term: 'Fixed-term',
  intern: 'Intern',
  apprentice: 'Apprentice',
  consultant: 'Consultant',
  deployed_contractor: 'Deployed contractor',
  retired_reemployed: 'Retired re-employed',
};

const scoped = (kind: MasterKind) => kind !== 'cost-centres';
const tree = (kind: MasterKind) => kind === 'departments' || kind === 'cost-centres';

/** Ids under `id` in a parent tree (itself included). */
export function subtree(rows: MasterRecord[], id: string): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rows) if (r.parentId && out.has(r.parentId) && !out.has(r.id)) (out.add(r.id), (grew = true));
  }
  return out;
}

const depthOf = (rows: MasterRecord[], r: MasterRecord): number => {
  let depth = 0;
  for (let p = r.parentId; p && depth < 20; depth++) p = rows.find((x) => x.id === p)?.parentId ?? null;
  return depth;
};

/* ---------- master editor ---------- */

interface Draft {
  name: string;
  code: string;
  ownership: 'shared' | 'entity_only';
  owner: string | null;
  appliesTo: string[];
  parentId: string | null;
  isDivision: boolean;
  jobFamily: string;
  rank: number | null;
  category: EmploymentCategory | null;
  legalEntityId: string | null;
}

/** The request body for `kind`, or what to fix (YX-ORG-05, YX-ORG-15). The API checks again. */
export function masterInput(kind: MasterKind, d: Draft): { input: MasterInput | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (!d.name.trim()) errors.push({ fieldId: 'm-name', message: 'Enter the name' });
  if (d.code && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/.test(d.code)) errors.push({ fieldId: 'm-code', message: 'Code: up to 30 letters, digits, - or _' });
  if (scoped(kind) && d.ownership === 'entity_only' && !d.owner) errors.push({ fieldId: 'm-owner', message: 'Choose the entity it belongs to' });
  if (kind === 'grades' && (d.rank == null || d.rank < 1 || d.rank > 1000)) errors.push({ fieldId: 'm-rank', message: 'Rank is 1 to 1000' });
  if (kind === 'employment-types' && !d.category) errors.push({ fieldId: 'm-category', message: 'Choose the category' });
  if (kind === 'cost-centres' && !d.legalEntityId) errors.push({ fieldId: 'm-entity', message: 'Choose the legal entity' });
  if (errors.length) return { input: null, errors };
  const input: MasterInput = { name: d.name.trim(), ...(d.code ? { code: d.code } : {}) };
  if (scoped(kind)) {
    input.ownerLegalEntityId = d.ownership === 'entity_only' ? d.owner : null;
    input.appliesToEntities = d.ownership === 'shared' ? d.appliesTo : [];
  }
  if (tree(kind)) input.parentId = d.parentId;
  if (kind === 'departments') input.isDivision = !d.parentId && d.isDivision;
  if (kind === 'designations') input.jobFamily = d.jobFamily.trim() || null;
  if (kind === 'grades') input.rank = d.rank!;
  if (kind === 'employment-types') input.category = d.category!;
  if (kind === 'cost-centres') input.legalEntityId = d.legalEntityId!;
  return { input, errors };
}

function MasterEditor({ kind, record, rows, entities, defaultOwnership, onClose, onSave }: { kind: MasterKind; record: MasterRecord | null; rows: MasterRecord[]; entities: LegalEntity[]; defaultOwnership: 'shared' | 'entity_only'; onClose: () => void; onSave: (input: MasterInput) => Promise<void> }) {
  const meta = KINDS.find((k) => k.kind === kind)!;
  const live = entities.filter((e) => !e.archivedAt);
  const [draft, setDraft] = useState<Draft>({
    name: record?.name ?? '',
    code: record?.code ?? '',
    ownership: record ? (record.ownerLegalEntityId ? 'entity_only' : 'shared') : defaultOwnership,
    owner: record?.ownerLegalEntityId ?? null,
    appliesTo: record?.appliesToEntities ?? [],
    parentId: record?.parentId ?? null,
    isDivision: record?.isDivision ?? false,
    jobFamily: record?.jobFamily ?? '',
    rank: record?.rank ?? null,
    category: record?.category ?? null,
    legalEntityId: record?.legalEntityId ?? live.find((e) => e.isDefault)?.id ?? null,
  });
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const { input, errors } = masterInput(kind, draft);
  const errorOf = (id: string) => (showErrors ? errors.find((e) => e.fieldId === id)?.message : undefined);
  const save = () => {
    if (!input) return setShowErrors(true);
    void run('save', () => onSave(input)).then((ok) => ok && onClose());
  };
  // Parents: active, not itself or below it; for departments, shared or owned by the same entity (YX-ORG-15);
  // for cost centres, in the same entity.
  const below = record ? subtree(rows, record.id) : new Set<string>();
  const owner = draft.ownership === 'entity_only' ? draft.owner : null;
  const parents = rows.filter(
    (r) => !r.archivedAt && !below.has(r.id) && (kind === 'cost-centres' ? r.legalEntityId === draft.legalEntityId : !r.ownerLegalEntityId || r.ownerLegalEntityId === owner),
  );
  const entityOptions = live.map((e) => ({ value: e.id, label: e.name }));
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title={record ? `Edit ${record.name}` : `Add ${meta.one}`}
      errors={errors}
      showErrors={showErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel={record ? 'Save changes' : `Add ${meta.one}`}
      onSave={save}
    >
      <FormSection title={meta.label.replace(/s$/, '')}>
        {kind === 'cost-centres' && (
          <FormField id="m-entity" label="Legal entity" required helper={record ? 'A cost centre stays with its entity.' : undefined} error={errorOf('m-entity')}>
            <Select value={draft.legalEntityId} onChange={(legalEntityId) => set({ legalEntityId, parentId: null })} options={entityOptions} disabled={Boolean(record)} aria-label="Legal entity" />
          </FormField>
        )}
        <FormField id="m-name" label="Name" required error={errorOf('m-name')}>
          <TextField value={draft.name} onChange={(name) => set({ name })} maxLength={200} />
        </FormField>
        <FormField id="m-code" label="Code" optional helper="Made from the name if left empty. Employees see the name, not the code." error={errorOf('m-code')}>
          <TextField value={draft.code} onChange={(code) => set({ code: code.trim() })} maxLength={30} />
        </FormField>
        {kind === 'designations' && (
          <FormField id="m-family" label="Job family" optional>
            <TextField value={draft.jobFamily} onChange={(jobFamily) => set({ jobFamily })} maxLength={100} />
          </FormField>
        )}
        {kind === 'grades' && (
          <FormField id="m-rank" label="Rank" required helper="Higher is more senior. Rules such as travel class use it." error={errorOf('m-rank')}>
            <NumberField value={draft.rank} onChange={(rank) => set({ rank })} min={1} max={1000} />
          </FormField>
        )}
        {kind === 'employment-types' && (
          <FormField id="m-category" label="Category" required helper="Sets the PF, ESI and gratuity rules the law applies." error={errorOf('m-category')}>
            <Select value={draft.category} onChange={(category) => set({ category })} options={EMPLOYMENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} aria-label="Category" />
          </FormField>
        )}
        {tree(kind) && (
          <FormField id="m-parent" label={kind === 'departments' ? 'Part of' : 'Parent cost centre'} optional>
            <Select value={draft.parentId} onChange={(parentId) => set({ parentId })} options={parents.map((p) => ({ value: p.id, label: p.name }))} clearable searchable placeholder="None (top level)" aria-label="Parent" />
          </FormField>
        )}
        {kind === 'departments' && !draft.parentId && (
          <Checkbox label="This is a division" description="Groups other departments in reports and the org chart." checked={draft.isDivision} onChange={(isDivision) => set({ isDivision })} />
        )}
      </FormSection>
      {scoped(kind) && (
        <FormSection title="Who can use it">
          <FormField label="Ownership">
            <Segment label="Ownership" options={[{ value: 'shared' as const, label: 'Shared' }, { value: 'entity_only' as const, label: 'One entity only' }]} value={draft.ownership} onChange={(ownership) => set({ ownership })} />
          </FormField>
          {draft.ownership === 'entity_only' ? (
            <FormField id="m-owner" label="Entity" required error={errorOf('m-owner')}>
              <Select value={draft.owner} onChange={(o) => set({ owner: o })} options={entityOptions} aria-label="Entity" />
            </FormField>
          ) : (
            <FormField id="m-applies" label="Limit to entities" optional helper="Leave empty for every entity.">
              <MultiSelect value={draft.appliesTo} onChange={(appliesTo) => set({ appliesTo })} options={entityOptions} aria-label="Limit to entities" placeholder="Every entity" />
            </FormField>
          )}
        </FormSection>
      )}
    </EditorDrawer>
  );
}

/* ---------- pay ranges (founder rule R1, P06) ---------- */

export interface PayAccess {
  canView: boolean;
  canManage: boolean;
  /** YYYY-MM-DD, India time: ranges starting after it may still change. */
  today: string;
  onLoad: (gradeId: string) => Promise<PayRange[]>;
  onCreate: (gradeId: string, input: PayRangeInput) => Promise<void>;
  onUpdate: (id: string, amounts: PayAmounts) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const money = (v: string, currency: string) => formatMoney(Number(v), currency);

export function payRangeErrors(d: { legalEntityId: string | null; currency: string; min: number | null; mid: number | null; max: number | null; validFrom: Date | null }): FormErrorItem[] {
  const errors: FormErrorItem[] = [];
  if (!d.legalEntityId) errors.push({ fieldId: 'pr-entity', message: 'Choose the legal entity' });
  if (!/^[A-Z]{3}$/.test(d.currency)) errors.push({ fieldId: 'pr-currency', message: 'Currency is a 3-letter code such as INR' });
  if (d.min == null || d.mid == null || d.max == null || d.min < 0) errors.push({ fieldId: 'pr-min', message: 'Enter minimum, midpoint and maximum' });
  else if (!(d.min <= d.mid && d.mid <= d.max)) errors.push({ fieldId: 'pr-min', message: 'Minimum ≤ midpoint ≤ maximum' });
  if (!d.validFrom) errors.push({ fieldId: 'pr-from', message: 'Choose the start date' });
  return errors;
}

function PayRangesDrawer({ grade, entities, pay, onClose }: { grade: MasterRecord; entities: LegalEntity[]; pay: PayAccess; onClose: () => void }) {
  const [ranges, setRanges] = useState<PayRange[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PayRange | 'new' | null>(null);
  const [form, setForm] = useState({ legalEntityId: null as string | null, currency: 'INR', min: null as number | null, mid: null as number | null, max: null as number | null, validFrom: null as Date | null });
  const [showErrors, setShowErrors] = useState(false);
  const [dialog, ask] = useConfirm();
  const { busy, error, run } = useRun();
  const load = () => pay.onLoad(grade.id).then(setRanges, (e) => setLoadError(errorText(e)));
  useEffect(() => {
    void load();
    // Each opening is one recorded look at pay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Entities that may use this grade (YX-ORG-15).
  const usable = entities.filter((e) => !e.archivedAt && (grade.ownerLegalEntityId ? e.id === grade.ownerLegalEntityId : !grade.appliesToEntities?.length || grade.appliesToEntities.includes(e.id)));
  const future = (r: PayRange) => r.validFrom > pay.today;
  const errors = editing === 'new' ? payRangeErrors(form) : payRangeErrors({ ...form, legalEntityId: 'x', validFrom: new Date() });
  const save = () => {
    if (errors.length) return setShowErrors(true);
    const amounts = { min: form.min!, mid: form.mid!, max: form.max! };
    const action = editing === 'new' ? () => pay.onCreate(grade.id, { legalEntityId: form.legalEntityId!, currency: form.currency, ...amounts, validFrom: dayKey(form.validFrom!) }) : () => pay.onUpdate((editing as PayRange).id, amounts);
    void run('save', async () => {
      await action();
      setEditing(null);
      setShowErrors(false);
      await load();
    });
  };
  const columns: TableColumn<PayRange>[] = [
    {
      key: 'when',
      header: 'Period',
      value: (r) => r.validFrom,
      render: (r) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{r.validTo ? `${dateLabel(r.validFrom)} – ${dateLabel(r.validTo)}` : `From ${dateLabel(r.validFrom)}`}</Text>
          <Text tone="secondary" size="sm">{entityName(entities, r.legalEntityId)} · {r.currency}</Text>
        </span>
      ),
      hideable: false,
    },
    { key: 'min', header: 'Minimum', type: 'number', value: (r) => Number(r.min), render: (r) => money(r.min, r.currency), width: 130 },
    { key: 'mid', header: 'Midpoint', type: 'number', value: (r) => Number(r.mid), render: (r) => money(r.mid, r.currency), width: 130, optional: true },
    { key: 'max', header: 'Maximum', type: 'number', value: (r) => Number(r.max), render: (r) => money(r.max, r.currency), width: 130 },
    {
      key: 'state',
      header: 'Status',
      value: (r) => r.validFrom,
      render: (r) => {
        if (future(r)) {
          const days = daysBetweenIso(pay.today, r.validFrom);
          return <Badge tone={days <= 7 ? 'warning' : 'info'}>{`Starts in ${days} day${days === 1 ? '' : 's'}`}</Badge>;
        }
        return r.validTo && r.validTo < pay.today ? <Badge tone="neutral">Ended</Badge> : <Badge tone="success">In force</Badge>;
      },
      width: 140,
      optional: true,
    },
  ];
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="lg" title={`Pay ranges · ${grade.name}`} subtitle="Annual amounts">
      <div className="yx-org__editor">
        <InlineAlert tone="info">Pay is private. Opening this list is recorded, and changes need you to confirm it’s you.</InlineAlert>
        {loadError && <ErrorState title="We couldn't load the pay ranges." description={loadError} onRetry={() => { setLoadError(null); void load(); }} />}
        {!ranges && !loadError && <Skeleton height={160} />}
        {ranges && (
          <DataTable
            label={`Pay ranges for ${grade.name}`}
            columns={columns}
            rows={ranges}
            getRowId={(r) => r.id}
            rowNoun={['range', 'ranges']}
            cardSummary
            empty={<EmptyState compact title="No pay range yet." description={pay.canManage ? 'Add the range offers and salary reviews are checked against.' : 'Nobody has set one for this grade.'} />}
            rowButtons={
              pay.canManage
                ? (r) =>
                    future(r) ? (
                      <>
                        <Button size="sm" onClick={() => { setEditing(r); setForm({ ...form, min: Number(r.min), mid: Number(r.mid), max: Number(r.max) }); }}>Edit</Button>
                        <Button size="sm" variant="danger" onClick={() => ask({ title: `Withdraw the range from ${dateLabel(r.validFrom)}?`, consequence: 'The range before it runs on in its place.', confirmLabel: 'Withdraw range', destructive: true, action: async () => { await pay.onDelete(r.id); await load(); } } satisfies Ask)}>
                          Withdraw
                        </Button>
                      </>
                    ) : null
                : undefined
            }
          />
        )}
        {pay.canManage && !editing && (
          <div>
            <Button onClick={() => { setEditing('new'); setForm({ legalEntityId: usable.length === 1 ? usable[0].id : null, currency: 'INR', min: null, mid: null, max: null, validFrom: null }); }} disabled={!usable.length}>
              Add range
            </Button>
          </div>
        )}
        {editing && (
          <form className="yx-org__editor" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
            <FormSection
              title={editing === 'new' ? 'New range' : `Change the range from ${dateLabel(editing.validFrom)}`}
              description={editing === 'new' ? 'A new range ends the current one the day before it starts. Ranges already in force stay as they were.' : undefined}
            >
              {showErrors && errors.length > 0 && <ErrorSummary errors={errors} />}
              {editing === 'new' && (
                <FieldRow>
                  <FormField id="pr-entity" label="Legal entity" required error={showErrors ? errors.find((e) => e.fieldId === 'pr-entity')?.message : undefined}>
                    <Select value={form.legalEntityId} onChange={(legalEntityId) => setForm({ ...form, legalEntityId })} options={usable.map((e) => ({ value: e.id, label: e.name }))} aria-label="Legal entity" />
                  </FormField>
                  <FormField id="pr-currency" label="Currency" required>
                    <TextField value={form.currency} onChange={(c) => setForm({ ...form, currency: c.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })} />
                  </FormField>
                  <FormField id="pr-from" label="Starts" required error={showErrors ? errors.find((e) => e.fieldId === 'pr-from')?.message : undefined}>
                    <DatePicker value={form.validFrom} onChange={(validFrom) => setForm({ ...form, validFrom })} aria-label="Starts" />
                  </FormField>
                </FieldRow>
              )}
              <FieldRow>
                <FormField id="pr-min" label="Minimum" required error={showErrors ? errors.find((e) => e.fieldId === 'pr-min')?.message : undefined}>
                  <NumberField value={form.min} onChange={(min) => setForm({ ...form, min })} min={0} />
                </FormField>
                <FormField id="pr-mid" label="Midpoint" required>
                  <NumberField value={form.mid} onChange={(mid) => setForm({ ...form, mid })} min={0} />
                </FormField>
                <FormField id="pr-max" label="Maximum" required>
                  <NumberField value={form.max} onChange={(max) => setForm({ ...form, max })} min={0} />
                </FormField>
              </FieldRow>
            </FormSection>
            {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
            <div className="yx-auth__row">
              <Button type="submit" variant="primary" loading={busy === 'save'}>{editing === 'new' ? 'Add range' : 'Save range'}</Button>
              <Button onClick={() => { setEditing(null); setShowErrors(false); }} disabled={busy === 'save'}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
      {dialog}
    </Drawer>
  );
}

/* ---------- screen ---------- */

export interface StructureScreenProps {
  state: LoadState;
  onRetry?: () => void;
  /** Active and archived, per kind. */
  masters: MasterLists;
  entities: LegalEntity[];
  canManage: boolean;
  /** The company's "new masters are" rule (YX-ORG-15). */
  defaultOwnership: 'shared' | 'entity_only';
  pay: PayAccess;
  /** Open on this tab. */
  initialKind?: MasterKind;
  onSave: (kind: MasterKind, id: string | null, input: MasterInput) => Promise<void>;
  onArchive: (kind: MasterKind, id: string) => Promise<void>;
  onRestore: (kind: MasterKind, id: string) => Promise<void>;
  onDelete: (kind: MasterKind, id: string) => Promise<void>;
}

/** Settings › Organisation › Structure (P01 §4.3; YX-ORG-03, 04, 05, 15). */
export function StructureScreen(props: StructureScreenProps) {
  const [kind, setKind] = useState<MasterKind>(props.initialKind ?? 'departments');
  const [editing, setEditing] = useState<{ record: MasterRecord | null; key: number } | null>(null);
  const [payFor, setPayFor] = useState<MasterRecord | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, ask] = useConfirm();
  const meta = KINDS.find((k) => k.kind === kind)!;
  const all = props.masters[kind];
  const rows = useMemo(() => all.filter((r) => showArchived || !r.archivedAt), [all, showArchived]);
  const byId = (id: string | null | undefined) => all.find((r) => r.id === id);

  const name: TableColumn<MasterRecord> = {
    key: 'name',
    header: meta.label.replace(/s$/, ''),
    value: (r) => r.name,
    render: (r) => (
      <span className="yx-auth__item-main" style={kind === 'departments' ? { paddingInlineStart: `calc(var(--yx-space-4) * ${depthOf(all, r)})` } : undefined}>
        <Text weight="medium">{r.name}</Text>
        <Text tone="secondary" size="sm">{r.code}</Text>
      </span>
    ),
    hideable: false,
  };
  const ownership: TableColumn<MasterRecord> = { key: 'ownership', header: 'Ownership', value: (r) => ownershipLabel(r, props.entities), width: 200, optional: true };
  const status: TableColumn<MasterRecord> = { key: 'status', header: 'Status', value: (r) => (r.archivedAt ? 'Archived' : 'Active'), render: (r) => <StatusBadge archived={Boolean(r.archivedAt)} />, width: 110, optional: true };
  const columns: Record<MasterKind, TableColumn<MasterRecord>[]> = {
    departments: [name, { key: 'parent', header: 'Part of', value: (r) => byId(r.parentId)?.name ?? (r.isDivision ? 'Division' : '—'), width: 170 }, ownership, status],
    designations: [name, { key: 'family', header: 'Job family', value: (r) => r.jobFamily ?? '—', width: 160 }, ownership, status],
    grades: [name, { key: 'rank', header: 'Rank', type: 'number', value: (r) => r.rank, width: 90 }, ownership, status],
    'employment-types': [name, { key: 'category', header: 'Category', value: (r) => (r.category ? CATEGORY_LABEL[r.category] : '—'), width: 170 }, ownership, status],
    'cost-centres': [name, { key: 'entity', header: 'Legal entity', value: (r) => entityName(props.entities, r.legalEntityId), width: 220 }, { key: 'parent', header: 'Parent', value: (r) => byId(r.parentId)?.name ?? '—', width: 170, optional: true }, status],
  };

  const add = <Button onClick={() => setEditing({ record: null, key: Date.now() })}>{`Add ${meta.one}`}</Button>;
  return (
    <OrgPage
      crumb="Structure"
      title="Structure"
      description="Departments, designations, grades, employment types and cost centres. Each is shared across entities or kept to one."
      state={props.state}
      onRetry={props.onRetry}
      what="the structure"
    >
      <Tabs value={kind} onValueChange={(v) => { setKind(v as MasterKind); setShowArchived(false); }}>
        <TabsList aria-label="Structure">
          {KINDS.map((k) => (
            <TabsTrigger key={k.kind} value={k.kind} count={props.masters[k.kind].filter((r) => !r.archivedAt).length}>
              {k.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {KINDS.map((k) => (
          <TabsContent key={k.kind} value={k.kind}>
            {k.kind === kind && (
              <section className="yx-auth__stack" aria-label={k.label}>
                <SectionHead
                  title={k.label}
                  description={k.description}
                  action={
                    <span className="yx-auth__row">
                      <ArchivedToggle checked={showArchived} onChange={setShowArchived} count={all.filter((r) => r.archivedAt).length} />
                      {props.canManage && add}
                    </span>
                  }
                />
                <DataTable
                  label={k.label}
                  columns={columns[kind]}
                  rows={rows}
                  getRowId={(r) => r.id}
                  rowNoun={[k.one, `${k.one}s`]}
                  cardSummary
                  empty={<EmptyState compact title={`No ${k.label.toLowerCase()} yet.`} description={k.description} action={props.canManage ? add : undefined} />}
                  rowActions={
                    props.canManage
                      ? (r) =>
                          lifecycleItems(
                            r.name,
                            Boolean(r.archivedAt),
                            ask,
                            { archive: () => props.onArchive(kind, r.id), restore: () => props.onRestore(kind, r.id), remove: () => props.onDelete(kind, r.id) },
                            tree(kind) ? 'It can no longer be chosen. Archive or move what sits under it first.' : 'It can no longer be chosen. People who have it keep it.',
                          )
                      : undefined
                  }
                  rowButtons={(r) => (
                    <>
                      {props.canManage && !r.archivedAt && <Button size="sm" onClick={() => setEditing({ record: r, key: Date.now() })}>Edit</Button>}
                      {kind === 'grades' && props.pay.canView && <Button size="sm" onClick={() => setPayFor(r)} aria-label={`Show pay for ${r.name}`}>Show pay</Button>}
                    </>
                  )}
                />
              </section>
            )}
          </TabsContent>
        ))}
      </Tabs>
      {dialog}
      {editing && (
        <MasterEditor
          key={editing.key}
          kind={kind}
          record={editing.record}
          rows={all}
          entities={props.entities}
          defaultOwnership={props.defaultOwnership}
          onClose={() => setEditing(null)}
          onSave={(input) => props.onSave(kind, editing.record?.id ?? null, input)}
        />
      )}
      {payFor && <PayRangesDrawer key={payFor.id} grade={payFor} entities={props.entities} pay={props.pay} onClose={() => setPayFor(null)} />}
    </OrgPage>
  );
}

