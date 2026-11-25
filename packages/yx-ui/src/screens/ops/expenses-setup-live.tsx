import { createContext, useContext, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { PlainTable } from '../../components/plain-table';
import { PageHeader } from '../../components/shell';
import { Checkbox } from '../../components/choice';
import { ConditionBuilder, emptyRule } from '../../components/condition';
import { DatePicker } from '../../components/date';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { ErrorSummary, FormField, StickySaveBar, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dayKey } from '../../lib/dates';
import { fromServerGroup, toServerGroup } from '../../lib/forms';
import type { Rule, RuleField } from '../../lib/rules';
import { errorText, useRun } from '../org/org-kit';
import { dateText } from '../time/live/kit';
import { useAct } from '../growth/perf-live';
import { Actions, OpsDesk } from './ops-kit';
import { day } from './expenses-live-data';
import { ANY, fromRows, sameRules, toRows, type MatrixRow, type Per } from './expenses-matrix';
import type { CategoryKind, Choice, CityTier, ExpenseCategory, ExpensePolicy, FxRateRow, GstRegistration, LoadState, OverLimit, Policies, PolicySave, Rates, SetupCheck, Taxable } from '../expenses/live/types';

// Settings › Expenses (M05-BUILD-DESIGN §6, §7; EXP-07 wired, XP-1.06): the limits matrix of each dated policy,
// categories, city tiers, mileage and per-diem rates, and GST registrations, with the set-up check on top. A policy
// already in force never changes in place: new limits are saved as a new version from a date (§7.1).

const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);
const KIND: Record<CategoryKind, string> = { spend: 'Spend with a bill', mileage: 'Mileage (worked out)', per_diem: 'Per diem (worked out)', company_paid_only: 'Company paid only' };
const TAXABLE: Record<Taxable, string> = { never: 'Not taxable', always: 'Always taxable', above_limit: 'Taxable above the limit' };
const PER: { value: Per; label: string }[] = [
  { value: 'none', label: 'Not allowed' },
  { value: 'free', label: 'No limit' },
  { value: 'line', label: 'Per bill' },
  { value: 'day', label: 'Per day' },
  { value: 'trip', label: 'Per trip' },
  { value: 'month', label: 'Per month' },
];
const OVER: { value: OverLimit; label: string }[] = [
  { value: 'justify_and_approve', label: 'Reason + extra approval' },
  { value: 'block', label: 'Hard block' },
];
const VEHICLES: Choice[] = [
  { value: 'car', label: 'Car' },
  { value: 'two_wheeler', label: 'Two-wheeler' },
  { value: 'ev_car', label: 'Electric car' },
  { value: 'ev_two_wheeler', label: 'Electric two-wheeler' },
  { value: 'other', label: 'Other' },
];
const BLOCKED: Choice[] = [
  { value: 'food_beverages', label: 'Food and drink' },
  { value: 'rent_a_cab', label: 'Cab hire' },
  { value: 'club_membership', label: 'Club membership' },
  { value: 'travel_benefits_holiday', label: 'Holiday travel for employees' },
  { value: 'beauty_health', label: 'Beauty and health services' },
  { value: 'motor_vehicle', label: 'Motor vehicles' },
  { value: 'other_blocked', label: 'Other blocked credit' },
];

export type CategoryInput = Omit<ExpenseCategory, 'id' | 'version' | 'shownName'> & { id?: string; version?: number };
export type TierInput = Omit<CityTier, 'id' | 'version'> & { id?: string; version?: number };

export interface ExpenseSetupScreenProps {
  state: LoadState;
  onRetry?: () => void;
  check: SetupCheck | null;
  categories: ExpenseCategory[];
  tiers: CityTier[];
  policies: Policies | null;
  rates: Rates | null;
  gst: GstRegistration[];
  entities: Choice[];
  onUseStarters: () => Promise<unknown>;
  onSaveCategory: (c: CategoryInput) => Promise<unknown>;
  onSaveTier: (t: TierInput) => Promise<unknown>;
  onSavePolicy: (s: PolicySave) => Promise<unknown>;
  onAddMileage: (r: { vehicle: string; ratePerKm: string; monthlyKmCap: number | null; validFrom: string }) => Promise<unknown>;
  onAddPerDiem: (r: { tierId: string | null; country: string | null; ratePerDay: string; currency: string; partialDayRule: 'full' | 'half_after_hours'; validFrom: string }) => Promise<unknown>;
  onAddGst: (r: { legalEntityId: string; gstin: string; validFrom: string }) => Promise<unknown>;
  onEndGst: (id: string, validTo: string) => Promise<unknown>;
  /** E5: the company's own exchange-rate table (FBIL and ECB feeds stay off until their reuse terms are confirmed). */
  fxRates?: FxRateRow[];
  payCurrency?: string;
  onAddFxRate?: (r: { base: string; quote: string; rateDate: string; rate: string }) => Promise<unknown>;
  /** False for someone with expense.policy.view only (HR, founder 3 Nov 2026): every edit control is hidden. */
  canEdit?: boolean;
}

/** Read only (expense.policy.view without expense.policy.manage): the tabs hide their add, edit and end buttons. */
const CanEdit = createContext(true);

export type PolicyTab = 'matrix' | 'rates' | 'rules' | 'tiers' | 'gst' | 'fx';
export type PolicySheet = 'copy' | 'category' | 'tier' | 'mileage' | 'gst' | null;

/** EXP-07 live: the designed Expense policy page with the company's set-up (founder answer 6). */
export function LivePolicyScreen({ live: p, defaultTab = 'matrix', defaultSheet = null }: { live: ExpenseSetupScreenProps; defaultTab?: PolicyTab; defaultSheet?: PolicySheet }) {
  const { busy, act } = useAct();
  const [tab, setTab] = useState<PolicyTab>(defaultTab);
  if (p.state !== 'ready')
    return (
      <OpsDesk area="expenses" active="Expense policy">
        <PageHeader title="Expense policy" />
        {p.state === 'loading' ? (
          <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading expense policy">
            <Skeleton height={64} />
            <Skeleton height={240} />
          </div>
        ) : p.state === 'no-access' ? (
          <NoAccessState what="the expense policy" grantedBy="your System Admin" />
        ) : (
          <ErrorState title="We couldn't load the expense policy." description="Nothing has changed. Try again in a moment." onRetry={p.onRetry} />
        )}
      </OpsDesk>
    );
  const noCategories = p.categories.length === 0;
  const today = p.policies?.today ?? dayKey(new Date());
  const canEdit = p.canEdit !== false;
  return (
    <CanEdit.Provider value={canEdit}>
    <OpsDesk area="expenses" active="Expense policy">
      <PageHeader title="Expense policy" description="Limits by category, grade and city tier, with the rates, categories and registrations they use. Dated versions; claims use the version valid on the expense date." status={canEdit ? undefined : <Badge tone="neutral">Read only</Badge>} />
      {noCategories ? (
        <Card title="Start from the YukthiX starters">
          <p className="yx-ops-p">Eleven categories, four city tiers, a company-wide policy with limits, and mileage and per-diem rates. Your copy is yours: later YukthiX changes never overwrite it.</p>
          {canEdit ? (
            <Actions>
              <Button variant="primary" loading={busy === 'starters'} onClick={() => void act('starters', p.onUseStarters, 'Starters copied. Check the limits and rates for your company.')}>
                Use the starters
              </Button>
            </Actions>
          ) : (
            <p className="yx-ops-muted">Expenses are not set up yet. Whoever manages the expense policy starts from the starters.</p>
          )}
        </Card>
      ) : (
        <>
          {p.check && <SetupCheckCard check={p.check} />}
          <Tabs value={tab} onValueChange={(v) => setTab(v as PolicyTab)}>
            <TabsList aria-label="Policy sections">
              <TabsTrigger value="matrix">Limits matrix</TabsTrigger>
              <TabsTrigger value="rates">Mileage & per diem</TabsTrigger>
              <TabsTrigger value="rules">Receipts & over-limit</TabsTrigger>
              <TabsTrigger value="tiers">City tiers</TabsTrigger>
              <TabsTrigger value="gst">GST registrations</TabsTrigger>
              {p.onAddFxRate && <TabsTrigger value="fx">Exchange rates</TabsTrigger>}
            </TabsList>
            <TabsContent value="matrix">{p.policies && <LimitsTab {...p} policies={p.policies} startCopy={defaultSheet === 'copy'} />}</TabsContent>
            <TabsContent value="rates">{p.rates && <RatesTab rates={p.rates} tiers={p.tiers} today={today} onAddMileage={p.onAddMileage} onAddPerDiem={p.onAddPerDiem} start={defaultSheet === 'mileage'} />}</TabsContent>
            <TabsContent value="rules">
              <CategoriesTab categories={p.categories} onSave={p.onSaveCategory} start={defaultSheet === 'category'} />
            </TabsContent>
            <TabsContent value="tiers">
              <TiersTab tiers={p.tiers} onSave={p.onSaveTier} start={defaultSheet === 'tier'} />
            </TabsContent>
            <TabsContent value="gst">
              <GstTab gst={p.gst} entities={p.entities} today={today} onAdd={p.onAddGst} onEnd={p.onEndGst} start={defaultSheet === 'gst'} />
            </TabsContent>
            {p.onAddFxRate && (
              <TabsContent value="fx">
                <FxTab rows={p.fxRates ?? []} payCurrency={p.payCurrency ?? 'INR'} today={today} onAdd={p.onAddFxRate} />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </OpsDesk>
    </CanEdit.Provider>
  );
}

function SetupCheckCard({ check }: { check: SetupCheck }) {
  if (check.ready) return <InlineAlert tone="info" title="Ready for claims">Every employee has a policy, and every category has a ledger code and the rates it needs.</InlineAlert>;
  return (
    <InlineAlert tone="warning" title={`${check.problems.length} ${check.problems.length === 1 ? 'thing needs' : 'things need'} attention before claims`}>
      <ul className="yx-ops-plain">
        {check.problems.map((x) => (
          <li key={x.key}>{x.text}</li>
        ))}
      </ul>
    </InlineAlert>
  );
}

// ------------------------------------------------------------------------------------------ limits (EXP-07)

const policyLabel = (x: ExpensePolicy) => `${x.name} · from ${dateText(x.validFrom)}${x.validTo ? ` to ${dateText(x.validTo)}` : ''}${x.status === 'retired' ? ' (retired)' : ''}`;

/** Founder answer 6: a policy that applies to exactly one grade gets a column in the grade picker; the grade's name. */
export function singleGrade(p: ExpensePolicy, fields: Policies['fields']): { id: string; name: string } | null {
  const items = (p.appliesIf?.items ?? []) as { field?: string; operator?: string; value?: unknown; items?: unknown }[];
  if (items.length !== 1 || items[0]!.items || items[0]!.field !== 'grade_id') return null;
  const v = items[0]!.value;
  const id = Array.isArray(v) ? (v.length === 1 ? String(v[0]) : null) : items[0]!.operator === 'is' && v != null ? String(v) : null;
  if (!id) return null;
  return { id, name: fields.find((f) => f.key === 'grade_id')?.options.find((o) => o.value === id)?.label ?? 'A grade' };
}
const inForceOn = (x: ExpensePolicy, today: string) => x.status === 'active' && x.validFrom <= today && (!x.validTo || x.validTo >= today);

function LimitsTab(p: ExpenseSetupScreenProps & { policies: Policies; startCopy: boolean }) {
  const { policies, fields, today } = p.policies;
  const graded = policies.filter((x) => x.status === 'active' && singleGrade(x, fields));
  const others = policies.filter((x) => !graded.includes(x));
  const first = graded.find((x) => inForceOn(x, today)) ?? graded[0] ?? others.find((x) => inForceOn(x, today)) ?? policies[0];
  const [id, setId] = useState<string | null>(first?.id ?? null);
  const policy = policies.find((x) => x.id === id) ?? first;
  if (!policy) return <EmptyState compact title="No policy yet." description="Use the starters, or copy a policy." />;
  const grade = singleGrade(policy, fields);
  const canEdit = useContext(CanEdit);
  return (
    <div className="yx-ops-stack">
      <PolicyMatrix
        key={`${policy.id}:${policy.version}`}
        {...p}
        fields={fields}
        today={today}
        policy={policy}
        startCopy={p.startCopy}
        picker={
          graded.length ? (
            <FormField label="Grade band">
              <Select aria-label="Grade band" value={grade ? policy.id : null} onChange={(v) => v && setId(v)} placeholder="Another policy (below)" options={graded.map((x) => ({ value: x.id, label: `${singleGrade(x, fields)!.name} · ${policyLabel(x)}` }))} />
            </FormField>
          ) : null
        }
      />
      <Card title="Other policies">
        <DataTable
          label="Other policies"
          columns={[
            { key: 'n', header: 'Policy', value: (x: ExpensePolicy) => x.name, width: 240 },
            { key: 'a', header: 'Applies to', value: (x) => (x.appliesIf ? (singleGrade(x, fields)?.name ?? 'Some people (conditions)') : 'Everyone without a narrower policy') },
            { key: 'f', header: 'From', type: 'date', value: (x) => day(x.validFrom) },
            { key: 's', header: 'Status', value: (x) => x.status, render: (x) => <Badge tone={inForceOn(x, today) ? 'success' : x.status === 'retired' ? 'neutral' : 'info'}>{inForceOn(x, today) ? 'In force' : x.status === 'retired' ? 'Retired' : x.validFrom > today ? `Starts ${dateText(x.validFrom)}` : 'Ended'}</Badge> },
          ]}
          rows={others}
          getRowId={(x) => x.id}
          rowNoun={['policy', 'policies']}
          empty={<EmptyState compact title="Every policy applies to one grade." description="They are all in the grade band list above." />}
          rowButtons={(x) => (x.id === policy.id ? <Badge tone="info">Shown above</Badge> : <Button size="sm" onClick={() => setId(x.id)}>{canEdit ? 'Edit limits' : 'Show limits'}</Button>)}
        />
      </Card>
    </div>
  );
}

function PolicyMatrix(p: ExpenseSetupScreenProps & { fields: Policies['fields']; today: string; policy: ExpensePolicy; picker: React.ReactNode; startCopy: boolean }) {
  const { policy, today } = p;
  const inForce = policy.validFrom <= today;
  const [rows, setRows] = useState<MatrixRow[]>(() => toRows(policy.rules, p.categories));
  const [from, setFrom] = useState<Date | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(p.startCopy);
  const { toast } = useAct();
  const parsed = fromRows(rows);
  const dirty = 'rules' in parsed ? !sameRules(parsed.rules, policy.rules) : true;
  const errors = [
    ...('problem' in parsed ? [{ fieldId: `lim-${parsed.code}`, message: parsed.problem }] : []),
    ...(inForce && !from ? [{ fieldId: 'lim-from', message: 'Choose the day the new limits start.' }] : []),
    ...(inForce && from && dayKey(from) <= policy.validFrom ? [{ fieldId: 'lim-from', message: `The new limits must start after ${dateText(policy.validFrom)}.` }] : []),
  ];
  const v = useSaveErrors(errors);
  const edit = (code: string, patch: Partial<MatrixRow>) => setRows(rows.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  const save = async () => {
    if (errors.length || !('rules' in parsed)) {
      v.reveal();
      document.getElementById(errors[0]?.fieldId ?? '')?.focus();
      return;
    }
    setSaving(true);
    setFailed(null);
    try {
      await p.onSavePolicy(inForce ? { mode: 'version', policy: { ...policy, rules: parsed.rules }, from: dayKey(from!) } : { mode: 'update', policy: { ...policy, rules: parsed.rules } });
      toast({ tone: 'success', title: inForce ? `Saved as version ${policy.version + 1} from ${dateText(dayKey(from!))}` : 'Limits saved' });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const tiers = p.tiers.filter((t) => t.active);
  const cols = [{ id: ANY, name: 'Any city' }, ...tiers.map((t) => ({ id: t.id, name: t.name }))];
  const grade = singleGrade(policy, p.fields);
  const canEdit = useContext(CanEdit);
  const perText = (r: MatrixRow) => PER.find((x) => x.value === r.per)?.label ?? r.per;
  return (
    <div className="yx-ops-stack">
      <div className="yx-ops-row">
        {p.picker}
        <Badge tone={inForce ? 'success' : 'info'}>{`v${policy.version}, ${inForce ? `from ${dateText(policy.validFrom)}` : `starts ${dateText(policy.validFrom)}`}`}</Badge>
        <span className="yx-ops-muted">{grade ? `${policy.name}: ${grade.name}` : policy.appliesIf ? `${policy.name}: some people (see below)` : `${policy.name}: everyone without a narrower policy`}</span>
      </div>
      {policy.appliesIf && !grade && <ConditionBuilder schema={{ triggers: [], fields: p.fields as RuleField[], recipients: [] }} value={{ ...emptyRule(), conditions: fromServerGroup(policy.appliesIf as never, p.fields as RuleField[]) }} parts={['if']} readOnly />}
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      <PlainTable
        label={`Limits of ${policy.name}`}
        rows={rows}
        getRowId={(r) => r.code}
        columns={[
          { key: 'category', header: 'Category', rowHeader: true, cell: (r) => <span id={`lim-${r.code}`}>{r.name}</span> },
          { key: 'per', header: 'Limit', cell: (r) => (canEdit ? <Select aria-label={`${r.name}: limit`} value={r.per} onChange={(x) => x && edit(r.code, { per: x as Per })} options={PER} /> : perText(r)) },
          ...cols.map((c) => ({
            key: c.id,
            header: c.name,
            cell: (r: MatrixRow) =>
              r.per !== 'none' && r.per !== 'free' && !canEdit ? (
                <span>{r.cells[c.id] ? `₹${Number(r.cells[c.id]).toLocaleString('en-IN')}` : c.id === ANY ? 'Not allowed' : 'As any city'}</span>
              ) : r.per !== 'none' && r.per !== 'free' ? (
                <TextField aria-label={`${r.name}, ${c.name}`} inputMode="decimal" value={r.cells[c.id] ?? ''} placeholder={c.id === ANY ? 'Not allowed' : 'As any city'} onChange={(x) => edit(r.code, { cells: { ...r.cells, [c.id]: x.replace(/[^0-9.]/g, '') } })} />
              ) : (
                <span className="yx-ops-muted">{r.per === 'free' ? 'No limit' : '—'}</span>
              ),
          })),
          { key: 'over', header: 'Over the limit', cell: (r) => (r.per === 'none' ? <span className="yx-ops-muted">—</span> : !canEdit ? <Badge tone={r.overLimit === 'block' ? 'danger' : 'neutral'}>{OVER.find((x) => x.value === r.overLimit)?.label}</Badge> : <Select aria-label={`${r.name}: over the limit`} value={r.overLimit} onChange={(x) => x && edit(r.code, { overLimit: x as OverLimit })} options={OVER} />) },
        ]}
      />
      <p className="yx-ops-muted">An empty tier cell uses the "Any city" amount; both empty means not allowed there. Over a limit, the employee gives a reason and the excess gets an extra approval, unless it is a hard block. Tiers are editable in City tiers.</p>
      {canEdit && (
        <Actions>
          <Button icon={Plus} onClick={() => setCopying(true)}>
            Copy as a new policy
          </Button>
        </Actions>
      )}
      {canEdit && dirty && (
        <StickySaveBar dirty>
          {inForce && (
            <FormField id="lim-from" label="Effective from" hideLabel error={v.errorOf('lim-from')}>
              <DatePicker value={from} onChange={setFrom} min={day(today)} aria-label="Effective from" />
            </FormField>
          )}
          <Button onClick={() => (setRows(toRows(policy.rules, p.categories)), setFrom(null))}>Discard</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {inForce ? `Save as v${policy.version + 1}` : 'Save limits'}
          </Button>
        </StickySaveBar>
      )}
      {canEdit && copying && <CopyPolicyDrawer policy={policy} rules={'rules' in parsed ? parsed.rules : policy.rules} fields={p.fields} today={today} onClose={() => setCopying(false)} onSave={p.onSavePolicy} />}
    </div>
  );
}

function CopyPolicyDrawer({ policy, rules, fields, today, onClose, onSave }: { policy: ExpensePolicy; rules: ExpensePolicy['rules']; fields: Policies['fields']; today: string; onClose: () => void; onSave: ExpenseSetupScreenProps['onSavePolicy'] }) {
  const ruleFields = fields as RuleField[];
  const [name, setName] = useState(`${policy.name} (copy)`);
  const [everyone, setEveryone] = useState(false);
  const [applies, setApplies] = useState<Rule>({ ...emptyRule(), conditions: fromServerGroup(policy.appliesIf as never, ruleFields) });
  const [priority, setPriority] = useState<number | null>(Math.max(1, policy.priority - 10));
  const [from, setFrom] = useState<Date | null>(fromKey(today));
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = [
    ...(name.trim().length >= 2 ? [] : [{ fieldId: 'cp-name', message: 'Give the policy a name.' }]),
    ...(from ? [] : [{ fieldId: 'cp-from', message: 'Choose the start date.' }]),
    ...(!everyone && applies.conditions.items.length === 0 ? [{ fieldId: 'cp-applies', message: 'Say who it applies to, or choose Everyone.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ mode: 'create', policy: { name: name.trim(), appliesIf: everyone ? null : (toServerGroup(applies.conditions) as never), priority: priority ?? 100, validFrom: dayKey(from!), validTo: null, status: 'active', rules } });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Copy as a new policy"
      subtitle="The copy starts with these limits. Narrow it to a grade band, an entity or a location; the most specific policy wins."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save policy
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <FormField id="cp-name" label="Name" required error={v.errorOf('cp-name')}>
        <TextField value={name} onChange={setName} maxLength={100} />
      </FormField>
      <FormField id="cp-applies" label="Applies to" error={v.errorOf('cp-applies')}>
        <Segment label="Applies to" value={everyone ? 'all' : 'some'} onChange={(x) => setEveryone(x === 'all')} options={[{ value: 'all', label: 'Everyone' }, { value: 'some', label: 'Only some people' }]} />
      </FormField>
      {!everyone && <ConditionBuilder schema={{ triggers: [], fields: ruleFields, recipients: [] }} value={applies} onChange={setApplies} parts={['if']} />}
      <div className="yx-field-row">
        <FormField id="cp-priority" label="Priority" helper="When two policies are as specific, the lower number wins.">
          <NumberField value={priority} onChange={setPriority} min={1} max={1000} />
        </FormField>
        <FormField id="cp-from" label="Starts on" required error={v.errorOf('cp-from')}>
          <DatePicker value={from} onChange={setFrom} aria-label="Starts on" />
        </FormField>
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ categories

function CategoriesTab({ categories, onSave, start }: { categories: ExpenseCategory[]; onSave: ExpenseSetupScreenProps['onSaveCategory']; start?: boolean }) {
  const canEdit = useContext(CanEdit);
  const [editing, setEditing] = useState<CategoryInput | null>(start && categories[0] ? { ...categories[0] } : null);
  const columns: TableColumn<ExpenseCategory>[] = [
    { key: 'name', header: 'Category', value: (r) => r.name, render: (r) => <Text>{r.name}</Text>, width: 220, hideable: false },
    { key: 'kind', header: 'Kind', value: (r) => KIND[r.kind], width: 180 },
    { key: 'receipt', header: 'Receipt needed', value: (r) => (r.kind === 'mileage' || r.kind === 'per_diem' ? 'Worked out' : r.receiptAbove === null ? 'Always' : `Above ₹${Number(r.receiptAbove).toLocaleString('en-IN')}`), width: 150 },
    { key: 'gst', header: 'GST', value: (r) => (!r.gstEligible ? 'No' : r.itcBlockedReason ? 'Captured, credit blocked' : 'Input credit'), width: 170 },
    { key: 'ledger', header: 'Ledger code', value: (r) => r.ledgerCode ?? '', render: (r) => (r.ledgerCode ? <Text>{r.ledgerCode}</Text> : <Badge tone="warning">Not mapped</Badge>), width: 160 },
    { key: 'status', header: 'Status', value: (r) => (r.active ? 'In use' : 'Not in use'), width: 110, optional: true },
  ];
  return (
    <div className="yx-ops-stack">
      {canEdit && (
        <div className="yx-ops-row">
          <Button icon={Plus} onClick={() => setEditing({ code: '', name: '', kind: 'spend', receiptAbove: '500', gstEligible: false, itcBlockedReason: null, taxable: 'never', ledgerCode: null, active: true })}>
            Add a category
          </Button>
        </div>
      )}
      <DataTable label="Expense categories" columns={columns} rows={categories} getRowId={(r) => r.id} rowNoun={['category', 'categories']} cardSummary rowButtons={canEdit ? (r) => <Button size="sm" onClick={() => setEditing({ ...r })}>Edit</Button> : undefined} />
      {editing && (
        <CategoryDrawer
          value={editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            await onSave(c);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryDrawer({ value, onClose, onSave }: { value: CategoryInput; onClose: () => void; onSave: (c: CategoryInput) => Promise<void> }) {
  const [c, setC] = useState(value);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<CategoryInput>) => setC({ ...c, ...patch });
  const computed = c.kind === 'mileage' || c.kind === 'per_diem';
  const errors = [
    ...(/^[a-z][a-z0-9_]{1,29}$/.test(c.code) ? [] : [{ fieldId: 'cat-code', message: 'Use 2–30 lower-case letters, digits and _ for the code.' }]),
    ...(c.name.trim().length >= 2 ? [] : [{ fieldId: 'cat-name', message: 'Give the category a name.' }]),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ ...c, name: c.name.trim(), receiptAbove: computed ? null : c.receiptAbove, itcBlockedReason: c.gstEligible ? c.itcBlockedReason : null, ledgerCode: c.ledgerCode?.trim() || null });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={value.id ? `Edit ${value.name}` : 'Add a category'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save category
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <FormField id="cat-name" label="Name" required error={v.errorOf('cat-name')}>
        <TextField value={c.name} onChange={(x) => set({ name: x })} maxLength={80} />
      </FormField>
      <FormField id="cat-code" label="Code" required error={v.errorOf('cat-code')} helper={value.id ? 'A category keeps its code.' : 'Used in reports and the journal, e.g. hotel_stay.'}>
        <TextField value={c.code} onChange={(x) => set({ code: x.trim().toLowerCase() })} maxLength={30} readOnly={Boolean(value.id)} />
      </FormField>
      <FormField id="cat-kind" label="Kind">
        <Select aria-label="Kind" value={c.kind} onChange={(x) => x && set({ kind: x as CategoryKind })} options={(Object.keys(KIND) as CategoryKind[]).map((k) => ({ value: k, label: KIND[k] }))} />
      </FormField>
      {!computed && (
        <FormField id="cat-receipt" label="Receipt needed above (₹)" optional helper="Leave empty to always ask for a receipt. Below it, the employee declares the spend.">
          <TextField value={c.receiptAbove ?? ''} onChange={(x) => set({ receiptAbove: x.replace(/[^0-9.]/g, '') || null })} inputMode="decimal" maxLength={14} />
        </FormField>
      )}
      <FormField id="cat-tax" label="Income tax">
        <Select aria-label="Income tax" value={c.taxable} onChange={(x) => x && set({ taxable: x as Taxable })} options={(Object.keys(TAXABLE) as Taxable[]).map((k) => ({ value: k, label: TAXABLE[k] }))} />
      </FormField>
      <Checkbox checked={c.gstEligible} onChange={(x) => set({ gstEligible: x, itcBlockedReason: x ? c.itcBlockedReason : null })} label="Capture GST on these bills" />
      {c.gstEligible && (
        <FormField id="cat-blocked" label="Input credit" optional helper="Some kinds of spend get no GST credit whatever the bill says.">
          <Select aria-label="Input credit" value={c.itcBlockedReason} onChange={(x) => set({ itcBlockedReason: x })} options={BLOCKED} clearable placeholder="Credit can be claimed" />
        </FormField>
      )}
      <FormField id="cat-ledger" label="Ledger code" optional helper="The expense account in your books. Without it, journal lines wait in Unmapped.">
        <TextField value={c.ledgerCode ?? ''} onChange={(x) => set({ ledgerCode: x })} maxLength={40} />
      </FormField>
      <Checkbox checked={c.active} onChange={(x) => set({ active: x })} label="In use" />
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ city tiers

function TiersTab({ tiers, onSave, start }: { tiers: CityTier[]; onSave: ExpenseSetupScreenProps['onSaveTier']; start?: boolean }) {
  const canEdit = useContext(CanEdit);
  const [editing, setEditing] = useState<TierInput | null>(start && tiers[0] ? { ...tiers[0] } : null);
  const columns: TableColumn<CityTier>[] = [
    { key: 'name', header: 'Tier', value: (r) => r.name, width: 160, hideable: false },
    { key: 'cities', header: 'Cities', value: (r) => (r.cities.length ? r.cities.join(', ') : r.country === 'IN' ? 'Every other city in India' : r.country ? `Every city in ${r.country}` : 'Any city outside India'), width: 420 },
    { key: 'status', header: 'Status', value: (r) => (r.active ? 'In use' : 'Not in use'), width: 110, optional: true },
  ];
  return (
    <div className="yx-ops-stack">
      {canEdit && (
        <div className="yx-ops-row">
          <Button icon={Plus} onClick={() => setEditing({ name: '', rank: tiers.length + 1, country: 'IN', cities: [], active: true })}>
            Add a tier
          </Button>
        </div>
      )}
      <DataTable label="City tiers" columns={columns} rows={tiers} getRowId={(r) => r.id} rowNoun={['tier', 'tiers']} cardSummary rowButtons={canEdit ? (r) => <Button size="sm" onClick={() => setEditing({ ...r })}>Edit</Button> : undefined} />
      {editing && (
        <TierDrawer
          value={editing}
          onClose={() => setEditing(null)}
          onSave={async (t) => {
            await onSave(t);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TierDrawer({ value, onClose, onSave }: { value: TierInput; onClose: () => void; onSave: (t: TierInput) => Promise<void> }) {
  const [name, setName] = useState(value.name);
  const [rank, setRank] = useState<number | null>(value.rank);
  const [india, setIndia] = useState(value.country === 'IN');
  const [cities, setCities] = useState(value.cities.join('\n'));
  const [active, setActive] = useState(value.active);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = [...(name.trim().length >= 2 ? [] : [{ fieldId: 'tier-name', message: 'Give the tier a name.' }]), ...(rank ? [] : [{ fieldId: 'tier-rank', message: 'Give the tier an order number.' }])];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ ...value, name: name.trim(), rank: rank!, country: india ? 'IN' : null, cities: cities.split(/[\n,]/).map((x) => x.trim()).filter(Boolean), active });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={value.id ? `Edit ${value.name}` : 'Add a city tier'}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save tier
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <FormField id="tier-name" label="Name" required error={v.errorOf('tier-name')}>
        <TextField value={name} onChange={setName} maxLength={60} />
      </FormField>
      <FormField id="tier-rank" label="Order" required error={v.errorOf('tier-rank')}>
        <NumberField value={rank} onChange={setRank} min={1} max={99} />
      </FormField>
      <FormField id="tier-where" label="Where">
        <Segment label="Where" value={india ? 'in' : 'abroad'} onChange={(x) => setIndia(x === 'in')} options={[{ value: 'in', label: 'India' }, { value: 'abroad', label: 'Outside India' }]} />
      </FormField>
      <FormField id="tier-cities" label="Cities" optional helper="One per line. Leave empty for every other city there. A city can be in one tier only.">
        <TextArea value={cities} onChange={setCities} rows={6} />
      </FormField>
      <Checkbox checked={active} onChange={setActive} label="In use" />
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ rates

function RatesTab({ rates, tiers, today, onAddMileage, onAddPerDiem, start }: { rates: Rates; tiers: CityTier[]; today: string; onAddMileage: ExpenseSetupScreenProps['onAddMileage']; onAddPerDiem: ExpenseSetupScreenProps['onAddPerDiem']; start?: boolean }) {
  const canEdit = useContext(CanEdit);
  const [adding, setAdding] = useState<'mileage' | 'per_diem' | null>(start ? 'mileage' : null);
  const tierName = useMemo(() => new Map(tiers.map((t) => [t.id, t.name])), [tiers]);
  const until = (to: string | null) => (to ? dateText(to) : 'Open');
  const mileage: TableColumn<Rates['mileage'][number]>[] = [
    { key: 'vehicle', header: 'Vehicle', value: (r) => VEHICLES.find((x) => x.value === r.vehicle)?.label ?? r.vehicle, width: 180, hideable: false },
    { key: 'rate', header: 'Rate per km', value: (r) => `${r.currency} ${r.ratePerKm}`, width: 140 },
    { key: 'cap', header: 'Monthly km limit', value: (r) => (r.monthlyKmCap ? `${r.monthlyKmCap} km` : 'None'), width: 150 },
    { key: 'from', header: 'From', value: (r) => dateText(r.validFrom), width: 130 },
    { key: 'to', header: 'To', value: (r) => until(r.validTo), width: 130 },
  ];
  const perDiem: TableColumn<Rates['perDiem'][number]>[] = [
    { key: 'place', header: 'Where', value: (r) => (r.tierId ? (tierName.get(r.tierId) ?? 'Tier') : (r.country ?? '')), width: 180, hideable: false },
    { key: 'rate', header: 'Rate per day', value: (r) => `${r.currency} ${r.ratePerDay}`, width: 140 },
    { key: 'partial', header: 'First and last day', value: (r) => (r.partialDayRule === 'full' ? 'Full rate' : 'Half rate'), width: 160 },
    { key: 'from', header: 'From', value: (r) => dateText(r.validFrom), width: 130 },
    { key: 'to', header: 'To', value: (r) => until(r.validTo), width: 130 },
  ];
  return (
    <div className="yx-ops-stack">
      <Card title="Mileage (own vehicle)" actions={canEdit ? <Button size="sm" icon={Plus} onClick={() => setAdding('mileage')}>Add a rate</Button> : undefined}>
        <DataTable label="Mileage rates" columns={mileage} rows={rates.mileage} getRowId={(r) => r.id} rowNoun={['rate', 'rates']} cardSummary />
      </Card>
      <Card title="Per diem" actions={canEdit ? <Button size="sm" icon={Plus} onClick={() => setAdding('per_diem')}>Add a rate</Button> : undefined}>
        <DataTable label="Per-diem rates" columns={perDiem} rows={rates.perDiem} getRowId={(r) => r.id} rowNoun={['rate', 'rates']} cardSummary />
      </Card>
      {adding && <RateDrawer kind={adding} tiers={tiers} today={today} onClose={() => setAdding(null)} onAddMileage={onAddMileage} onAddPerDiem={onAddPerDiem} />}
    </div>
  );
}

function RateDrawer({ kind, tiers, today, onClose, onAddMileage, onAddPerDiem }: { kind: 'mileage' | 'per_diem'; tiers: CityTier[]; today: string; onClose: () => void; onAddMileage: ExpenseSetupScreenProps['onAddMileage']; onAddPerDiem: ExpenseSetupScreenProps['onAddPerDiem'] }) {
  const [vehicle, setVehicle] = useState<string | null>('car');
  const [where, setWhere] = useState<'tier' | 'country'>('tier');
  const [tierId, setTierId] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [rate, setRate] = useState('');
  const [cap, setCap] = useState<number | null>(null);
  const [half, setHalf] = useState(true);
  const [from, setFrom] = useState<Date | null>(fromKey(today));
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = [
    ...(/^\d{1,6}(\.\d{1,2})?$/.test(rate.trim()) && Number(rate) > 0 ? [] : [{ fieldId: 'rate-amount', message: 'Enter the rate.' }]),
    ...(from ? [] : [{ fieldId: 'rate-from', message: 'Choose the start date.' }]),
    ...(kind === 'per_diem' && where === 'tier' && !tierId ? [{ fieldId: 'rate-tier', message: 'Choose the city tier.' }] : []),
    ...(kind === 'per_diem' && where === 'country' && !/^[A-Za-z]{2}$/.test(country.trim()) ? [{ fieldId: 'rate-country', message: 'Enter the two-letter country code, e.g. AE.' }] : []),
    ...(kind === 'per_diem' && !/^[A-Za-z]{3}$/.test(currency.trim()) ? [{ fieldId: 'rate-currency', message: 'Enter the three-letter currency code, e.g. AED.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      if (kind === 'mileage') await onAddMileage({ vehicle: vehicle!, ratePerKm: rate.trim(), monthlyKmCap: cap, validFrom: dayKey(from!) });
      else await onAddPerDiem({ tierId: where === 'tier' ? tierId : null, country: where === 'country' ? country.trim().toUpperCase() : null, ratePerDay: rate.trim(), currency: currency.trim().toUpperCase(), partialDayRule: half ? 'half_after_hours' : 'full', validFrom: dayKey(from!) });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={kind === 'mileage' ? 'Add a mileage rate' : 'Add a per-diem rate'}
      subtitle="The rate it replaces ends the day before. Claims use the rate valid on the expense date."
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save rate
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      {kind === 'mileage' ? (
        <>
          <FormField id="rate-vehicle" label="Vehicle">
            <Select aria-label="Vehicle" value={vehicle} onChange={setVehicle} options={VEHICLES} />
          </FormField>
          <FormField id="rate-amount" label="Rate per km (₹)" required error={v.errorOf('rate-amount')}>
            <TextField value={rate} onChange={(x) => setRate(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={9} />
          </FormField>
          <FormField id="rate-cap" label="Monthly km limit" optional>
            <NumberField value={cap} onChange={setCap} min={1} max={100000} />
          </FormField>
        </>
      ) : (
        <>
          <FormField id="rate-where" label="Where">
            <Segment label="Where" value={where} onChange={(x) => setWhere(x as 'tier' | 'country')} options={[{ value: 'tier', label: 'A city tier' }, { value: 'country', label: 'A country' }]} />
          </FormField>
          {where === 'tier' ? (
            <FormField id="rate-tier" label="City tier" required error={v.errorOf('rate-tier')}>
              <Select aria-label="City tier" value={tierId} onChange={setTierId} options={tiers.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))} />
            </FormField>
          ) : (
            <FormField id="rate-country" label="Country code" required error={v.errorOf('rate-country')}>
              <TextField value={country} onChange={setCountry} maxLength={2} />
            </FormField>
          )}
          <div className="yx-field-row">
            <FormField id="rate-amount" label="Rate per day" required error={v.errorOf('rate-amount')}>
              <TextField value={rate} onChange={(x) => setRate(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={15} />
            </FormField>
            <FormField id="rate-currency" label="Currency" required error={v.errorOf('rate-currency')}>
              <TextField value={currency} onChange={setCurrency} maxLength={3} />
            </FormField>
          </div>
          <Checkbox checked={half} onChange={setHalf} label="Half rate on a first or last day that is not a full day" />
        </>
      )}
      <FormField id="rate-from" label="From" required error={v.errorOf('rate-from')}>
        <DatePicker value={from} onChange={setFrom} aria-label="From" />
      </FormField>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ GST registrations

function GstTab({ gst, entities, today, onAdd, onEnd, start }: { gst: GstRegistration[]; entities: Choice[]; today: string; onAdd: ExpenseSetupScreenProps['onAddGst']; onEnd: ExpenseSetupScreenProps['onEndGst']; start?: boolean }) {
  const canEdit = useContext(CanEdit);
  const [adding, setAdding] = useState(Boolean(start));
  const [ending, setEnding] = useState<GstRegistration | null>(null);
  const [endOn, setEndOn] = useState<Date | null>(fromKey(today));
  const [tried, setTried] = useState(false);
  const entity = (id: string) => entities.find((e) => e.value === id)?.label ?? '';
  const columns: TableColumn<GstRegistration>[] = [
    { key: 'entity', header: 'Legal entity', value: (r) => entity(r.legalEntityId), width: 240, hideable: false },
    { key: 'state', header: 'State code', value: (r) => r.state, width: 110 },
    { key: 'gstin', header: 'GSTIN', value: (r) => r.gstin, width: 190 },
    { key: 'from', header: 'From', value: (r) => dateText(r.validFrom), width: 130 },
    { key: 'to', header: 'To', value: (r) => (r.validTo ? dateText(r.validTo) : 'Open'), width: 130 },
  ];
  return (
    <div className="yx-ops-stack">
      <Text as="p" tone="secondary">
        Input credit on a bill needs your GSTIN in the state where the service is given, for example the hotel&apos;s state. Record each registration here.
      </Text>
      {canEdit && (
        <div className="yx-ops-row">
          <Button icon={Plus} onClick={() => setAdding(true)}>
            Add a registration
          </Button>
        </div>
      )}
      <DataTable label="GST registrations" columns={columns} rows={gst} getRowId={(r) => r.id} rowNoun={['registration', 'registrations']} cardSummary empty={<EmptyState compact title="No GST registrations yet." />} rowButtons={(r) => (r.validTo || !canEdit ? null : <Button size="sm" onClick={() => setEnding(r)}>End</Button>)} />
      {adding && <GstDrawer entities={entities} today={today} onClose={() => setAdding(false)} onAdd={onAdd} />}
      {ending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && (setEnding(null), setTried(false))}
          size="md"
          title={`End ${ending.gstin}?`}
          consequence="Bills dated after this day are not matched to this registration."
          confirmLabel="End registration"
          onConfirm={async () => {
            setTried(true);
            if (!endOn) return false;
            await onEnd(ending.id, dayKey(endOn!));
            setEnding(null);
          }}
        >
          <FormField id="gst-end" label="Last day" required error={tried && !endOn ? 'Choose the last day.' : null}>
            <DatePicker value={endOn} onChange={setEndOn} aria-label="Last day" />
          </FormField>
        </ConfirmDialog>
      )}
    </div>
  );
}

function GstDrawer({ entities, today, onClose, onAdd }: { entities: Choice[]; today: string; onClose: () => void; onAdd: ExpenseSetupScreenProps['onAddGst'] }) {
  const [entityId, setEntityId] = useState<string | null>(entities.length === 1 ? entities[0].value : null);
  const [gstin, setGstin] = useState('');
  const [from, setFrom] = useState<Date | null>(fromKey(today));
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = [
    ...(entityId ? [] : [{ fieldId: 'gst-entity', message: 'Choose the legal entity.' }]),
    ...(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase()) ? [] : [{ fieldId: 'gst-gstin', message: 'A GSTIN has 15 characters: state code, PAN, entity number, Z and a check character.' }]),
    ...(from ? [] : [{ fieldId: 'gst-from', message: 'Choose the start date.' }]),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await onAdd({ legalEntityId: entityId!, gstin: gstin.trim().toUpperCase(), validFrom: dayKey(from!) });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a GST registration"
      subtitle="The state comes from the GSTIN's first two digits. The check character and the entity's PAN are checked."
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save registration
          </Button>
        </>
      }
    >
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <FormField id="gst-entity" label="Legal entity" required error={v.errorOf('gst-entity')}>
        <Select aria-label="Legal entity" value={entityId} onChange={setEntityId} options={entities} />
      </FormField>
      <FormField id="gst-gstin" label="GSTIN" required error={v.errorOf('gst-gstin')}>
        <TextField value={gstin} onChange={(x) => setGstin(x.toUpperCase())} maxLength={15} />
      </FormField>
      <FormField id="gst-from" label="From" required error={v.errorOf('gst-from')}>
        <DatePicker value={from} onChange={setFrom} aria-label="From" />
      </FormField>
    </Drawer>
  );
}

function FxTab({ rows, payCurrency, today, onAdd }: { rows: FxRateRow[]; payCurrency: string; today: string; onAdd: NonNullable<ExpenseSetupScreenProps['onAddFxRate']> }) {
  const canEdit = useContext(CanEdit);
  const [adding, setAdding] = useState(false);
  const [base, setBase] = useState('');
  const [on, setOn] = useState<Date | null>(fromKey(today));
  const [rate, setRate] = useState('');
  const okRate = /^\d{1,10}(\.\d{1,8})?$/.test(rate) && Number(rate) > 0;
  const ok = /^[A-Z]{3}$/.test(base) && base !== payCurrency && on !== null && okRate;
  const [tried, setTried] = useState(false);
  const columns: TableColumn<FxRateRow>[] = [
    { key: 'pair', header: 'Currency', value: (r) => `1 ${r.base} = ${r.quote}`, width: 160, hideable: false },
    { key: 'rate', header: 'Rate', value: (r) => Number(r.rate).toLocaleString('en-IN', { maximumFractionDigits: 6 }), width: 140 },
    { key: 'date', header: 'From', value: (r) => dateText(r.rateDate), width: 140 },
  ];
  return (
    <Card title="Exchange rates" actions={canEdit ? <Button size="sm" icon={Plus} onClick={() => (setTried(false), setAdding(true))}>Add a rate</Button> : undefined}>
      <Text as="p" tone="secondary" size="sm">
        {`Bills in another currency are converted to ${payCurrency} at the last rate on or before the bill's date. Official rate feeds are switched on once their terms of reuse are confirmed.`}
      </Text>
      <DataTable label="Exchange rates" columns={columns} rows={rows} getRowId={(r) => r.id} rowNoun={['rate', 'rates']} cardSummary empty={<EmptyState compact title="No rates yet." description="Add the rates your company closes its books on." />} />
      {adding && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAdding(false)}
          size="md"
          title="Add an exchange rate"
          consequence="A rate for the same currency and date replaces the one there."
          confirmLabel="Add rate"
          onConfirm={async () => {
            setTried(true);
            if (!ok) return false;
            await onAdd({ base, quote: payCurrency, rateDate: dayKey(on!), rate });
            setAdding(false);
            setBase('');
            setRate('');
          }}
        >
          <FormField id="fx-base" label="Currency" required error={!tried ? null : !/^[A-Z]{3}$/.test(base) ? 'Enter a 3-letter code, e.g. USD.' : base === payCurrency ? `Enter a currency other than ${payCurrency}.` : null} helper="A 3-letter code, e.g. USD.">
            <TextField value={base} onChange={(x) => setBase(x.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} maxLength={3} />
          </FormField>
          <FormField id="fx-rate" label={`${payCurrency} for 1 unit`} required error={tried && !okRate ? 'Enter a rate above 0, e.g. 83.25.' : null}>
            <TextField value={rate} onChange={(x) => setRate(x.replace(/[^0-9.]/g, ''))} inputMode="decimal" maxLength={20} />
          </FormField>
          <FormField id="fx-on" label="From" required error={tried && !on ? 'Choose the date.' : null}>
            <DatePicker value={on} onChange={setOn} aria-label="Rate from" />
          </FormField>
        </ConfirmDialog>
      )}
    </Card>
  );
}
