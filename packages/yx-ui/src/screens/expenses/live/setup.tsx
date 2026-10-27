import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { ConditionBuilder, emptyRule } from '../../../components/condition';
import { DatePicker } from '../../../components/date';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { fromServerGroup, toServerGroup } from '../../../lib/forms';
import type { Rule, RuleField } from '../../../lib/rules';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { ANY, fromRows, sameRules, toRows, type MatrixRow, type Per } from './matrix';
import type { CategoryKind, Choice, CityTier, ExpenseCategory, ExpensePolicy, FxRateRow, GstRegistration, LoadState, OverLimit, Policies, PolicySave, Rates, SetupCheck, Taxable } from './types';

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
}

export function ExpenseSetupScreen(p: ExpenseSetupScreenProps) {
  const { busy, error, run } = useRun();
  const noCategories = p.categories.length === 0;
  return (
    <LivePage title="Expenses" description="Categories, limits by city tier, mileage and per-diem rates, and GST registrations. Claims are checked against the policy valid on the expense date." state={p.state} onRetry={p.onRetry} what="expense set-up" grantedBy="your System Admin">
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {noCategories ? (
        <Card title="Start from the YukthiX starters">
          <Text as="p">Eleven categories, four city tiers, a company-wide policy with limits, and mileage and per-diem rates. Your copy is yours: later YukthiX changes never overwrite it.</Text>
          <Button variant="primary" loading={busy === 'starters'} onClick={() => void run('starters', p.onUseStarters)}>
            Use the starters
          </Button>
        </Card>
      ) : (
        p.check && <SetupCheckCard check={p.check} />
      )}
      {!noCategories && (
        <Tabs defaultValue="limits">
          <TabsList aria-label="Expense set-up">
            <TabsTrigger value="limits">Limits</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="tiers">City tiers</TabsTrigger>
            <TabsTrigger value="rates">Mileage and per diem</TabsTrigger>
            <TabsTrigger value="gst">GST registrations</TabsTrigger>
            {p.onAddFxRate && <TabsTrigger value="fx">Exchange rates</TabsTrigger>}
          </TabsList>
          <TabsContent value="limits">{p.policies && <LimitsTab {...p} policies={p.policies} />}</TabsContent>
          <TabsContent value="categories">
            <CategoriesTab categories={p.categories} onSave={p.onSaveCategory} />
          </TabsContent>
          <TabsContent value="tiers">
            <TiersTab tiers={p.tiers} onSave={p.onSaveTier} />
          </TabsContent>
          <TabsContent value="rates">{p.rates && <RatesTab rates={p.rates} tiers={p.tiers} today={p.policies?.today ?? dayKey(new Date())} onAddMileage={p.onAddMileage} onAddPerDiem={p.onAddPerDiem} />}</TabsContent>
          {p.onAddFxRate && (
            <TabsContent value="fx">
              <FxTab rows={p.fxRates ?? []} payCurrency={p.payCurrency ?? 'INR'} today={p.policies?.today ?? dayKey(new Date())} onAdd={p.onAddFxRate} />
            </TabsContent>
          )}
          <TabsContent value="gst">
            <GstTab gst={p.gst} entities={p.entities} today={p.policies?.today ?? dayKey(new Date())} onAdd={p.onAddGst} onEnd={p.onEndGst} />
          </TabsContent>
        </Tabs>
      )}
    </LivePage>
  );
}

function SetupCheckCard({ check }: { check: SetupCheck }) {
  if (check.ready) return <InlineAlert tone="success" title="Ready for claims">Every employee has a policy, and every category has a ledger code and the rates it needs.</InlineAlert>;
  return (
    <InlineAlert tone="warning" title={`${check.problems.length} ${check.problems.length === 1 ? 'thing needs' : 'things need'} attention before claims`}>
      <ul className="yx-lif-list">
        {check.problems.map((x) => (
          <li key={x.key}>
            <Text>{x.text}</Text>
          </li>
        ))}
      </ul>
    </InlineAlert>
  );
}

// ------------------------------------------------------------------------------------------ limits (EXP-07)

const policyLabel = (x: ExpensePolicy) => `${x.name} · from ${dateText(x.validFrom)}${x.validTo ? ` to ${dateText(x.validTo)}` : ''}${x.status === 'retired' ? ' (retired)' : ''}`;

function LimitsTab(p: ExpenseSetupScreenProps & { policies: Policies }) {
  const { policies, fields, today } = p.policies;
  const current = policies.find((x) => x.status === 'active' && x.validFrom <= today && (!x.validTo || x.validTo >= today)) ?? policies[0];
  const [id, setId] = useState<string | null>(current?.id ?? null);
  const policy = policies.find((x) => x.id === id) ?? current;
  if (!policy) return <EmptyState compact title="No policy yet." />;
  return <PolicyMatrix key={`${policy.id}:${policy.version}`} {...p} fields={fields} today={today} policy={policy} picker={<Select aria-label="Policy" value={policy.id} onChange={(v) => v && setId(v)} options={policies.map((x) => ({ value: x.id, label: policyLabel(x) }))} />} />;
}

function PolicyMatrix(p: ExpenseSetupScreenProps & { fields: Policies['fields']; today: string; policy: ExpensePolicy; picker: React.ReactNode }) {
  const { policy, today } = p;
  const inForce = policy.validFrom <= today;
  const [rows, setRows] = useState<MatrixRow[]>(() => toRows(policy.rules, p.categories));
  const [from, setFrom] = useState<Date | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
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
    if (errors.length || !('rules' in parsed)) return v.reveal();
    setSaving(true);
    setFailed(null);
    try {
      await p.onSavePolicy(inForce ? { mode: 'version', policy: { ...policy, rules: parsed.rules }, from: dayKey(from!) } : { mode: 'update', policy: { ...policy, rules: parsed.rules } });
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const tiers = p.tiers.filter((t) => t.active);
  const cols = [{ id: ANY, name: 'Any city' }, ...tiers.map((t) => ({ id: t.id, name: t.name }))];
  return (
    <div className="yx-tim-stack">
      <div className="yx-lif-grid">
        <FormField id="lim-policy" label="Policy">
          {p.picker}
        </FormField>
        <div>
          <Badge tone={inForce ? 'success' : 'info'}>{inForce ? `In force since ${dateText(policy.validFrom)}` : `Starts ${dateText(policy.validFrom)}`}</Badge>{' '}
          <Text tone="secondary" size="sm">
            {policy.appliesIf ? 'For some people (see "Applies to")' : 'For everyone without a narrower policy'}
          </Text>
        </div>
      </div>
      {policy.appliesIf && <ConditionBuilder schema={{ triggers: [], fields: p.fields as RuleField[], recipients: [] }} value={{ ...emptyRule(), conditions: fromServerGroup(policy.appliesIf as never, p.fields as RuleField[]) }} parts={['if']} readOnly />}
      {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      <div className="yx-ops-scroll">
        <table className="yx-ops-matrix" aria-label={`Limits of ${policy.name}`}>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Limit</th>
              {cols.map((c) => (
                <th key={c.id} scope="col">
                  {c.name}
                </th>
              ))}
              <th scope="col">Over the limit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const amounts = r.per !== 'none' && r.per !== 'free';
              return (
                <tr key={r.code} id={`lim-${r.code}`}>
                  <th scope="row">{r.name}</th>
                  <td>
                    <Select aria-label={`${r.name}: limit`} value={r.per} onChange={(x) => x && edit(r.code, { per: x as Per })} options={PER} />
                  </td>
                  {cols.map((c) => (
                    <td key={c.id} data-num>
                      {amounts ? (
                        <input className="yx-input" aria-label={`${r.name}, ${c.name}`} inputMode="decimal" value={r.cells[c.id] ?? ''} placeholder={c.id === ANY ? 'Not allowed' : 'As any city'} onChange={(e) => edit(r.code, { cells: { ...r.cells, [c.id]: e.target.value.replace(/[^0-9.]/g, '') } })} />
                      ) : (
                        <Text tone="secondary" size="sm">
                          {r.per === 'free' ? 'No limit' : '—'}
                        </Text>
                      )}
                    </td>
                  ))}
                  <td>{r.per === 'none' ? <Text tone="secondary" size="sm">—</Text> : <Select aria-label={`${r.name}: over the limit`} value={r.overLimit} onChange={(x) => x && edit(r.code, { overLimit: x as OverLimit })} options={OVER} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Text as="p" tone="secondary" size="sm">
        An empty tier cell uses the "Any city" amount; both empty means not allowed there. Over a limit, the employee gives a reason and the excess gets an extra approval, unless it is a hard block.
      </Text>
      <div className="yx-lif-row">
        {inForce && dirty && (
          <FormField id="lim-from" label="New limits from" required error={v.errorOf('lim-from')}>
            <DatePicker value={from} onChange={setFrom} min={fromKey(today)} aria-label="New limits from" />
          </FormField>
        )}
        <Button variant="primary" disabled={!dirty} loading={saving} onClick={() => void save()}>
          {inForce ? 'Save as a new version' : 'Save limits'}
        </Button>
        <Button icon={Plus} onClick={() => setCopying(true)}>
          Copy as a new policy
        </Button>
      </div>
      {copying && <CopyPolicyDrawer policy={policy} rules={'rules' in parsed ? parsed.rules : policy.rules} fields={p.fields} today={today} onClose={() => setCopying(false)} onSave={p.onSavePolicy} />}
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
      <div className="yx-lif-grid">
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

function CategoriesTab({ categories, onSave }: { categories: ExpenseCategory[]; onSave: ExpenseSetupScreenProps['onSaveCategory'] }) {
  const [editing, setEditing] = useState<CategoryInput | null>(null);
  const columns: TableColumn<ExpenseCategory>[] = [
    { key: 'name', header: 'Category', value: (r) => r.name, render: (r) => <Text>{r.name}</Text>, width: 220, hideable: false },
    { key: 'kind', header: 'Kind', value: (r) => KIND[r.kind], width: 180 },
    { key: 'receipt', header: 'Receipt needed', value: (r) => (r.kind === 'mileage' || r.kind === 'per_diem' ? 'Worked out' : r.receiptAbove === null ? 'Always' : `Above ₹${Number(r.receiptAbove).toLocaleString('en-IN')}`), width: 150 },
    { key: 'gst', header: 'GST', value: (r) => (!r.gstEligible ? 'No' : r.itcBlockedReason ? 'Captured, credit blocked' : 'Input credit'), width: 170 },
    { key: 'ledger', header: 'Ledger code', value: (r) => r.ledgerCode ?? '', render: (r) => (r.ledgerCode ? <Text>{r.ledgerCode}</Text> : <Badge tone="warning">Not mapped</Badge>), width: 160 },
    { key: 'status', header: 'Status', value: (r) => (r.active ? 'In use' : 'Not in use'), width: 110, optional: true },
  ];
  return (
    <div className="yx-tim-stack">
      <div className="yx-lif-row">
        <Button icon={Plus} onClick={() => setEditing({ code: '', name: '', kind: 'spend', receiptAbove: '500', gstEligible: false, itcBlockedReason: null, taxable: 'never', ledgerCode: null, active: true })}>
          Add a category
        </Button>
      </div>
      <DataTable label="Expense categories" columns={columns} rows={categories} getRowId={(r) => r.id} rowNoun={['category', 'categories']} cardSummary rowButtons={(r) => <Button size="sm" onClick={() => setEditing({ ...r })}>Edit</Button>} />
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
        <TextField value={c.code} onChange={(x) => set({ code: x.trim().toLowerCase() })} maxLength={30} disabled={Boolean(value.id)} />
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

function TiersTab({ tiers, onSave }: { tiers: CityTier[]; onSave: ExpenseSetupScreenProps['onSaveTier'] }) {
  const [editing, setEditing] = useState<TierInput | null>(null);
  const columns: TableColumn<CityTier>[] = [
    { key: 'name', header: 'Tier', value: (r) => r.name, width: 160, hideable: false },
    { key: 'cities', header: 'Cities', value: (r) => (r.cities.length ? r.cities.join(', ') : r.country === 'IN' ? 'Every other city in India' : r.country ? `Every city in ${r.country}` : 'Any city outside India'), width: 420 },
    { key: 'status', header: 'Status', value: (r) => (r.active ? 'In use' : 'Not in use'), width: 110, optional: true },
  ];
  return (
    <div className="yx-tim-stack">
      <div className="yx-lif-row">
        <Button icon={Plus} onClick={() => setEditing({ name: '', rank: tiers.length + 1, country: 'IN', cities: [], active: true })}>
          Add a tier
        </Button>
      </div>
      <DataTable label="City tiers" columns={columns} rows={tiers} getRowId={(r) => r.id} rowNoun={['tier', 'tiers']} cardSummary rowButtons={(r) => <Button size="sm" onClick={() => setEditing({ ...r })}>Edit</Button>} />
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

function RatesTab({ rates, tiers, today, onAddMileage, onAddPerDiem }: { rates: Rates; tiers: CityTier[]; today: string; onAddMileage: ExpenseSetupScreenProps['onAddMileage']; onAddPerDiem: ExpenseSetupScreenProps['onAddPerDiem'] }) {
  const [adding, setAdding] = useState<'mileage' | 'per_diem' | null>(null);
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
    <div className="yx-tim-stack">
      <Card title="Mileage (own vehicle)" actions={<Button size="sm" icon={Plus} onClick={() => setAdding('mileage')}>Add a rate</Button>}>
        <DataTable label="Mileage rates" columns={mileage} rows={rates.mileage} getRowId={(r) => r.id} rowNoun={['rate', 'rates']} cardSummary />
      </Card>
      <Card title="Per diem" actions={<Button size="sm" icon={Plus} onClick={() => setAdding('per_diem')}>Add a rate</Button>}>
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
          <div className="yx-lif-grid">
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

function GstTab({ gst, entities, today, onAdd, onEnd }: { gst: GstRegistration[]; entities: Choice[]; today: string; onAdd: ExpenseSetupScreenProps['onAddGst']; onEnd: ExpenseSetupScreenProps['onEndGst'] }) {
  const [adding, setAdding] = useState(false);
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
    <div className="yx-tim-stack">
      <Text as="p" tone="secondary">
        Input credit on a bill needs your GSTIN in the state where the service is given, for example the hotel&apos;s state. Record each registration here.
      </Text>
      <div className="yx-lif-row">
        <Button icon={Plus} onClick={() => setAdding(true)}>
          Add a registration
        </Button>
      </div>
      <DataTable label="GST registrations" columns={columns} rows={gst} getRowId={(r) => r.id} rowNoun={['registration', 'registrations']} cardSummary empty={<EmptyState compact title="No GST registrations yet." />} rowButtons={(r) => (r.validTo ? null : <Button size="sm" onClick={() => setEnding(r)}>End</Button>)} />
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
    <Card title="Exchange rates" actions={<Button size="sm" icon={Plus} onClick={() => (setTried(false), setAdding(true))}>Add a rate</Button>}>
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
