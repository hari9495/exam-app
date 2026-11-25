// IT assets part 1 (founder answer 2712): Settings 2.8 Assets made live. The drawn page with the company's asset
// categories (name, tracked by, default recovery, useful life), each opened in a drawer by HR's company-wide settings
// key; the acknowledgement method ("Click to accept" or "None"; "E-sign" waits for the e-sign partner) and the F&F
// recovery of an asset not returned. "Written-down value" needs depreciation, a later part: until then HR decides the
// amount each time, and the page says so.
import { useState } from 'react';
import { Button } from '../../components/button';
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
  /** How many assets are in it. */
  assets: number;
  version: number;
}
export type AssetCategoryInput = Pick<AssetCategoryRow, 'name' | 'trackedBy' | 'defaultRecovery' | 'usefulLifeYears'>;

const rupees = (s: string) => `₹${Number(s).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** The live 2.8 page: the category list first (in the drawn Categories section), then the registry settings as drawn. */
export function assetSettingsPage(page: SettingsPageDef, design: SettingsPageDef, rows: AssetCategoryRow[], canEdit: boolean): SettingsPageDef {
  const drawn = design.sections.find((s) => s.settings.some((d) => d.key === 'asset.categories'))!;
  const def = drawn.settings.find((d) => d.key === 'asset.categories')!;
  const list: SettingDef = {
    ...def,
    columns: ['Category', 'Tracked by', 'Default recovery', 'Useful life', 'Assets'],
    rows: rows.map((r) => [r.name, r.trackedBy ?? '—', r.defaultRecovery ? rupees(r.defaultRecovery) : 'Asset cost', r.usefulLifeYears ? `${r.usefulLifeYears} ${r.usefulLifeYears === 1 ? 'year' : 'years'}` : '—', String(r.assets)]),
    starter: false,
    readOnlyList: !canEdit,
    helper: 'Add asset and the asset page pick from this list. With no default recovery, an unreturned asset starts from its cost.',
  };
  // Single choices are a joined Segment on this page, as drawn.
  const tune = (d: SettingDef): SettingDef =>
    d.key === 'asset.ack_method'
      ? { ...d, kind: 'radio', helper: 'E-sign comes when the e-sign partner is chosen.' }
      : d.key === 'asset.recovery_basis'
        ? { ...d, kind: 'radio', helper: 'Written-down value needs depreciation, which is not built yet. Until then HR decides the amount each time.', showWhen: { key: 'asset.recovery_to_fnf', equals: true } }
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
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const problems = {
    name: name.trim().length < 2 ? 'Give the category a name of at least 2 characters.' : /[<>]/.test(name) ? 'Leave out < and >.' : null,
    trackedBy: /[<>]/.test(trackedBy) ? 'Leave out < and >.' : null,
    life: life == null || (Number.isInteger(life) && life >= 1 && life <= 50) ? null : 'Enter 1 to 50 years.',
  };
  const shown = (k: keyof typeof problems) => (tried ? problems[k] : null);
  const fail = (e: unknown) => setFailed(e instanceof Error ? e.message : 'It could not be saved. Try again.');
  const save = () => {
    setTried(true);
    const first = (Object.keys(problems) as (keyof typeof problems)[]).find((k) => problems[k]);
    if (first) return document.getElementById(`ac-${first}`)?.focus();
    setBusy(true);
    setFailed(null);
    onSave({ name: name.trim(), trackedBy: trackedBy.trim() || null, defaultRecovery: recovery == null ? null : recovery.toFixed(2), usefulLifeYears: life })
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
        <FormField id="ac-life" label="Useful life" optional helper="Years, for depreciation later." error={shown('life')}>
          <NumberField value={life} onChange={setLife} min={1} max={50} suffix="years" />
        </FormField>
        {initial && onRetire && <InlineAlert tone="info" title="Retiring takes it out of the Add asset list. Assets already in it keep it." />}
      </div>
    </Drawer>
  );
}
