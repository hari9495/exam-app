// IT assets part 3 (founder answer 2717): asset contracts (People › Asset contracts; Helpdesk › IT contracts). A contract
// has a type, number, supplier, an optional place, a start and a length (the end follows), tacit or express renewal, a
// notice period, support hours, a value (money: managers of its place and Finance only) and the assets it covers, with
// an optional cap. The list opens a contract in a drawer with its assets; asset managers of its place edit it.
// Answer 2714: a contract within its notice window shows "Give notice by". Helpdesk tickets to a supplier come later.
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge } from '../../components/display';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { CurrencyField, NumberField, TextField } from '../../components/inputs';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Text } from '../../components/foundations';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { PeopleFrame, Segment } from './people-kit';

export type ContractKind = 'amc' | 'support' | 'lease' | 'insurance' | 'subscription' | 'other';
export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = { amc: 'Maintenance (AMC)', support: 'Support', lease: 'Lease or rental', insurance: 'Insurance', subscription: 'Subscription', other: 'Other' };
type Choice = { value: string; label: string };

export interface ContractRow {
  id: string;
  kind: ContractKind;
  number: string;
  supplierId: string;
  supplier: string;
  legalEntityId: string | null;
  locationId: string | null;
  /** The location (or legal entity) name; null: company-wide. */
  place: string | null;
  startsOn: string;
  months: number;
  endsOn: string;
  noticeDays: number;
  noticeOn: string;
  renewal: 'tacit' | 'express';
  renewals: number;
  supportHours: string | null;
  /** Answer 2711: left out for whoever may not see money. */
  value?: string | null;
  assetCap: number | null;
  /** The covered assets the viewer sees; the rest only as hiddenAssets. */
  assets: { id: string; tag: string; name: string; category: string }[];
  hiddenAssets: number;
  status: 'active' | 'ended';
  canManage: boolean;
  version: number;
}
export interface ContractInput {
  kind: ContractKind;
  number: string;
  supplierId: string;
  legalEntityId: string | null;
  locationId: string | null;
  startsOn: string;
  months: number;
  renewal: 'tacit' | 'express';
  noticeDays: number;
  supportHours: string | null;
  value: string | null;
  assetCap: number | null;
  assetIds: string[];
  version?: number;
}
export interface LiveContracts {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  today: string;
  rows: ContractRow[];
  /** false hides the Value column and field. */
  money?: boolean;
  /** asset.manage at any scope: Add contract. */
  canAdd: boolean;
  /** The active suppliers, places and the assets the viewer sees, for the form. */
  suppliers: Choice[];
  entities: Choice[];
  locations: (Choice & { entityId: string })[];
  assets: Choice[];
  onSave: (id: string | null, input: ContractInput) => Promise<unknown>;
  onOpenAsset?: (id: string) => void;
  /** A contract to open at once (from an asset page). */
  open?: string | null;
}
type Show = 'active' | 'ended';

const day = (s: string) => new Date(`${s}T00:00:00`);
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inr = (s: string) => `₹${Number(s).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const months = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`;
/** The day before start + length (12 months from 1 Jan ends 31 Dec), as the API works it out. */
function endOf(start: string, length: number): string {
  const [y, m, d] = start.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + length, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)) - 86_400_000);
  return end.toISOString().slice(0, 10);
}
const minusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
/** Answer 2714: an active contract between its notice date and its end. */
const inNotice = (k: ContractRow, today: string) => k.status === 'active' && k.noticeOn <= today && today <= k.endsOn;
const renewalText = (k: Pick<ContractRow, 'renewal' | 'months'>) => (k.renewal === 'tacit' ? `Tacit: renews by itself for another ${months(k.months)} unless notice is given` : 'Express: ends on its end date unless you renew it');

/** The contract list: the designed view (sample data) or, with `live`, the company's contracts. */
export function AssetContractsScreen(props: { rows: ContractRow[]; today: string; money?: boolean; canAdd?: boolean; show?: Show; open?: string; editing?: 'new' | string } | { live: LiveContracts }) {
  if ('live' in props) return <ContractList {...props.live} />;
  return <ContractList state="ready" onRetry={() => undefined} rows={props.rows} today={props.today} money={props.money} canAdd={props.canAdd ?? true} {...SAMPLE_FORM} onSave={() => Promise.resolve()} onOpenAsset={() => undefined} open={props.open} show={props.show} editing={props.editing} />;
}

/** The design's form choices (sample data). */
const SAMPLE_FORM = {
  suppliers: [{ value: 's1', label: 'Dell India Pvt Ltd' }, { value: 's2', label: 'Redington Ltd' }],
  entities: [{ value: 'e1', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }],
  locations: [{ value: 'l1', label: 'Hosur plant', entityId: 'e1' }, { value: 'l2', label: 'Chennai office', entityId: 'e1' }],
  assets: [{ value: 'a1', label: 'LT-0418 · Dell Latitude 5440' }, { value: 'a2', label: 'LT-0419 · Dell Latitude 5440' }, { value: 'a3', label: 'PR-0007 · HP LaserJet M404' }],
};

function ContractList({ state, onRetry, today, rows, money, canAdd, suppliers, entities, locations, assets, onSave, onOpenAsset, open: initialOpen, show: initialShow = 'active', editing: initialEditing }: LiveContracts & { show?: Show; editing?: 'new' | string }) {
  const [show, setShow] = useState<Show>(initialShow);
  const [viewing, setViewing] = useState<string | null>(initialOpen ?? null);
  const [editing, setEditing] = useState<'new' | string | null>(initialEditing ?? null);
  const shown = rows.filter((k) => k.status === show);
  const viewed = viewing ? rows.find((k) => k.id === viewing) ?? null : null;
  const edited = editing && editing !== 'new' ? rows.find((k) => k.id === editing) ?? null : null;
  const cols: TableColumn<ContractRow>[] = [
    { key: 'number', header: 'Contract', type: 'id', value: (k) => k.number, render: (k) => <Link href={`#${k.id}`} onClick={(e) => (e.preventDefault(), setViewing(k.id))}>{k.number}</Link>, width: 160 },
    { key: 'kind', header: 'Type', value: (k) => CONTRACT_KIND_LABEL[k.kind], width: 160 },
    { key: 'supplier', header: 'Supplier', value: (k) => k.supplier, width: 200 },
    { key: 'place', header: 'Place', value: (k) => k.place ?? 'Company-wide', width: 160 },
    {
      key: 'endsOn',
      header: 'Ends',
      value: (k) => k.endsOn,
      render: (k) => (
        <span>
          {formatDate(day(k.endsOn))}
          {inNotice(k, today) && <Text as="div" size="sm"><Badge tone="warning">{`Give notice by ${formatDate(day(k.noticeOn))}`}</Badge></Text>}
        </span>
      ),
      width: 190,
    },
    { key: 'renewal', header: 'Renewal', value: (k) => (k.renewal === 'tacit' ? 'Tacit' : 'Express'), render: (k) => <span>{k.renewal === 'tacit' ? 'Tacit' : 'Express'}{k.renewals > 0 && <Text as="div" size="sm" tone="secondary">{`Renewed ${k.renewals} ${k.renewals === 1 ? 'time' : 'times'}`}</Text>}</span>, width: 130 },
    { key: 'assets', header: 'Assets', type: 'number', value: (k) => k.assets.length + k.hiddenAssets, render: (k) => <span>{k.assetCap ? `${k.assets.length + k.hiddenAssets} of ${k.assetCap}` : String(k.assets.length + k.hiddenAssets)}</span>, width: 100 },
    ...(money === false ? [] : [{ key: 'value', header: 'Value', type: 'money', value: (k) => (k.value ? Number(k.value) : null), width: 130 } as TableColumn<ContractRow>]),
  ];
  return (
    <PeopleFrame active="Assets">
      <PageHeader
        title="Asset contracts"
        description="Maintenance, support, leases and other contracts for your assets. A tacit contract renews by itself at its end; an express one ends. Asset managers are told at the notice date."
        actions={canAdd ? <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add contract</Button> : undefined}
      />
      {state === 'no-access' ? (
        <NoAccessState what="the asset contracts" grantedBy="your IT or HR admin" />
      ) : state === 'error' ? (
        <ErrorState title="We couldn't load the contracts" description="Check your connection and try again." onRetry={onRetry} />
      ) : (
        <Card>
          <div className="yx-set-stack">
            <Segment<Show> label="Show" value={show} onChange={setShow} options={[{ value: 'active', label: 'Active' }, { value: 'ended', label: 'Ended' }]} />
            <DataTable
              label="Asset contracts"
              columns={cols}
              rows={shown}
              getRowId={(k) => k.id}
              state={state === 'loading' ? 'loading' : 'ready'}
              empty={show === 'ended' ? <EmptyState title="No ended contracts" description="An express contract ends on its end date." /> : <EmptyState title="No contracts yet" description="Add your maintenance and support contracts to be told before their notice dates." action={canAdd ? <Button onClick={() => setEditing('new')}>Add contract</Button> : undefined} />}
            />
          </div>
        </Card>
      )}
      {viewed && !editing && <ContractView k={viewed} today={today} onClose={() => setViewing(null)} onEdit={viewed.canManage ? () => setEditing(viewed.id) : undefined} onOpenAsset={onOpenAsset} />}
      {(editing === 'new' || edited) && (
        <ContractForm key={editing} k={edited} today={today} money={money !== false} suppliers={suppliers} entities={entities} locations={locations} assets={assets} onClose={() => setEditing(null)} onSave={onSave} />
      )}
    </PeopleFrame>
  );
}

function ContractView({ k, today, onClose, onEdit, onOpenAsset }: { k: ContractRow; today: string; onClose: () => void; onEdit?: () => void; onOpenAsset?: (id: string) => void }) {
  const cols: TableColumn<ContractRow['assets'][number]>[] = [
    { key: 'tag', header: 'Tag', type: 'id', value: (a) => a.tag, render: onOpenAsset ? (a) => <Link href={`#${a.id}`} onClick={(e) => (e.preventDefault(), onOpenAsset(a.id))}>{a.tag}</Link> : undefined, width: 130 },
    { key: 'name', header: 'Asset', value: (a) => a.name, width: 220 },
    { key: 'category', header: 'Category', value: (a) => a.category, width: 140 },
  ];
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${CONTRACT_KIND_LABEL[k.kind]} ${k.number}`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {onEdit && (
            <Button variant="primary" icon={Pencil} onClick={onEdit}>
              Edit contract
            </Button>
          )}
        </>
      }
    >
      <div className="yx-set-stack">
        {inNotice(k, today) && <InlineAlert tone="warning" title={`Give notice by ${formatDate(day(k.noticeOn))} if you do not want it to ${k.renewal === 'tacit' ? 'renew' : 'run to its end'}.`} />}
        {k.status === 'ended' && <InlineAlert tone="info" title={`Ended on ${formatDate(day(k.endsOn))}.`} />}
        <DescriptionList
          columns={2}
          items={[
            { label: 'Supplier', value: k.supplier },
            { label: 'Place', value: k.place ?? 'Company-wide' },
            { label: 'Starts', value: formatDate(day(k.startsOn)) },
            { label: 'Length', value: months(k.months) },
            { label: 'Ends', value: `${formatDate(day(k.endsOn))}${k.renewals ? ` · renewed ${k.renewals} ${k.renewals === 1 ? 'time' : 'times'}` : ''}` },
            { label: 'Notice', value: k.noticeDays ? `${k.noticeDays} days · give notice by ${formatDate(day(k.noticeOn))}` : 'None' },
            { label: 'Renewal', value: renewalText(k) },
            { label: 'Support hours', value: k.supportHours ?? '—' },
            ...(k.value === undefined ? [] : [{ label: 'Value', value: k.value ? inr(k.value) : '—' }]),
            { label: 'Assets covered', value: k.assetCap ? `${k.assets.length + k.hiddenAssets} of up to ${k.assetCap}` : `${k.assets.length + k.hiddenAssets} (no cap)` },
          ]}
        />
        {k.assets.length ? <DataTable label="Assets this contract covers" columns={cols} rows={k.assets} getRowId={(a) => a.id} state="ready" /> : <InlineAlert tone="info" title="No assets you see are on this contract." />}
        {k.hiddenAssets > 0 && <InlineAlert tone="info" title={`${k.hiddenAssets} more ${k.hiddenAssets === 1 ? 'asset is' : 'assets are'} at places you do not look after.`} />}
      </div>
    </Drawer>
  );
}

function ContractForm({ k, today, money, suppliers, entities, locations, assets, onClose, onSave }: { k: ContractRow | null; today: string; money: boolean; suppliers: Choice[]; entities: Choice[]; locations: (Choice & { entityId: string })[]; assets: Choice[]; onClose: () => void; onSave: LiveContracts['onSave'] }) {
  const { toast } = useToast();
  // A supplier retired since stays choosable for the contract that already names it; so do covered assets.
  const supplierChoices = k && !suppliers.some((x) => x.value === k.supplierId) ? [{ value: k.supplierId, label: k.supplier }, ...suppliers] : suppliers;
  const assetChoices = [...(k?.assets ?? []).filter((a) => !assets.some((x) => x.value === a.id)).map((a) => ({ value: a.id, label: `${a.tag} · ${a.name}` })), ...assets];
  const [kind, setKind] = useState<ContractKind | null>(k?.kind ?? null);
  const [number, setNumber] = useState(k?.number ?? '');
  const [supplier, setSupplier] = useState<string | null>(k?.supplierId ?? null);
  const [entity, setEntity] = useState<string | null>(k ? k.legalEntityId : entities.length === 1 ? entities[0].value : null);
  const [location, setLocation] = useState<string | null>(k?.locationId ?? null);
  const [start, setStart] = useState<Date | null>(k ? day(k.startsOn) : null);
  const [length, setLength] = useState<number | null>(k?.months ?? 12);
  const [renewal, setRenewal] = useState<'tacit' | 'express'>(k?.renewal ?? 'tacit');
  const [notice, setNotice] = useState<number | null>(k?.noticeDays ?? 30);
  const [hours, setHours] = useState(k?.supportHours ?? '');
  const [value, setValue] = useState<number | null>(k?.value ? Number(k.value) : null);
  const [cap, setCap] = useState<number | null>(k?.assetCap ?? null);
  const [covered, setCovered] = useState<string[]>(k?.assets.map((a) => a.id) ?? []);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = covered.length + (k?.hiddenAssets ?? 0);
  const problems = {
    kind: kind ? null : 'Choose the type.',
    number: number.trim() ? null : 'Enter the contract number.',
    supplier: supplier ? null : 'Choose the supplier.',
    start: start ? null : 'Give the start date.',
    length: length != null && Number.isInteger(length) && length >= 1 && length <= 120 ? null : 'Enter 1 to 120 months.',
    notice: notice != null && Number.isInteger(notice) && notice >= 0 && notice <= 365 ? null : 'Enter 0 to 365 days.',
    cap: cap == null || (Number.isInteger(cap) && cap >= 1 && cap <= 10000) ? (cap != null && total > cap ? `It covers ${total} assets; the cap is ${cap}.` : null) : 'Enter 1 to 10000, or leave it empty.',
  };
  const shown = (x: keyof typeof problems) => (tried ? problems[x] : null);
  const ends = start && !problems.length ? endOf(keyOf(start), length!) : null;
  const save = async () => {
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(k?.id ?? null, { kind: kind!, number: number.trim(), supplierId: supplier!, legalEntityId: entity, locationId: location, startsOn: keyOf(start!), months: length!, renewal, noticeDays: notice!, supportHours: hours.trim() || null, value: money ? (value == null ? null : value.toFixed(2)) : (k?.value ?? null), assetCap: cap, assetIds: covered, ...(k ? { version: k.version } : {}) });
      toast({ tone: 'success', title: `Contract ${number.trim()} saved.` });
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
      title={k ? `Edit ${k.number}` : 'Add contract'}
      size="lg"
      dirty={Boolean(number || supplier)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {k ? 'Save contract' : 'Add contract'}
          </Button>
        </>
      }
    >
      <div className="yx-set-stack">
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        <div className="yx-lif-grid">
          <FormField id="ct-kind" label="Type" required error={shown('kind')}>
            <Select aria-label="Type" value={kind} onChange={(x) => setKind(x as ContractKind)} options={(Object.keys(CONTRACT_KIND_LABEL) as ContractKind[]).map((x) => ({ value: x, label: CONTRACT_KIND_LABEL[x] }))} />
          </FormField>
          <FormField id="ct-number" label="Contract number" required error={shown('number')}>
            <TextField value={number} onChange={setNumber} maxLength={60} />
          </FormField>
          <FormField id="ct-supplier" label="Supplier" required helper="The list is in People › Asset suppliers." error={shown('supplier')}>
            <Select aria-label="Supplier" value={supplier} onChange={setSupplier} options={supplierChoices} />
          </FormField>
          <FormField id="ct-entity" label="Legal entity" optional helper="Its asset managers are told at the notice date. Empty: company-wide.">
            <Select aria-label="Legal entity" value={entity} onChange={(x) => { setEntity(x); setLocation(null); }} options={entities} clearable />
          </FormField>
          <FormField id="ct-location" label="Location" optional>
            <Select aria-label="Location" value={location} onChange={setLocation} options={locations.filter((l) => l.entityId === entity)} disabled={!entity} clearable />
          </FormField>
          <FormField id="ct-start" label="Starts on" required error={shown('start')}>
            <DatePicker value={start} onChange={setStart} />
          </FormField>
          <FormField id="ct-length" label="Length" required helper={ends ? `Ends on ${formatDate(day(ends))}.` : 'Months from the start; the end date follows.'} error={shown('length')}>
            <NumberField value={length} onChange={setLength} min={1} max={120} suffix="months" />
          </FormField>
          <FormField id="ct-notice" label="Notice period" required helper={ends && !problems.notice ? `Give notice by ${formatDate(day(minusDays(ends, notice!)))}.` : 'Days before the end date.'} error={shown('notice')}>
            <NumberField value={notice} onChange={setNotice} min={0} max={365} suffix="days" />
          </FormField>
        </div>
        <FormField id="ct-renewal" label="Renewal" helper={renewalText({ renewal, months: length ?? 12 })}>
          <Segment<'tacit' | 'express'> label="Renewal" value={renewal} onChange={setRenewal} options={[{ value: 'tacit', label: 'Tacit' }, { value: 'express', label: 'Express' }]} />
        </FormField>
        <div className="yx-lif-grid">
          <FormField id="ct-hours" label="Support hours" optional helper="For example Mon to Sat, 9:00 to 18:00, or 24 x 7.">
            <TextField value={hours} onChange={setHours} maxLength={120} />
          </FormField>
          {money && (
            <FormField id="ct-value" label="Value" optional>
              <CurrencyField value={value} onChange={setValue} allowPaise />
            </FormField>
          )}
          <FormField id="ct-cap" label="Asset cap" optional helper="The most assets it may cover. Empty: no cap." error={shown('cap')}>
            <NumberField value={cap} onChange={setCap} min={1} max={10000} />
          </FormField>
        </div>
        <FormField id="ct-assets" label="Assets covered" optional helper={k?.hiddenAssets ? `${k.hiddenAssets} more at places you do not look after stay on it.` : 'Assets from the register you see.'}>
          <MultiSelect aria-label="Assets covered" value={covered} onChange={setCovered} options={assetChoices} searchable searchPlaceholder="Search tag or name" />
        </FormField>
        {today > (ends ?? today) && <Text as="p" size="sm" tone="secondary">{renewal === 'tacit' ? 'Its end date has passed: the daily check renews it for another length.' : 'Its end date has passed: the daily check marks it ended.'}</Text>}
      </div>
    </Drawer>
  );
}
