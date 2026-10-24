// PPL-25 Asset register + issue / return dialog + employee acknowledgement · PPL-26 Succession (M01 §3.6, §3.9 Q8).
import { useMemo, useState, type ReactNode } from 'react';
import { Download, Plus, Upload } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { PersonPicker, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { CurrencyField, TextArea, TextField } from '../../components/inputs';
import { Switch } from '../../components/choice';
import { MenuItem } from '../../components/menu';
import { Text } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { successionRisk, type Persona, type Readiness } from './people-logic';
import { ASSETS, SUCCESSION } from './people-data';
import { exportCsv, ListSkeleton, PeopleFrame, Segment, StatusBadge } from './people-kit';
import type { AssetRow } from './live/types';

/* ================================================================== PPL-25 asset register */

// cost: empty when the company did not record it (shown as "—", never ₹0).
export type Asset = Omit<(typeof ASSETS)[number], 'cost'> & { cost: number | null };
const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const FIELDS: FilterFieldDef[] = [
  { key: 'type', label: 'Type', type: 'multi', options: opt(['Laptop', 'Tablet', 'Phone', 'Two-wheeler']) },
  { key: 'status', label: 'Status', type: 'multi', options: opt(['In stock', 'Assigned', 'In repair', 'Retired', 'Lost']) },
  { key: 'location', label: 'Location', type: 'multi', options: opt(['Bengaluru head office', 'Chennai office', 'Hosur plant']) },
];
const STATUS_TONE = (v: unknown) => (v === 'Assigned' ? 'info' : v === 'In stock' ? 'success' : v === 'Lost' ? 'danger' : v === 'In repair' ? 'warning' : 'neutral');
const PEOPLE = [
  { id: 'p1', name: 'Kavya Reddy', role: 'Quality Inspector', department: 'Quality' },
  { id: 'p2', name: 'Arjun Kulkarni', role: 'Senior Quality Inspector', department: 'Quality' },
  { id: 'p3', name: 'Meera Iyer', role: 'Lab Analyst', department: 'Quality' },
];

export type AssetDialog = 'issue' | 'return' | null;

/** The live app's asset register (design audit step 3). */
export interface LiveAssets {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  /** Live rows: the design's row plus the API row it came from. */
  rows: (Asset & { live: AssetRow })[];
  today: Date;
  people: { id: string; name: string; role?: string; department?: string }[];
  onAdd?: () => void;
  onIssue: (a: AssetRow, input: { employeeId: string; issuedOn: string; condition: string }) => Promise<void>;
  onReturn: (a: AssetRow, input: { returnedOn: string; condition: string; status: 'in_stock' | 'in_repair' | 'lost'; recoveryAmount?: string }) => Promise<void>;
  /** The add-asset form the page opens. */
  children?: ReactNode;
}

const dayKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function LiveAssetDialogs({ live, issuing, returning, onClose }: { live: LiveAssets; issuing: AssetRow | null; returning: AssetRow | null; onClose: () => void }) {
  const [who, setWho] = useState<string | null>(null);
  const [on, setOn] = useState<Date | null>(live.today);
  const [condition, setCondition] = useState<string | null>(issuing ? 'New' : 'Good');
  const [note, setNote] = useState('');
  const [recovery, setRecovery] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFailed(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const first = (name: string) => name.split(' ')[0];
  // A leaver's damaged or missing asset can be charged on their F&F (design PPL-25 return dialog).
  const leavingOn = returning?.holder?.leavingOn ?? null;
  const holderFirst = first(returning?.holder?.name ?? 'They');
  const charge = Boolean(leavingOn) && (condition === 'Damaged' || condition === 'Not returned');
  return (
    <>
      <Dialog
        open={!!issuing}
        onOpenChange={(o) => !o && onClose()}
        title={issuing ? `Issue ${issuing.tag} · ${issuing.name}` : ''}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!who || !on || !condition} onClick={() => issuing && void run(() => live.onIssue(issuing, { employeeId: who!, issuedOn: dayKeyOf(on!), condition: condition! }))}>
              Issue asset
            </Button>
          </>
        }
      >
        <div className="yx-ppl__stack">
          {failed && <InlineAlert tone="danger" title={failed} />}
          <FormField label="Issue to" required>
            <PersonPicker people={live.people} value={who} onChange={setWho} placeholder="Find a person" />
          </FormField>
          <FormField label="Issued on" required>
            <DatePicker value={on} onChange={setOn} max={live.today} />
          </FormField>
          <FormField label="Condition" required>
            <Select options={opt(['New', 'Good', 'Fair'])} value={condition} onChange={setCondition} />
          </FormField>
          <Text size="sm" tone="secondary" as="p">
            {who ? `${first(live.people.find((p) => p.id === who)?.name ?? 'They')} gets` : 'The person gets'} a notification to acknowledge receipt with a click. Until then the asset shows &quot;Waiting&quot;.
          </Text>
        </div>
      </Dialog>
      <Dialog
        open={!!returning}
        onOpenChange={(o) => !o && onClose()}
        title={returning ? `Return ${returning.tag} from ${returning.holder?.name ?? 'the holder'}` : ''}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!on || !condition || (condition === 'Not returned' && note.trim().length < 3)}
              onClick={() =>
                returning &&
                void run(() =>
                  live.onReturn(returning, { returnedOn: dayKeyOf(on!), condition: [condition, note.trim()].filter(Boolean).join(': '), status: condition === 'Not returned' ? 'lost' : condition === 'Damaged' ? 'in_repair' : 'in_stock', ...(charge && recovery ? { recoveryAmount: recovery.toFixed(2) } : {}) }),
                )
              }
            >
              {condition === 'Not returned' ? 'Mark not returned' : 'Record return'}
            </Button>
          </>
        }
      >
        <div className="yx-ppl__stack">
          {failed && <InlineAlert tone="danger" title={failed} />}
          <FormField label={condition === 'Not returned' ? 'Recorded on' : 'Returned on'} required>
            <DatePicker value={on} onChange={setOn} max={live.today} />
          </FormField>
          <FormField label="Return condition" required>
            <Select options={opt(['Good', 'Fair', 'Damaged', 'Not returned'])} value={condition} onChange={setCondition} />
          </FormField>
          {charge && (
            <FormField label="Recovery amount" optional helper={`Added to ${holderFirst}'s F&F as a recovery line. HR can waive it.`}>
              <CurrencyField value={recovery} onChange={setRecovery} />
            </FormField>
          )}
          <FormField label={condition === 'Not returned' ? 'What happened' : 'Note'} required={condition === 'Not returned'} optional={condition !== 'Not returned'}>
            <TextArea rows={2} value={note} onChange={setNote} maxLength={150} />
          </FormField>
          <InlineAlert tone="info">
            {leavingOn ? `${holderFirst} is leaving on ${formatDate(new Date(`${leavingOn}T00:00:00`))}. ` : ''}
            {charge && recovery
              ? `The recovery goes on ${holderFirst}'s F&F and the clearance item is signed off.`
              : condition === 'Not returned'
              ? `A leaver's clearance item stays open for a recovery${returning?.cost ? ` of the asset's cost` : ''}.`
              : condition === 'Damaged'
                ? 'The asset goes to repair. A leaver’s clearance item for it is signed off.'
                : 'The asset is back in stock. A leaver’s clearance item for it is signed off.'}
          </InlineAlert>
        </div>
      </Dialog>
    </>
  );
}

function LiveAssetRegister({ live, persona }: { live: LiveAssets; persona: Persona }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [issuing, setIssuing] = useState<AssetRow | null>(null);
  const [returning, setReturning] = useState<AssetRow | null>(null);
  const rows = live.rows;
  const of = (f: (r: Asset) => string) => opt([...new Set(rows.map(f).filter(Boolean))].sort());
  const fields: FilterFieldDef[] = [
    { key: 'type', label: 'Type', type: 'multi', options: of((r) => r.type) },
    { key: 'status', label: 'Status', type: 'multi', options: of((r) => r.status) },
    { key: 'location', label: 'Location', type: 'multi', options: of((r) => r.location) },
  ];
  const shown = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    return (!s || [r.tag, r.name, r.serial, r.holder].some((x) => x.toLowerCase().includes(s))) && filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f));
  });
  const cols: TableColumn<Asset & { live: AssetRow }>[] = [
    { key: 'tag', header: 'Tag', type: 'id', value: (r) => r.tag, width: 130 },
    { key: 'name', header: 'Asset', value: (r) => r.name, render: (r) => <span>{r.name}<Text size="sm" tone="secondary" as="div">{[r.type, r.serial].filter(Boolean).join(' · ')}</Text></span>, width: 240 },
    { key: 'holder', header: 'With', value: (r) => r.holder, render: (r) => (r.holder ? <span>{r.holder}{r.live.holder && <Text size="sm" tone="secondary" as="div">{r.live.holder.acknowledged ? 'Acknowledged' : 'Waiting for acknowledgement'}</Text>}</span> : <span className="yx-table__none">—</span>), width: 200 },
    { key: 'location', header: 'Location', value: (r) => r.location, groupable: true, width: 180 },
    { key: 'purchased', header: 'Purchased', type: 'date', value: (r) => r.purchased, width: 130 },
    { key: 'cost', header: 'Cost', type: 'money', value: (r) => r.cost, total: 'sum', width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: STATUS_TONE, groupable: true, width: 120 },
  ];
  return (
    <PeopleFrame active="Assets" persona={persona}>
      <PageHeader
        title="Assets"
        description="What each person holds. Unreturned assets flow into exit clearance and, if you set a recovery, into F&F. Depreciation stays in your finance system."
        // Import and export of assets: not in the live app yet (left out).
        actions={live.onAdd ? <Button variant="primary" icon={Plus} onClick={live.onAdd}>Add asset</Button> : undefined}
      />
      {live.state === 'no-access' ? (
        <NoAccessState what="the assets" grantedBy="your HR admin" />
      ) : live.state === 'error' ? (
        <ErrorState title="We couldn't load the assets" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Assets"
          columns={cols}
          rows={shown}
          getRowId={(r) => r.id}
          state={live.state === 'loading' ? 'loading' : 'ready'}
          onExport={exportCsv('assets', shown, cols)}
          filtered={filters.length > 0 || q !== ''}
          onClearFilters={() => {
            setFilters([]);
            setQ('');
          }}
          toolbar={<FilterBar fields={fields} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search tag, serial or person" />}
          rowButtons={(r) =>
            !r.live.canManage ? null : r.live.status === 'in_stock' ? (
              <Button size="sm" onClick={() => setIssuing(r.live)}>
                Issue
              </Button>
            ) : r.live.status === 'assigned' ? (
              <Button size="sm" onClick={() => setReturning(r.live)}>
                Return
              </Button>
            ) : null
          }
          empty={<EmptyState title="No assets yet" description="Add laptops, phones, vehicles and safety kit." action={live.onAdd ? <Button onClick={live.onAdd}>Add asset</Button> : undefined} />}
        />
      )}
      {(issuing || returning) && (
        <LiveAssetDialogs
          key={(issuing ?? returning)!.id}
          live={live}
          issuing={issuing}
          returning={returning}
          onClose={() => {
            setIssuing(null);
            setReturning(null);
          }}
        />
      )}
      {live.children}
    </PeopleFrame>
  );
}

// PPL-25
export function AssetRegister(props: { rows: Asset[]; dialog?: AssetDialog; persona?: Persona; live?: LiveAssets }) {
  return props.live ? <LiveAssetRegister live={props.live} persona={props.persona ?? 'hr'} /> : <SampleAssetRegister {...props} />;
}

function SampleAssetRegister({ rows, dialog = null, persona = 'hr' }: { rows: Asset[]; dialog?: AssetDialog; persona?: Persona }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<AssetDialog>(dialog);
  const [condition, setCondition] = useState<string | null>('Damaged');
  const [recovery, setRecovery] = useState<number | null>(4500);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!s || [r.tag, r.name, r.serial, r.holder].some((x) => x.toLowerCase().includes(s))) && filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f)));
  }, [rows, filters, q]);
  const cols: TableColumn<Asset>[] = [
    { key: 'tag', header: 'Tag', type: 'id', value: (r) => r.tag, width: 130 },
    { key: 'name', header: 'Asset', value: (r) => r.name, render: (r) => <span>{r.name}<Text size="sm" tone="secondary" as="div">{r.type} · {r.serial}</Text></span>, width: 240 },
    { key: 'holder', header: 'With', value: (r) => r.holder, render: (r) => r.holder || <span className="yx-table__none">—</span>, width: 180 },
    { key: 'location', header: 'Location', value: (r) => r.location, groupable: true, width: 180 },
    { key: 'purchased', header: 'Purchased', type: 'date', value: (r) => r.purchased, width: 130 },
    { key: 'cost', header: 'Cost', type: 'money', value: (r) => r.cost, total: 'sum', width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: STATUS_TONE, groupable: true, width: 120 },
  ];
  return (
    <PeopleFrame active="Assets" persona={persona}>
      <PageHeader
        title="Assets"
        description="What each person holds. Unreturned assets flow into exit clearance and, if you set a recovery, into F&F. Depreciation stays in your finance system."
        actions={
          <>
            <Button icon={Upload}>Import</Button>
            <Button variant="primary" icon={Plus}>
              Add asset
            </Button>
          </>
        }
      />
      <DataTable
        label="Assets"
        columns={cols}
        rows={shown}
        getRowId={(r) => r.id}
        filtered={filters.length > 0 || q !== ''}
        onClearFilters={() => {
          setFilters([]);
          setQ('');
        }}
        toolbar={<FilterBar fields={FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search tag, serial or person" />}
        rowButtons={(r) =>
          r.status === 'In stock' ? (
            <Button size="sm" onClick={() => setOpen('issue')}>
              Issue
            </Button>
          ) : r.status === 'Assigned' ? (
            <Button size="sm" onClick={() => setOpen('return')}>
              Return
            </Button>
          ) : null
        }
        rowActions={() => (
          <>
            <MenuItem>Open asset</MenuItem>
            <MenuItem>Send to repair</MenuItem>
            <MenuItem>Mark lost</MenuItem>
          </>
        )}
        selectable
        bulkActions={() => (
          <Button size="sm" icon={Download}>
            Export selected
          </Button>
        )}
        onExport={() => {}}
        empty={<EmptyState title="No assets yet" description="Add laptops, phones, vehicles and safety kit, or import them from Excel." action={<Button variant="primary">Add asset</Button>} />}
      />
      <Dialog
        open={open === 'issue'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Issue KF-TAB-0045 · Inspection tablet"
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(null)}>
              Issue asset
            </Button>
          </>
        }
      >
        <div className="yx-ppl__stack">
          <FormField label="Issue to" required>
            <PersonPicker people={PEOPLE} value="p1" onChange={() => {}} />
          </FormField>
          <FormField label="Issued on" required>
            <DatePicker value={new Date(2026, 9, 5)} onChange={() => {}} />
          </FormField>
          <FormField label="Condition" required>
            <Select options={opt(['New', 'Good', 'Fair'])} value="New" onChange={() => {}} />
          </FormField>
          <Text size="sm" tone="secondary" as="p">Kavya gets a notification to acknowledge receipt with a click. Until then the asset shows "Waiting".</Text>
        </div>
      </Dialog>
      <Dialog
        open={open === 'return'}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Return KF-LAP-0187 from Meera Iyer"
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => setOpen(null)}>
              Record return
            </Button>
          </>
        }
      >
        <div className="yx-ppl__stack">
          <FormField label="Returned on" required>
            <DatePicker value={new Date(2026, 9, 16)} onChange={() => {}} />
          </FormField>
          <FormField label="Return condition" required>
            <Select options={opt(['Good', 'Fair', 'Damaged', 'Not returned'])} value={condition} onChange={setCondition} />
          </FormField>
          {(condition === 'Damaged' || condition === 'Not returned') && (
            <FormField label="Recovery amount" optional helper="Added to Meera's F&F as a recovery line. HR can waive it.">
              <CurrencyField value={recovery} onChange={setRecovery} />
            </FormField>
          )}
          <FormField label="Note" optional>
            <TextArea rows={2} defaultValue="Screen cracked at the top left corner." />
          </FormField>
          <InlineAlert tone="info">Meera is leaving on 19 Oct 2026. This return signs off the IT clearance item.</InlineAlert>
        </div>
      </Dialog>
    </PeopleFrame>
  );
}

// PPL-25 · phone (employee acknowledgement)
export function AssetAcknowledgePhone({ acknowledged = false }: { acknowledged?: boolean }) {
  return (
    <PhoneFrame tab="me" title="Acknowledge asset">
      <Card title="Inspection tablet">
        <dl className="yx-ppl__rail-facts">
          <div><dt>Tag</dt><dd className="yx-mono">KF-TAB-0044</dd></div>
          <div><dt>Serial</dt><dd className="yx-mono">SN-TB44-0192</dd></div>
          <div><dt>Issued</dt><dd>{formatDate(new Date(2026, 8, 22))} by Fatima Shaikh</dd></div>
          <div><dt>Condition</dt><dd>New</dd></div>
        </dl>
      </Card>
      {acknowledged ? (
        <InlineAlert tone="success" title="Acknowledged on 29 Sep 2026, 9:42 am">A copy is in your documents.</InlineAlert>
      ) : (
        <>
          <Text as="p">By acknowledging, you confirm you received this asset in the condition shown and will return it when asked or when you leave.</Text>
          <Button variant="primary" fullWidth>
            Acknowledge receipt
          </Button>
          <Button fullWidth>Report a problem</Button>
        </>
      )}
    </PhoneFrame>
  );
}

/* ================================================================== PPL-26 succession */

type Pos = (typeof SUCCESSION)[number];
const READY_TONE = { 'Ready now': 'success', '1–2 years': 'info', '3+ years': 'neutral' } as const;

/* ------------------------------------------------------------------ PPL-26 live */

export interface LiveSuccessionPosition {
  id: string;
  title: string;
  incumbent: { id: string; name: string; band: string | null } | null;
  successors: { id: string; name: string; readiness: Readiness; band: string | null }[];
}
/** The live app's succession plans (PPL-26): Confidential, company-wide holders of succession.manage only. */
export interface LiveSuccession {
  state: 'loading' | 'ready' | 'error' | 'no-access' | 'forbidden';
  onRetry: () => void;
  data: { updatedOn: string | null; positions: LiveSuccessionPosition[] } | null;
  /** Current employees to choose from. */
  people: { id: string; name: string; role?: string }[];
  onAddPosition: (title: string, incumbentEmployeeId: string | null) => Promise<void>;
  onNominate: (position: LiveSuccessionPosition, employeeId: string, readiness: 'now' | '1_2y' | '3y') => Promise<void>;
  onRemove: (position: LiveSuccessionPosition, successor: { id: string; name: string }) => Promise<void>;
}

const READINESS_OPTIONS: { value: 'now' | '1_2y' | '3y'; label: Readiness }[] = [
  { value: 'now', label: 'Ready now' },
  { value: '1_2y', label: '1–2 years' },
  { value: '3y', label: '3+ years' },
];

/** Add a critical position, or nominate a successor for one. */
function SuccessionDialog({ ask, people, onClose, live }: { ask: 'position' | LiveSuccessionPosition; people: LiveSuccession['people']; onClose: () => void; live: LiveSuccession }) {
  const nominate = ask !== 'position';
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [ready, setReady] = useState<'now' | '1_2y' | '3y' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const can = nominate ? Boolean(who && ready) : title.trim().length >= 2;
  const save = async () => {
    setSaving(true);
    try {
      if (nominate) await live.onNominate(ask, who!, ready!);
      else await live.onAddPosition(title.trim(), who);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setSaving(false);
    }
  };
  const choices = nominate ? people.filter((p) => p.id !== ask.incumbent?.id) : people;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={nominate ? `Nominate a successor for ${ask.title}` : 'Add a critical position'}
      size="md"
      preventClose={saving}
      notice={error && <InlineAlert tone="danger">{error}</InlineAlert>}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!can} loading={saving} onClick={() => void save()}>
            {nominate ? 'Nominate successor' : 'Add critical position'}
          </Button>
        </>
      }
    >
      <div className="yx-ppl__form">
        {!nominate && (
          <FormField label="Position" required>
            <TextField value={title} onChange={setTitle} placeholder="Head of Quality" maxLength={120} />
          </FormField>
        )}
        <FormField label={nominate ? 'Successor' : 'Person in the role now'} required={nominate} helper={nominate && ask.incumbent ? `${ask.incumbent.name} is in the role now, so isn't listed.` : undefined}>
          <PersonPicker people={choices} value={who} onChange={setWho} />
        </FormField>
        {nominate && (
          <FormField label="Readiness" required>
            <Segment label="Readiness" options={READINESS_OPTIONS} value={ready} onChange={setReady} />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}

function LiveSuccessionScreen({ live }: { live: LiveSuccession }) {
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [ask, setAsk] = useState<'position' | LiveSuccessionPosition | null>(null);
  const [removing, setRemoving] = useState<{ position: LiveSuccessionPosition; successor: { id: string; name: string } } | null>(null);
  if (live.state === 'forbidden')
    return (
      <PeopleFrame active="Succession">
        <PageHeader title="Succession" />
        <NoAccessState what="succession plans" grantedBy="your HR admin" note="Succession is Confidential: HR and leadership only." />
      </PeopleFrame>
    );
  const positions = live.data?.positions ?? [];
  const shown = positions.filter((p) => !onlyRisk || successionRisk(p.successors) !== 'Covered');
  const atRisk = positions.filter((p) => successionRisk(p.successors) !== 'Covered').length;
  const add = (
    <Button variant="primary" icon={Plus} onClick={() => setAsk('position')}>
      Add critical position
    </Button>
  );
  const review = (band: string | null) => (band ? `latest review ${band}` : 'no released review');
  return (
    <PeopleFrame active="Succession">
      <PageHeader title="Succession" description="Critical positions with nominated successors and readiness." status={<Badge tone="warning">Confidential</Badge>} actions={add} />
      {live.state === 'no-access' ? (
        <NoAccessState what="the succession plans" grantedBy="your HR admin" />
      ) : live.state === 'error' ? (
        <ErrorState title="We couldn't load the succession plans" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : !live.data ? (
        <ListSkeleton label="Loading the succession plans" />
      ) : positions.length === 0 ? (
        <EmptyState title="No critical positions yet" description="Add the positions the company can't leave empty, then nominate who could step in." action={add} />
      ) : (
        <>
          <div className="yx-ppl__row yx-ppl__row--between">
            <Text as="p">
              {atRisk} of {positions.length} critical positions have no ready-now successor.
            </Text>
            <Switch label="Show only at-risk positions" checked={onlyRisk} onChange={setOnlyRisk} />
          </div>
          {shown.length === 0 ? (
            <EmptyState title="Every critical position has a ready-now successor" description="Turn off the filter to see all positions." action={<Button onClick={() => setOnlyRisk(false)}>Show all</Button>} />
          ) : (
            <div className="yx-ppl__grid3">
              {shown.map((p) => (
                <Card key={p.id} title={p.title} actions={<StatusBadge status={successionRisk(p.successors)} />} footer={<Button size="sm" onClick={() => setAsk(p)}>Nominate successor</Button>}>
                  <Text size="sm" tone="secondary" as="p">
                    {p.incumbent ? `Incumbent ${p.incumbent.name} · ${review(p.incumbent.band)}` : 'No one in the role now'}
                  </Text>
                  {p.successors.length ? (
                    <ul className="yx-ppl__successors" aria-label={`Successors for ${p.title}`}>
                      {p.successors.map((s) => (
                        <li key={s.id}>
                          <span>
                            {s.name}
                            <Text size="sm" tone="secondary" as="div">
                              {s.band ? `Review ${s.band}` : 'No released review'}
                            </Text>
                          </span>
                          <span className="yx-ppl__row">
                            <Badge tone={READY_TONE[s.readiness]}>{s.readiness}</Badge>
                            <Button size="sm" onClick={() => setRemoving({ position: p, successor: s })}>
                              Remove
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Text as="p">No successor nominated.</Text>
                  )}
                </Card>
              ))}
            </div>
          )}
          {live.data.updatedOn && (
            <Text size="sm" tone="secondary" as="p">
              Updated {formatDate(new Date(`${live.data.updatedOn}T00:00:00`))}.
            </Text>
          )}
        </>
      )}
      {ask && <SuccessionDialog ask={ask} people={live.people} live={live} onClose={() => setAsk(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.successor.name ?? ''} as a successor for ${removing?.position.title ?? ''}?`}
        consequence="You can nominate them again later."
        confirmLabel="Remove successor"
        onConfirm={async () => {
          if (removing) await live.onRemove(removing.position, removing.successor);
          setRemoving(null);
        }}
      />
    </PeopleFrame>
  );
}

// PPL-26
export function SuccessionScreen(props: { positions: Pos[]; persona?: Persona | 'exec'; riskOnly?: boolean; live?: LiveSuccession }) {
  return props.live ? <LiveSuccessionScreen live={props.live} /> : <SampleSuccessionScreen {...props} />;
}

function SampleSuccessionScreen({ positions, persona = 'hr', riskOnly = false }: { positions: Pos[]; persona?: Persona | 'exec'; riskOnly?: boolean }) {
  const [onlyRisk, setOnlyRisk] = useState(riskOnly);
  if (persona === 'mgr' || persona === 'emp')
    return (
      <PeopleFrame active="Succession" persona={persona}>
        <PageHeader title="Succession" />
        <NoAccessState what="succession plans" grantedBy="the Head of People (Lakshmi Venkatesan)" note="Succession is Confidential: HR and leadership only." />
      </PeopleFrame>
    );
  const shown = positions.filter((p) => !onlyRisk || successionRisk(p.successors) !== 'Covered');
  const atRisk = positions.filter((p) => successionRisk(p.successors) !== 'Covered').length;
  return (
    <PeopleFrame active="Succession">
      <PageHeader title="Succession" description="Critical positions with nominated successors and readiness. Successors come from talent pools; each links to their development plan." status={<Badge tone="warning">Confidential</Badge>} actions={<Button variant="primary" icon={Plus}>Add critical position</Button>} />
      <div className="yx-ppl__row yx-ppl__row--between">
        <Text as="p">{atRisk} of {positions.length} critical positions have no ready-now successor.</Text>
        <Switch label="Show only at-risk positions" checked={onlyRisk} onChange={setOnlyRisk} />
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Every critical position has a ready-now successor" description="Turn off the filter to see all positions." action={<Button onClick={() => setOnlyRisk(false)}>Show all</Button>} />
      ) : (
        <div className="yx-ppl__grid3">
          {shown.map((p) => {
            const risk = successionRisk(p.successors);
            return (
              <Card key={p.id} title={p.position} actions={<StatusBadge status={risk} />} footer={<Button size="sm">Nominate successor</Button>}>
                <Text size="sm" tone="secondary" as="p">
                  Incumbent {p.incumbent} · latest review {p.band}
                </Text>
                {p.successors.length ? (
                  <ul className="yx-ppl__successors" aria-label={`Successors for ${p.position}`}>
                    {p.successors.map((s) => (
                      <li key={s.name}>
                        <span>
                          {s.name}
                          <Text size="sm" tone="secondary" as="div">Review {s.band} · <a href="#idp">Development plan</a></Text>
                        </span>
                        <span className="yx-ppl__row">
                          <Badge tone={READY_TONE[s.readiness]}>{s.readiness}</Badge>
                          <Button size="sm">Remove</Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Text as="p">No successor nominated. Propose one from the Finance talent pool.</Text>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Text size="sm" tone="secondary" as="p">Updated {formatDate(new Date(2026, 8, 20))} after calibration.</Text>
    </PeopleFrame>
  );
}
