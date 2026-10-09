import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { FormField, FormSection, type FormErrorItem, useSaveErrors } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { MenuItem } from '../../components/menu';
import { Segment } from '../../components/segment';
import { Card } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { formatMoney } from '../../lib/format';
import { EditorDrawer, useConfirm, useRun } from '../org/org-kit';
import { ConsolePage, day } from './console-kit';
import type { LoadState, NewPrice, Product, ProductPrice } from './types';

const NOTICE_DAYS = 90; // P14 YX-BILL-13
const STATE: Record<ProductPrice['state'], { label: string; tone: 'success' | 'info' | 'neutral' }> = { current: { label: 'In force', tone: 'success' }, scheduled: { label: 'Planned', tone: 'info' }, past: { label: 'Past', tone: 'neutral' } };

const isoAfter = (today: string, days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const twoDecimals = (n: number | null) => n !== null && Math.round(n * 100) === n * 100;

/**
 * The request body, or what to fix. Mirrors the API's checks: a price rise gives 90 days' notice; a cut (neither the unit
 * price nor the minimum above the price it follows, or the next planned one below it) may start at once. The API checks again.
 */
export function priceInput(d: { currency: 'INR' | 'USD'; unitPrice: number | null; minimumMonthly: number | null; validFrom: string; reason: string }, product: Product, today: string): { input: NewPrice | null; errors: FormErrorItem[] } {
  const errors: FormErrorItem[] = [];
  if (d.unitPrice === null || d.unitPrice <= 0 || !twoDecimals(d.unitPrice)) errors.push({ fieldId: 'pr-unit', message: 'Enter a price above zero, with at most 2 decimals' });
  if (d.minimumMonthly === null || d.minimumMonthly < 0 || !twoDecimals(d.minimumMonthly)) errors.push({ fieldId: 'pr-min', message: 'Enter the monthly minimum (0 or more)' });
  const noticeFrom = isoAfter(today, NOTICE_DAYS);
  const mine = product.prices.filter((p) => p.currency === d.currency).sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const before = mine.filter((p) => p.validFrom < d.validFrom).at(-1);
  const after = mine.find((p) => p.validFrom > d.validFrom);
  const rise = (prev: { unitPrice: number | null; minimumMonthly: number | null }, next: { unitPrice: number | null; minimumMonthly: number | null }) =>
    (next.unitPrice ?? 0) > (prev.unitPrice ?? 0) || (next.minimumMonthly ?? 0) > (prev.minimumMonthly ?? 0);
  const shortNotice = (before && rise(before, d) && d.validFrom < noticeFrom) || (after && rise(d, after) && after.validFrom < noticeFrom);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.validFrom) || d.validFrom < today) errors.push({ fieldId: 'pr-from', message: 'Choose today or a later date' });
  else if (shortNotice) errors.push({ fieldId: 'pr-from', message: `A price rise gives customers 90 days' notice: choose ${noticeFrom} or later` });
  if (d.reason.trim().length < 5) errors.push({ fieldId: 'pr-reason', message: 'Write a reason of at least 5 characters' });
  return errors.length ? { input: null, errors } : { input: { currency: d.currency, unitPrice: d.unitPrice!, minimumMonthly: d.minimumMonthly!, validFrom: d.validFrom, reason: d.reason.trim() }, errors };
}

function PriceDrawer({ product, today, onClose, onSave }: { product: Product; today: string; onClose: () => void; onSave: (input: NewPrice) => Promise<void> }) {
  const [draft, setDraft] = useState({ currency: 'INR' as 'INR' | 'USD', unitPrice: null as number | null, minimumMonthly: null as number | null, validFrom: isoAfter(today, NOTICE_DAYS), reason: '' });
  const [dirty, setDirty] = useState(false);
  const { busy, error, run } = useRun();
  const set = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const { input, errors } = priceInput(draft, product, today);
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  return (
    <EditorDrawer
      open
      onClose={onClose}
      dirty={dirty}
      title={`New price for ${product.name}`}
      subtitle={`Per ${product.unit} per month, before GST`}
      errors={saveErrors.shownErrors}
      saving={busy === 'save'}
      failed={error}
      saveLabel="Plan this price"
      onSave={() => {
        if (!input) return saveErrors.reveal();
        void run('save', () => onSave(input)).then((ok) => ok && onClose());
      }}
    >
      <FormSection title="Price" description="A price in force never changes. A lower price may start today. A higher one starts at least 90 days away, so every customer is told in time.">
        <FormField label="Currency">
          <Segment label="Currency" options={[{ value: 'INR', label: 'Rupees (India)' }, { value: 'USD', label: 'US dollars' }]} value={draft.currency} onChange={(currency) => set({ currency })} />
        </FormField>
        <FormField id="pr-unit" label={`Price per ${product.unit}`} required error={errorOf('pr-unit')}>
          <NumberField decimals value={draft.unitPrice} onChange={(unitPrice) => set({ unitPrice })} min={0} max={1_000_000} suffix={draft.currency} />
        </FormField>
        <FormField id="pr-min" label="Monthly minimum" required helper="The least a company pays in a month for this product." error={errorOf('pr-min')}>
          <NumberField decimals value={draft.minimumMonthly} onChange={(minimumMonthly) => set({ minimumMonthly })} min={0} max={10_000_000} suffix={draft.currency} />
        </FormField>
        <FormField id="pr-from" label="Starts on" required helper="Format: YYYY-MM-DD." error={errorOf('pr-from')}>
          <TextField value={draft.validFrom} onChange={(validFrom) => set({ validFrom: validFrom.trim() })} maxLength={10} inputMode="numeric" />
        </FormField>
        <FormField id="pr-reason" label="Reason" required helper="Kept in the audit log." error={errorOf('pr-reason')}>
          <TextArea value={draft.reason} onChange={(reason) => set({ reason })} rows={2} maxLength={500} />
        </FormField>
      </FormSection>
    </EditorDrawer>
  );
}

export interface PlansScreenProps {
  state: LoadState;
  onRetry?: () => void;
  products: Product[];
  canManage: boolean;
  /** Today in India (YYYY-MM-DD). */
  today: string;
  onSchedule: (code: string, input: NewPrice) => Promise<void>;
  onWithdraw: (priceId: string) => Promise<void>;
}

/** Console › Plans and prices (P14 §4, YX-BILL-01/13/14): one plan per product, prices per currency, dated. */
export function PlansScreen(props: PlansScreenProps) {
  const [editing, setEditing] = useState<{ product: Product; key: number } | null>(null);
  const [dialog, ask] = useConfirm();
  const money = (p: ProductPrice, v: number) => formatMoney(v, p.currency, p.currency === 'INR' ? 'en-IN' : 'en-US');
  const columns: TableColumn<ProductPrice>[] = [
    { key: 'currency', header: 'Currency', value: (p) => p.currency, width: 110, hideable: false },
    { key: 'unit', header: 'Price per unit', value: (p) => p.unitPrice, render: (p) => money(p, p.unitPrice), width: 140 },
    { key: 'min', header: 'Monthly minimum', value: (p) => p.minimumMonthly, render: (p) => money(p, p.minimumMonthly), width: 160 },
    { key: 'from', header: 'From', value: (p) => p.validFrom, render: (p) => day(p.validFrom), width: 130 },
    { key: 'state', header: 'State', value: (p) => p.state, render: (p) => <Badge tone={STATE[p.state].tone}>{STATE[p.state].label}</Badge>, width: 120 },
    { key: 'reason', header: 'Reason', value: (p) => p.reason, width: 260, optional: true },
  ];
  return (
    <ConsolePage crumb="Plans and prices" title="Plans and prices" description="One plan per product, every feature included. Prices are before GST." state={props.state} onRetry={props.onRetry} what="the plans">
      {props.products.map((product) => (
        <Card key={product.code} title={product.name} actions={props.canManage ? <Button onClick={() => setEditing({ product, key: Date.now() })}>New price</Button> : undefined}>
          <div className="yx-auth__stack">
            <Text tone="secondary">Billed per {product.unit} per month.</Text>
            <DataTable
              label={`${product.name} prices`}
              columns={columns}
              rows={product.prices}
              getRowId={(p) => p.id}
              rowNoun={['price', 'prices']}
              cardSummary
              rowActions={
                props.canManage
                  ? (p) =>
                      p.state === 'scheduled' ? (
                        <MenuItem destructive onSelect={() => ask({ title: `Withdraw the planned ${p.currency} price?`, consequence: `It was to start on ${day(p.validFrom)}. The price in force stays.`, confirmLabel: 'Withdraw price', destructive: true, action: () => props.onWithdraw(p.id) })}>
                          Withdraw planned price
                        </MenuItem>
                      ) : null
                  : undefined
              }
            />
          </div>
        </Card>
      ))}
      {dialog}
      {editing && <PriceDrawer key={editing.key} product={editing.product} today={props.today} onClose={() => setEditing(null)} onSave={(input) => props.onSchedule(editing.product.code, input)} />}
    </ConsolePage>
  );
}

