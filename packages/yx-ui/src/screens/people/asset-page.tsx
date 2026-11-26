// IT assets (plan 26 Nov 2026), the part with no open question: one asset's page, opened from the register (PPL-25).
// Details (with maker, model, invoice number and warranty) and History (added, changed, issued, confirmed, taken back).
// Asset managers of its place edit the details. Tickets, licences and bookings join as tabs when their answers arrive.
import { useState } from 'react';
import { Laptop, Pencil } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { CurrencyField, NumberField, TextField } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { Select } from '../../components/select';
import { Breadcrumbs, Card, DescriptionList, ObjectHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Timeline } from '../../components/timeline';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { PeopleFrame } from './people-kit';

export type AssetStatus = 'in_stock' | 'assigned' | 'in_repair' | 'retired' | 'lost';
export interface AssetPageData {
  today: string;
  canManage: boolean;
  /** Answer 2711: false when the viewer may not see money on this asset (no cost is sent). */
  money?: boolean;
  asset: {
    id: string;
    categoryId?: string | null;
    category: string;
    name: string;
    tag: string;
    serial: string | null;
    maker: string | null;
    model: string | null;
    status: AssetStatus;
    legalEntityId: string | null;
    locationId: string | null;
    legalEntity: string | null;
    location: string | null;
    purchasedOn: string | null;
    cost?: string | null;
    /** Answer 2713 (money, as the cost): the net book value today (null: no cost, date or depreciation) and how it is worked out. */
    netBookValue?: string | null;
    depreciation?: string | null;
    invoiceNumber: string | null;
    warrantyMonths: number | null;
    warrantyEndsOn: string | null;
    version: number;
  };
  holder: { name: string; issuedOn: string; acknowledged: boolean; ackNone?: boolean } | null;
  /** Newest first; `at` is a day (YYYY-MM-DD) or a moment (ISO). */
  history: { id: string; at: string; who: string; what: string }[];
}
export interface AssetDetailsInput {
  /** IT assets part 1 (answer 2712): a category from the company list. */
  categoryId?: string;
  name: string;
  serial: string | null;
  maker: string | null;
  model: string | null;
  purchasedOn: string | null;
  cost: string | null;
  invoiceNumber: string | null;
  warrantyMonths: number | null;
}
export interface LiveAssetPage {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  data: AssetPageData | null;
  onBack: () => void;
  /** Asset managers of its place (asset.manage); the page shows Edit details only when given. */
  onSave?: (input: AssetDetailsInput) => Promise<unknown>;
  /** The company's categories (Settings 2.8) to choose from in Edit details. */
  categories?: { value: string; label: string }[];
}

const SAMPLE_CATEGORIES = ['Laptop', 'Phone', 'SIM', 'Tools'].map((x) => ({ value: x, label: x }));
const STATUS: Record<AssetStatus, { text: string; tone: BadgeTone }> = {
  in_stock: { text: 'In stock', tone: 'success' },
  assigned: { text: 'Assigned', tone: 'info' },
  in_repair: { text: 'In repair', tone: 'warning' },
  retired: { text: 'Retired', tone: 'neutral' },
  lost: { text: 'Lost', tone: 'danger' },
};
const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);
const at = (s: string) => (s.length > 10 ? new Date(s) : day(s));
const dash = (s: string | null | undefined) => (s && s.trim() ? s : '—');
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const inr = (s: string) => `₹${Number(s).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The asset page: the designed view (sample data) or, with `live`, the real asset. */
export function AssetPageScreen(props: { data: AssetPageData; tab?: 'details' | 'history'; editing?: boolean } | { live: LiveAssetPage }) {
  if ('live' in props) {
    const l = props.live;
    if (l.state === 'no-access') return <Frame onBack={l.onBack}><NoAccessState what="the assets" grantedBy="your IT or HR admin" /></Frame>;
    if (l.state === 'error') return <Frame onBack={l.onBack}><ErrorState title="We couldn't load this asset" description="Check your connection and try again." onRetry={l.onRetry} /></Frame>;
    if (l.state === 'loading' || !l.data) return <Frame onBack={l.onBack}><Skeleton height={360} /></Frame>;
    return <AssetPage data={l.data} onBack={l.onBack} onSave={l.data.canManage ? l.onSave : undefined} categories={l.categories} />;
  }
  return <AssetPage data={props.data} tab={props.tab} editing={props.editing} onBack={() => undefined} onSave={props.data.canManage ? () => Promise.resolve() : undefined} categories={SAMPLE_CATEGORIES} />;
}

function Frame({ onBack, tag, children }: { onBack: () => void; tag?: string; children: React.ReactNode }) {
  return (
    <PeopleFrame active="Assets">
      <Breadcrumbs items={[{ label: 'Assets', onClick: onBack }, { label: tag ?? 'Asset' }]} />
      {children}
    </PeopleFrame>
  );
}

function AssetPage({ data, tab = 'details', editing = false, onBack, onSave, categories }: { data: AssetPageData; tab?: 'details' | 'history'; editing?: boolean; onBack: () => void; onSave?: LiveAssetPage['onSave']; categories?: LiveAssetPage['categories'] }) {
  const [open, setOpen] = useState(editing);
  const a = data.asset;
  const ended = a.warrantyEndsOn != null && a.warrantyEndsOn < data.today;
  const warranty = a.warrantyMonths == null ? '—' : a.warrantyEndsOn ? `${a.warrantyMonths} months · ${ended ? 'ended' : 'ends'} ${formatDate(day(a.warrantyEndsOn))}` : `${a.warrantyMonths} months (add the purchase date to see when it ends)`;
  return (
    <Frame onBack={onBack} tag={a.tag}>
      <ObjectHeader
        name={a.name}
        icon={Laptop}
        secondary={`${a.category} · ${a.tag}`}
        status={<Badge tone={STATUS[a.status].tone}>{STATUS[a.status].text}</Badge>}
        facts={[
          { label: 'With', value: data.holder ? data.holder.name : 'Nobody' },
          { label: 'Location', value: dash(a.location) },
          { label: 'Warranty', value: a.warrantyEndsOn ? `${ended ? 'Ended' : 'Ends'} ${formatDate(day(a.warrantyEndsOn))}` : '—' },
        ]}
        actions={
          onSave ? (
            <Button icon={Pencil} onClick={() => setOpen(true)}>
              Edit details
            </Button>
          ) : undefined
        }
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Asset">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <Card>
            <DescriptionList
              columns={2}
              items={[
                { label: 'Asset tag', value: a.tag, mono: true, copyValue: a.tag },
                { label: 'Category', value: a.category },
                { label: 'Maker', value: dash(a.maker) },
                { label: 'Model', value: dash(a.model) },
                { label: 'Serial number', value: dash(a.serial), mono: Boolean(a.serial) },
                { label: 'Status', value: STATUS[a.status].text },
                { label: 'With', value: data.holder ? `${data.holder.name} since ${formatDate(day(data.holder.issuedOn))} · ${data.holder.ackNone ? 'no confirmation asked' : data.holder.acknowledged ? 'confirmed' : 'waiting for confirmation'}` : 'Nobody' },
                { label: 'Legal entity', value: dash(a.legalEntity) },
                { label: 'Location', value: dash(a.location) },
                { label: 'Purchased', value: a.purchasedOn ? formatDate(day(a.purchasedOn)) : '—' },
                // Answer 2711: money only for asset managers of its place and asset.finance.view holders.
                ...(data.money === false ? [] : [{ label: 'Cost', value: a.cost ? inr(a.cost) : '—' }]),
                // Answer 2713: a management figure from the category's depreciation, not the tax books.
                ...(data.money === false
                  ? []
                  : [
                      { label: 'Net book value today', value: a.netBookValue ? inr(a.netBookValue) : '—' },
                      { label: 'Depreciation', value: a.netBookValue ? `${a.depreciation ?? 'From its category'} · a management figure, not the tax books` : !a.cost || !a.purchasedOn ? 'Needs the cost and the purchase date' : 'Its category has no depreciation (Settings › Assets)' },
                    ]),
                { label: 'Invoice number', value: dash(a.invoiceNumber), mono: Boolean(a.invoiceNumber) },
                { label: 'Warranty', value: ended ? <Badge tone="danger">{warranty}</Badge> : warranty },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <Timeline aria-label="Asset history" items={data.history.map((h) => ({ id: h.id, actor: { name: h.who }, action: h.what, at: at(h.at) }))} today={day(data.today)} />
          </Card>
        </TabsContent>
      </Tabs>
      {open && onSave && <EditDetailsDrawer data={data} categories={categories} onClose={() => setOpen(false)} onSave={onSave} />}
    </Frame>
  );
}

function EditDetailsDrawer({ data, categories, onClose, onSave }: { data: AssetPageData; categories?: LiveAssetPage['categories']; onClose: () => void; onSave: NonNullable<LiveAssetPage['onSave']> }) {
  const { toast } = useToast();
  const a = data.asset;
  // A category retired since stays choosable for the asset that already has it.
  const choices = categories && a.categoryId && !categories.some((x) => x.value === a.categoryId) ? [{ value: a.categoryId, label: a.category }, ...categories] : categories;
  const [category, setCategory] = useState<string | null>(a.categoryId ?? null);
  const [name, setName] = useState(a.name);
  const [serial, setSerial] = useState(a.serial ?? '');
  const [maker, setMaker] = useState(a.maker ?? '');
  const [model, setModel] = useState(a.model ?? '');
  const [purchased, setPurchased] = useState<Date | null>(a.purchasedOn ? day(a.purchasedOn) : null);
  const [cost, setCost] = useState<number | null>(a.cost ? Number(a.cost) : null);
  const [invoice, setInvoice] = useState(a.invoiceNumber ?? '');
  const [months, setMonths] = useState<number | null>(a.warrantyMonths);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const costText = cost == null ? null : cost.toFixed(2);
  const problems = {
    category: !choices || category ? null : 'Choose the category.',
    name: name.trim() ? null : 'Enter the name.',
    cost: costText == null || MONEY.test(costText) ? null : 'Enter an amount like 54000 or 54000.50.',
    months: months == null || (Number.isInteger(months) && months >= 0 && months <= 120) ? null : 'Enter 0 to 120 months.',
  };
  const shown = (k: keyof typeof problems) => (tried ? problems[k] : null);
  const save = async () => {
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...(choices && category ? { categoryId: category } : {}), name: name.trim(), serial: serial.trim() || null, maker: maker.trim() || null, model: model.trim() || null, purchasedOn: purchased ? keyOf(purchased) : null, cost: costText, invoiceNumber: invoice.trim() || null, warrantyMonths: months });
      toast({ tone: 'success', title: `${name.trim()} (${a.tag}) saved.` });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${a.tag}`}
      dirty
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save details
          </Button>
        </>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="Not saved">
          {error}
        </InlineAlert>
      )}
      <div className="yx-lif-grid">
        {choices && (
          <FormField id="ad-category" label="Category" required helper="The list is in Settings › Assets." error={shown('category')}>
            <Select aria-label="Category" value={category} onChange={setCategory} options={choices} />
          </FormField>
        )}
        <FormField id="ad-name" label="Name" required error={shown('name')}>
          <TextField value={name} onChange={setName} maxLength={150} />
        </FormField>
        <FormField id="ad-serial" label="Serial number" optional>
          <TextField value={serial} onChange={setSerial} maxLength={100} />
        </FormField>
        <FormField id="ad-maker" label="Maker" optional helper="For example Dell, Apple, Samsung.">
          <TextField value={maker} onChange={setMaker} maxLength={100} />
        </FormField>
        <FormField id="ad-model" label="Model" optional>
          <TextField value={model} onChange={setModel} maxLength={100} />
        </FormField>
        <FormField id="ad-purchased" label="Purchased on" optional>
          <DatePicker value={purchased} onChange={setPurchased} max={day(data.today)} />
        </FormField>
        <FormField id="ad-cost" label="Cost" optional error={shown('cost')}>
          <CurrencyField value={cost} onChange={setCost} allowPaise />
        </FormField>
        <FormField id="ad-invoice" label="Invoice number" optional>
          <TextField value={invoice} onChange={setInvoice} maxLength={60} />
        </FormField>
        <FormField id="ad-warranty" label="Warranty" optional helper="Months from the purchase date; the end date follows." error={shown('months')}>
          <NumberField value={months} onChange={setMonths} min={0} max={120} suffix="months" />
        </FormField>
      </div>
    </Drawer>
  );
}
