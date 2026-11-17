// Settings 4.11 "Flexible benefit plan (FBP)" made live (B8/E5, founder answers 2406, 2407, 2411): the designed 4.11 page
// with the company's flexible components (the designed `ben.fbp_heads` list; Add and Edit open the component sheet) and
// what happens to an unclaimed balance (the designed `ben.fbp_sweep` choice: paid as taxable salary in March, the
// default, or carried into the next year; at exit it is always paid). The insurance, enrolment, NPS and marketplace
// sections are not built yet and are left out, never shown with sample values.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, useTooEarly, type FormErrorItem } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { useToast } from '../../components/notify';
import { formatINR } from '../../lib/format';
import type { SettingDef, SettingsPageDef, SettingValue } from './settings-types';

/** GET /benefits/flex/settings. */
export interface FbpSettingsData {
  components: FlexComponentView[];
  /** benefits.fbp.unclaimed: 'pay' (default) or 'carry'. */
  unclaimed: 'pay' | 'carry';
  categories: { code: string; name: string }[];
  lastChange: { by: string; at: string; what: string } | null;
}

export interface FlexComponentView {
  id: string;
  code: string;
  name: string;
  monthlyAmount: string;
  taxableIfUnclaimed: boolean;
  expenseCategoryCode: string | null;
  active: boolean;
  version: number;
}

/** The body of POST /benefits/flex/components, and of PUT with `active` and `version`. */
export interface FlexComponentInput {
  code: string;
  name: string;
  monthlyAmount: string;
  taxableIfUnclaimed: boolean;
  expenseCategoryCode: string | null;
  active?: boolean;
  version?: number;
}

const SWEEP_LABELS: Record<string, string> = { pay: 'Pay as taxable salary in March', carry: 'Carry forward to the next year' };
const LIVE = new Set(['ben.fbp_heads', 'ben.fbp_sweep']);

export function fbpSettingsPage(design: SettingsPageDef, data: FbpSettingsData): SettingsPageDef {
  const category = (code: string | null) => (code ? (data.categories.find((c) => c.code === code)?.name ?? code) : 'Not linked yet');
  const fill = (d: SettingDef): SettingDef | null => {
    if (!LIVE.has(d.key)) return null;
    const base: SettingDef = { ...d, overrides: undefined, dated: undefined };
    if (d.key === 'ben.fbp_heads')
      return {
        ...base,
        label: 'Flexible components',
        scope: 'Company',
        columns: ['Component', 'A month', 'Claimed under', 'If unclaimed', 'Status'],
        rows: data.components.map((c) => [c.name, formatINR(Number(c.monthlyAmount)), category(c.expenseCategoryCode), c.taxableIfUnclaimed ? 'Paid as taxable salary' : 'Lapses', c.active ? 'Offered' : 'Switched off']),
        addLabel: 'Add component',
        starter: false,
        helper: 'Each person is entitled to the monthly amount for every month they work in the tax year, and claims it with bills through Expenses.',
      };
    return { ...base, kind: 'radio', scope: 'Company', options: ['pay', 'carry'], optionLabels: SWEEP_LABELS, value: data.unclaimed, starter: data.unclaimed === 'pay', helper: 'At exit what is left is always paid as taxable salary in the exit month.' };
  };
  return {
    ...design,
    summary: 'The flexible benefit components people claim with bills, and what happens to what they leave unclaimed.',
    note: 'Every change is recorded.',
    scopes: undefined,
    sections: design.sections.map((sec) => ({ ...sec, settings: sec.settings.map(fill).filter((x): x is SettingDef => x !== null) })).filter((sec) => sec.settings.length > 0),
  };
}

/** The page's changes as company settings, for PUT /org/settings. */
export function fbpSettingsChanges(values: Record<string, SettingValue>): { key: string; value: string }[] {
  const v = values['ben.fbp_sweep'];
  return v === 'pay' || v === 'carry' ? [{ key: 'benefits.fbp.unclaimed', value: v }] : [];
}

const MONEY_RX = /^\d{1,7}(\.\d{1,2})?$/;
const CODE_RX = /^[a-z][a-z0-9_]{1,29}$/;

/** Add or change one flexible component (the confirm button is never disabled; pressed too early, the field says why). */
export function FlexComponentSheet({ initial, categories, onClose, onSave }: { initial: FlexComponentView | null; categories: FbpSettingsData['categories']; onClose: () => void; onSave: (x: FlexComponentInput) => Promise<unknown> }) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [amount, setAmount] = useState(initial?.monthlyAmount ?? '');
  const [category, setCategory] = useState<string | null>(initial?.expenseCategoryCode ?? null);
  const [unclaimed, setUnclaimed] = useState<'taxable' | 'lapse'>(initial && !initial.taxableIfUnclaimed ? 'lapse' : 'taxable');
  const [offered, setOffered] = useState<'yes' | 'no'>(initial && !initial.active ? 'no' : 'yes');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const errors: FormErrorItem[] = [
    ...(name.trim().length < 2 ? [{ fieldId: 'fc-name', message: 'Enter the name people see (at least 2 letters).' }] : []),
    ...(!initial && !CODE_RX.test(code.trim()) ? [{ fieldId: 'fc-code', message: 'Enter a short code: small letters, digits or _, starting with a letter.' }] : []),
    ...(!MONEY_RX.test(amount.trim()) || Number(amount) <= 0 ? [{ fieldId: 'fc-amount', message: 'Enter the monthly amount in rupees, above zero.' }] : []),
  ];
  const early = useTooEarly(errors);
  const save = () => {
    if (early.stop()) return;
    setBusy(true);
    setFailed(null);
    onSave({ code: initial?.code ?? code.trim(), name: name.trim(), monthlyAmount: amount.trim(), taxableIfUnclaimed: unclaimed === 'taxable', expenseCategoryCode: category, ...(initial ? { active: offered === 'yes', version: initial.version } : {}) })
      .then(() => {
        toast({ tone: 'success', title: initial ? `${name.trim()} saved.` : `${name.trim()} added.` });
        onClose();
      })
      .catch((e: unknown) => setFailed(e instanceof Error ? e.message : 'That did not work. Try again.'))
      .finally(() => setBusy(false));
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={initial ? `Change ${initial.name}` : 'Add flexible component'}
      subtitle="Settings · Benefits & FBP"
      dirty
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {initial ? 'Save component' : 'Add component'}
          </Button>
        </>
      }
    >
      <div className="yx-set-stack">
        <FieldRow>
          <FormField id="fc-name" label="Name" required error={early.errorOf('fc-name')}>
            <TextField value={name} onChange={setName} maxLength={80} />
          </FormField>
          <FormField id="fc-code" label="Code" required={!initial} error={early.errorOf('fc-code')} helper={initial ? 'The code does not change.' : 'Used in reports, for example phone.'}>
            <TextField value={code} onChange={setCode} maxLength={30} disabled={!!initial} />
          </FormField>
        </FieldRow>
        <FormField id="fc-amount" label="Entitlement a month" required error={early.errorOf('fc-amount')}>
          <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" maxLength={10} />
        </FormField>
        <FormField id="fc-category" label="Claimed under expense category" optional helper="People claim it with bills in this category; one category per component.">
          <Select value={category} onChange={setCategory} placeholder="Not linked yet" options={categories.map((c) => ({ value: c.code, label: c.name }))} />
        </FormField>
        <FormField id="fc-unclaimed" label="What is left unclaimed" required>
          <Segment
            label="What is left unclaimed"
            value={unclaimed}
            onChange={setUnclaimed}
            options={[
              { value: 'taxable', label: 'Paid as taxable salary' },
              { value: 'lapse', label: 'Lapses' },
            ]}
          />
        </FormField>
        {initial && (
          <FormField id="fc-offered" label="Offered" required helper="Switched off, nobody can claim it; what was settled stays.">
            <Segment
              label="Offered"
              value={offered}
              onChange={setOffered}
              options={[
                { value: 'yes', label: 'Offered' },
                { value: 'no', label: 'Switched off' },
              ]}
            />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}
