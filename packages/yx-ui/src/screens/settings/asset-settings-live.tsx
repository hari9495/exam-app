// IT assets part 1 (founder answer 2712): Settings 2.8 Assets made live. The drawn page with the company's asset
// categories (name, tracked by, default recovery, useful life), each opened in a drawer by HR's company-wide settings
// key; the acknowledgement method ("Click to accept" or "None"; "E-sign" waits for the e-sign partner) and the F&F
// recovery of an asset not returned. Answer 2720: a category may number its tags (LAP-2026-0042). Answer 2713: a category
// depreciates straight line over its useful life (default) or declining balance at a yearly rate; "Written-down value"
// is the asset's net book value on the leaver's last working day (answer 2820; a management figure, not the tax books).
import { useState } from 'react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Segment } from '../../components/segment';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { CurrencyField, NumberField, TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import type { SettingDef, SettingsPageDef } from './settings-types';

/** GET /lifecycle/asset-categories, one row. */
export interface AssetCategoryRow {
  id: string;
  name: string;
  trackedBy: string | null;
  defaultRecovery: string | null;
  usefulLifeYears: number | null;
  /** Answer 2713: straight line over the useful life (default) or declining balance at depreciationRate % a year. */
  depreciationMethod?: 'straight_line' | 'declining';
  depreciationRate?: string | null;
  /** Answer 2720: the tag pattern (no prefix: none) and the next tag it gives. */
  tagPrefix: string | null;
  tagYear: boolean;
  tagDigits: number;
  nextTag: string | null;
  /** How many assets are in it. */
  assets: number;
  version: number;
}
export type AssetCategoryInput = Pick<AssetCategoryRow, 'name' | 'trackedBy' | 'defaultRecovery' | 'usefulLifeYears' | 'tagPrefix' | 'tagYear' | 'tagDigits' | 'depreciationMethod' | 'depreciationRate'>;

/** Answer 2713: the Depreciation column. */
const depreciationCell = (r: AssetCategoryRow) =>
  r.depreciationMethod === 'declining' ? (r.depreciationRate ? `Declining ${Number(r.depreciationRate)}% a year` : '—') : r.usefulLifeYears ? `Straight line, ${r.usefulLifeYears} ${r.usefulLifeYears === 1 ? 'year' : 'years'}` : 'None';

const rupees = (s: string) => `₹${Number(s).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** The live 2.8 page: the category list first (in the drawn Categories section), then the registry settings as drawn. */
export function assetSettingsPage(page: SettingsPageDef, design: SettingsPageDef, rows: AssetCategoryRow[], canEdit: boolean): SettingsPageDef {
  const drawn = design.sections.find((s) => s.settings.some((d) => d.key === 'asset.categories'))!;
  const def = drawn.settings.find((d) => d.key === 'asset.categories')!;
  const list: SettingDef = {
    ...def,
    columns: ['Category', 'Tracked by', 'Default recovery', 'Depreciation', 'Next tag', 'Assets'],
    rows: rows.map((r) => [r.name, r.trackedBy ?? '—', r.defaultRecovery ? rupees(r.defaultRecovery) : 'Asset cost', depreciationCell(r), r.nextTag ?? 'Typed by hand', String(r.assets)]),
    starter: false,
    readOnlyList: !canEdit,
    helper: 'Add asset and the asset page pick from this list. With no default recovery, an unreturned asset starts from its cost.',
  };
  // Single choices are a joined Segment on this page, as drawn.
  const tune = (d: SettingDef): SettingDef =>
    d.key === 'asset.ack_method'
      ? { ...d, kind: 'radio', helper: 'E-sign comes when the e-sign partner is chosen.' }
      : d.key === 'asset.recovery_basis'
        ? { ...d, kind: 'radio', helper: 'Written-down value is the asset’s net book value on the leaver’s last working day, from its category’s depreciation. Without a cost, purchase date or depreciation, HR decides the amount.', showWhen: { key: 'asset.recovery_to_fnf', equals: true } }
        : d.key === 'asset.warranty_alert_days'
          ? { ...d, kind: 'radio', helper: 'Asset managers of the asset’s place are told once. An ended warranty shows in red on the register.' }
          : d.key === 'asset.contract_alert_days'
            ? { ...d, kind: 'radio', helper: 'Asset managers of the contract’s place (company-wide ones for a contract with no place) are told once. A tacit contract renews itself at its end; an express one ends.' }
            : d.key === 'asset.licence_alert_days'
              ? { ...d, kind: 'radio', helper: 'Asset managers of the licence’s place (company-wide ones for a licence with no place) are told once before it expires.' }
              : d.key === 'asset.booking_max_days'
                ? { ...d, kind: 'radio', helper: 'An employee books a bookable asset for at most this many days at a time. Repeats (every day or week) go up to 3 months ahead.' }
                : d.key === 'asset.booking_approval'
                  ? { ...d, helper: 'Off: a booking is made at once. On: it waits until an asset manager of the asset’s place approves or declines it (with a reason); the person is told either way.' }
                  : d;
  const sections = page.sections.map((s) => ({ ...s, settings: s.settings.map(tune) }));
  const own = sections.find((s) => s.title === drawn.title);
  return { ...page, sections: [{ title: drawn.title, description: drawn.description, settings: [list, ...(own?.settings ?? [])] }, ...sections.filter((s) => s.title !== drawn.title)] };
}

/** Add, change or retire one asset category. */
export function AssetCategoryDrawer({ initial, onClose, onSave, onRetire }: { initial: AssetCategoryRow | null; onClose: () => void; onSave: (input: AssetCategoryInput) => Promise<unknown>; onRetire?: () => Promise<unknown> }) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [trackedBy, setTrackedBy] = useState(initial?.trackedBy ?? '');
  const [recovery, setRecovery] = useState<number | null>(initial?.defaultRecovery ? Number(initial.defaultRecovery) : null);
  const [life, setLife] = useState<number | null>(initial?.usefulLifeYears ?? null);
  const [method, setMethod] = useState<'straight_line' | 'declining'>(initial?.depreciationMethod ?? 'straight_line');
  const [rate, setRate] = useState<number | null>(initial?.depreciationRate ? Number(initial.depreciationRate) : null);
  const [prefix, setPrefix] = useState(initial?.tagPrefix ?? '');
  const [withYear, setWithYear] = useState(initial?.tagYear ?? true);
  const [digits, setDigits] = useState(String(initial?.tagDigits ?? 4));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const problems = {
    name: name.trim().length < 2 ? 'Give the category a name of at least 2 characters.' : /[<>]/.test(name) ? 'Leave out < and >.' : null,
    trackedBy: /[<>]/.test(trackedBy) ? 'Leave out < and >.' : null,
    life: life == null || (Number.isInteger(life) && life >= 1 && life <= 50) ? null : 'Enter 1 to 50 years.',
    rate: method !== 'declining' ? null : rate == null ? 'Enter the yearly rate, for example 40.' : rate > 0 && rate < 100 && Math.round(rate * 100) === rate * 100 ? null : 'Enter a rate above 0 and below 100.',
    prefix: !prefix || /^[A-Za-z0-9]{1,12}$/.test(prefix.trim()) ? null : 'Use up to 12 letters or digits, for example LAP.',
  };
  const P = prefix.trim().toUpperCase();
  const sample = `${P}-${withYear ? `${new Date().getFullYear()}-` : ''}${'1'.padStart(Number(digits), '0')}`;
  const shown = (k: keyof typeof problems) => (tried ? problems[k] : null);
  const fail = (e: unknown) => setFailed(e instanceof Error ? e.message : 'It could not be saved. Try again.');
  const save = () => {
    setTried(true);
    const first = (Object.keys(problems) as (keyof typeof problems)[]).find((k) => problems[k]);
    if (first) return document.getElementById(`ac-${first}`)?.focus();
    setBusy(true);
    setFailed(null);
    onSave({ name: name.trim(), trackedBy: trackedBy.trim() || null, defaultRecovery: recovery == null ? null : recovery.toFixed(2), usefulLifeYears: life, tagPrefix: P || null, tagYear: withYear, tagDigits: Number(digits), depreciationMethod: method, depreciationRate: method === 'declining' && rate != null ? rate.toFixed(2) : null })
      .then(() => (toast({ tone: 'success', title: initial ? 'Category saved' : 'Category added' }), onClose()))
      .catch(fail)
      .finally(() => setBusy(false));
  };
  const retire = () => onRetire?.().then(() => (toast({ tone: 'success', title: 'Category retired' }), onClose()), fail);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={initial ? `Change ${initial.name}` : 'Add asset category'}
      subtitle={initial ? `${initial.assets} ${initial.assets === 1 ? 'asset' : 'assets'} in it` : 'Your company’s asset category'}
      dirty
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          {initial && onRetire && <Button onClick={() => void retire()}>Retire</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>{initial ? 'Save category' : 'Add category'}</Button>
        </>
      }
    >
      <div className="yx-set-stack">
        <FormField id="ac-name" label="Name" required error={shown('name')}>
          <TextField value={name} onChange={setName} maxLength={40} />
        </FormField>
        <FormField id="ac-trackedBy" label="Tracked by" optional helper="What identifies one, for example Serial number, IMEI or Card number." error={shown('trackedBy')}>
          <TextField value={trackedBy} onChange={setTrackedBy} maxLength={40} />
        </FormField>
        <FormField id="ac-recovery" label="Default recovery" optional helper="What a leaver pays on F&F when one is not returned. Empty: the asset's cost.">
          <CurrencyField value={recovery} onChange={setRecovery} allowPaise />
        </FormField>
        <FormField id="ac-life" label="Useful life" optional helper="Years. Straight line spreads the cost evenly over them." error={shown('life')}>
          <NumberField value={life} onChange={setLife} min={1} max={50} suffix="years" />
        </FormField>
        <FormField id="ac-method" label="Depreciation" helper={method === 'declining' ? 'Each year the value falls by the rate on what is left.' : life ? `The value falls evenly to 0 over ${life} ${life === 1 ? 'year' : 'years'}.` : 'Add a useful life to work out the value.'}>
          <Segment label="Depreciation" value={method} onChange={(v) => setMethod(v as 'straight_line' | 'declining')} options={[{ value: 'straight_line', label: 'Straight line' }, { value: 'declining', label: 'Declining balance' }]} />
        </FormField>
        {method === 'declining' && (
          <FormField id="ac-rate" label="Yearly rate" required helper="For example 40 for computers (Companies Act Schedule II style)." error={shown('rate')}>
            <NumberField value={rate} onChange={setRate} min={0.01} max={99.99} decimals suffix="%" />
          </FormField>
        )}
        <FormField id="ac-prefix" label="Tag prefix" optional helper={P ? `Add asset suggests tags like ${sample}. A typed tag still works.` : 'With a prefix, Add asset suggests the next tag, for example LAP-2026-0042.'} error={shown('prefix')}>
          <TextField value={prefix} onChange={setPrefix} maxLength={12} />
        </FormField>
        {P && (
          <>
            <Checkbox checked={withYear} onChange={setWithYear} label="Add the year" description="The counter starts again at 1 each year." />
            <FormField id="ac-digits" label="Counter digits">
              <Segment label="Counter digits" value={digits} onChange={setDigits} options={['3', '4', '5', '6'].map((d) => ({ value: d, label: d }))} />
            </FormField>
          </>
        )}
        {initial && onRetire && <InlineAlert tone="info" title="Retiring takes it out of the Add asset list. Assets already in it keep it." />}
      </div>
    </Drawer>
  );
}
