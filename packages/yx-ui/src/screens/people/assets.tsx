// PPL-25 Asset register + issue / return dialog + employee acknowledgement · PPL-26 Succession (M01 §3.6, §3.9 Q8).
import { useMemo, useState } from 'react';
import { Download, Plus, Upload } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Card, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Dialog } from '../../components/overlay';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField } from '../../components/field';
import { PersonPicker, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { CurrencyField, TextArea } from '../../components/inputs';
import { Switch } from '../../components/choice';
import { MenuItem } from '../../components/menu';
import { Text } from '../../components/foundations';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { successionRisk, type Persona } from './people-logic';
import { ASSETS, SUCCESSION } from './people-data';
import { PeopleFrame, StatusBadge } from './people-kit';

/* ================================================================== PPL-25 asset register */

type Asset = (typeof ASSETS)[number];
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

// PPL-25
export function AssetRegister({ rows, dialog = null, persona = 'hr' }: { rows: Asset[]; dialog?: AssetDialog; persona?: Persona }) {
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

// PPL-26
export function SuccessionScreen({ positions, persona = 'hr', riskOnly = false }: { positions: Pos[]; persona?: Persona | 'exec'; riskOnly?: boolean }) {
  const [onlyRisk, setOnlyRisk] = useState(riskOnly);
  if (persona === 'mgr' || persona === 'emp')
    return (
      <PeopleFrame active="Succession" persona={persona}>
        <PageHeader title="Succession" />
        <NoAccessState what="succession plans" grantedBy="The Head of People (Lakshmi Venkatesan). Succession is Confidential: HR and leadership only." />
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
                        <Badge tone={READY_TONE[s.readiness]}>{s.readiness}</Badge>
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
