// HIR-17 Placements, live (founder decision 21 Oct 2026): the designed list with real placements. Each placement is a
// person record with a placement role, so the People Directory counts it. Presentational: the API checks the keys and
// the legal entity. Approved hours wait for client timesheets, and the bench for pay between assignments.
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FieldRow, FormField } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { MenuItem } from '../../../components/menu';
import { useToast } from '../../../components/notify';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { PageHeader } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { DatePicker } from '../../../components/date';
import { useListControls } from '../hiring-kit';
import { placementMargin } from '../hiring-logic';

export type PlacementsLoadState = 'loading' | 'ready' | 'error' | 'no-access';

export interface LivePlacement {
  id: string;
  personId: string;
  name: string;
  legalEntity: { id: string; name: string | null };
  client: string;
  role: string;
  startOn: string;
  endOn: string;
  billRate: string;
  payRate: string;
  statutoryPerHour: string;
  supply: 'own' | 'vendor';
  vendor: string | null;
  status: 'active' | 'ending_soon' | 'ended';
  endedOn: string | null;
}
export interface PlacementInput {
  legalEntityId: string;
  givenName: string;
  familyName?: string;
  email?: string;
  phone?: string;
  client: string;
  role: string;
  startOn: string;
  endOn: string;
  billRate: string;
  payRate: string;
  statutoryPerHour?: string;
  supply: 'own' | 'vendor';
  vendor?: string;
}
export interface PlacementsLiveProps {
  state: PlacementsLoadState;
  onRetry?: () => void;
  today: string;
  rows: LivePlacement[];
  entities: { id: string; name: string }[];
  canManage: boolean;
  onCreate: (input: PlacementInput) => Promise<unknown>;
  onEnd: (p: LivePlacement, endedOn: string, reason: string) => Promise<unknown>;
  /** Open New placement at once (?new=1 from the Directory's Add). */
  defaultNewOpen?: boolean;
}

const STATUS: Record<LivePlacement['status'], string> = { active: 'Active', ending_soon: 'Ending soon', ended: 'Ended' };
const TONE: Record<string, 'success' | 'warning' | 'neutral'> = { Active: 'success', 'Ending soon': 'warning', Ended: 'neutral' };
const D = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const isoOf = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
const money = (s: string) => s.replace(/[,\s₹]/g, '');
const isMoney = (s: string) => /^\d{1,10}(\.\d{1,2})?$/.test(money(s));

// HIR-17
export function PlacementsLiveScreen(p: PlacementsLiveProps) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(Boolean(p.defaultNewOpen && p.canManage));
  // Open New placement once the person's keys have loaded (?new=1).
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (p.defaultNewOpen && p.canManage && !asked) {
      setCreating(true);
      setAsked(true);
    }
  }, [p.defaultNewOpen, p.canManage, asked]);
  const [ending, setEnding] = useState<LivePlacement | null>(null);
  const [endOn, setEndOn] = useState<Date | null>(D(p.today));
  const [reason, setReason] = useState('');
  const list = useListControls({
    rows: p.rows,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: ['Active', 'Ending soon', 'Ended'].map((v) => ({ value: v, label: v })) },
      { key: 'supply', label: 'Supply', type: 'multi', options: ['Own payroll', 'Vendor supplied'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.name} ${r.client} ${r.role}`,
    fieldValue: (r, k) => (k === 'status' ? STATUS[r.status] : r.supply === 'own' ? 'Own payroll' : 'Vendor supplied'),
    views: [{ id: 'active', name: 'Active placements' }],
  });
  const cols: TableColumn<LivePlacement>[] = [
    { key: 'person', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }) },
    { key: 'client', header: 'Client', value: (r) => r.client },
    { key: 'supply', header: 'Supply', value: (r) => (r.vendor ? `Vendor: ${r.vendor}` : 'Own payroll') },
    { key: 'start', header: 'Start', type: 'date', value: (r) => D(r.startOn) },
    { key: 'end', header: 'End', type: 'date', value: (r) => D(r.endedOn ?? r.endOn) },
    { key: 'bill', header: 'Bill rate', type: 'money', value: (r) => Number(r.billRate) },
    { key: 'margin', header: 'Margin per hour', type: 'money', value: (r) => placementMargin(Number(r.billRate), Number(r.payRate), Number(r.statutoryPerHour)) },
    { key: 'status', header: 'Status', type: 'status', value: (r) => STATUS[r.status], statusTone: (v) => TONE[String(v)] ?? 'neutral' },
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader
        title="Placements"
        description="Margin = bill − pay − statutory cost for own-payroll placements, bill − vendor rate for vendor-supplied ones."
        actions={p.state === 'ready' && p.canManage ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New placement</Button> : undefined}
      />
      <DataTable
        label="Placements"
        columns={cols}
        rows={p.state === 'ready' ? list.rows : []}
        getRowId={(r) => r.id}
        state={p.state === 'loading' ? 'loading' : p.state === 'error' ? 'error' : 'ready'}
        onRetry={p.onRetry}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        rowActions={
          p.canManage
            ? (r) =>
                r.status !== 'ended' ? (
                  <MenuItem destructive onSelect={() => { setEnding(r); setEndOn(D(p.today)); setReason(''); }}>
                    End placement
                  </MenuItem>
                ) : null
            : undefined
        }
        empty={<EmptyState title="No placements yet." description={p.canManage ? 'Add a placement when a person starts with a client.' : 'Placements appear here once they are added.'} />}
      />
      {p.canManage && <NewPlacementDrawer {...p} open={creating} onOpenChange={setCreating} />}
      <ConfirmDialog
        open={Boolean(ending)}
        onOpenChange={(o) => !o && setEnding(null)}
        title={`End ${ending?.name ?? ''}'s placement with ${ending?.client ?? ''}?`}
        consequence="The placement ends on the date you choose and leaves the Directory. The person record and its history stay."
        confirmLabel="End placement"
        destructive
        confirmDisabled={!endOn || reason.trim().length < 3}
        onConfirm={async () => {
          if (!ending || !endOn) return;
          await p.onEnd(ending, isoOf(endOn), reason.trim());
          toast({ tone: 'success', title: `${ending.name}'s placement with ${ending.client} has ended` });
          setEnding(null);
        }}
      >
        <div className="yx-ops-stack">
          <FormField label="Last day" required>
            <DatePicker value={endOn} onChange={setEndOn} />
          </FormField>
          <FormField label="Reason" required>
            <TextArea value={reason} onChange={setReason} rows={2} />
          </FormField>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function NewPlacementDrawer(p: PlacementsLiveProps & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<Partial<PlacementInput>>({ legalEntityId: p.entities[0]?.id, supply: 'own' });
  const [start, setStart] = useState<Date | null>(D(p.today));
  const [end, setEnd] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof PlacementInput, v: string) => setD({ ...d, [k]: v });
  const ready = Boolean(
    d.legalEntityId && d.givenName?.trim() && d.client?.trim() && d.role?.trim() && start && end && end >= start && d.billRate && isMoney(d.billRate) && d.payRate && isMoney(d.payRate) && (!d.statutoryPerHour || isMoney(d.statutoryPerHour)) && (d.supply === 'own' || d.vendor?.trim()),
  );
  return (
    <Drawer
      open={p.open}
      onOpenChange={p.onOpenChange}
      size="lg"
      title="New placement"
      footer={
        <>
          <Button onClick={() => p.onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!ready}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await p.onCreate({
                  legalEntityId: d.legalEntityId!,
                  givenName: d.givenName!.trim(),
                  ...(d.familyName?.trim() ? { familyName: d.familyName.trim() } : {}),
                  ...(d.email?.trim() ? { email: d.email.trim() } : {}),
                  ...(d.phone?.trim() ? { phone: d.phone.trim() } : {}),
                  client: d.client!.trim(),
                  role: d.role!.trim(),
                  startOn: isoOf(start),
                  endOn: isoOf(end),
                  billRate: money(d.billRate!),
                  payRate: money(d.payRate!),
                  ...(d.statutoryPerHour ? { statutoryPerHour: money(d.statutoryPerHour) } : {}),
                  supply: d.supply!,
                  ...(d.supply === 'vendor' ? { vendor: d.vendor!.trim() } : {}),
                });
                toast({ tone: 'success', title: `${d.givenName!.trim()} placed with ${d.client!.trim()}` });
                p.onOpenChange(false);
                setD({ legalEntityId: d.legalEntityId, supply: 'own' });
                setEnd(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'The placement was not saved. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Add placement
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        <FieldRow>
          <FormField label="Legal entity" required>
            <Select value={d.legalEntityId ?? null} onChange={(v) => setD({ ...d, legalEntityId: v ?? undefined })} options={p.entities.map((e) => ({ value: e.id, label: e.name }))} />
          </FormField>
          <FormField label="Supply">
            <Segment label="Supply" value={d.supply ?? 'own'} onChange={(v) => setD({ ...d, supply: v as 'own' | 'vendor' })} options={[{ value: 'own', label: 'Own payroll' }, { value: 'vendor', label: 'Vendor supplied' }]} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="First name" required>
            <TextField value={d.givenName ?? ''} onChange={(v) => set('givenName', v)} />
          </FormField>
          <FormField label="Last name" optional>
            <TextField value={d.familyName ?? ''} onChange={(v) => set('familyName', v)} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Email" optional>
            <TextField value={d.email ?? ''} onChange={(v) => set('email', v)} inputMode="email" />
          </FormField>
          <FormField label="Mobile" optional>
            <TextField value={d.phone ?? ''} onChange={(v) => set('phone', v)} inputMode="tel" />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Client" required>
            <TextField value={d.client ?? ''} onChange={(v) => set('client', v)} />
          </FormField>
          <FormField label="Role" required>
            <TextField value={d.role ?? ''} onChange={(v) => set('role', v)} />
          </FormField>
        </FieldRow>
        {d.supply === 'vendor' && (
          <FormField label="Vendor" required>
            <TextField value={d.vendor ?? ''} onChange={(v) => set('vendor', v)} />
          </FormField>
        )}
        <FieldRow>
          <FormField label="Start" required>
            <DatePicker value={start} onChange={setStart} />
          </FormField>
          <FormField label="End" required>
            <DatePicker value={end} onChange={setEnd} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Bill rate (an hour)" required>
            <TextField value={d.billRate ?? ''} onChange={(v) => set('billRate', v)} prefix="₹" inputMode="decimal" />
          </FormField>
          <FormField label={d.supply === 'vendor' ? 'Vendor rate (an hour)' : 'Pay rate (an hour)'} required>
            <TextField value={d.payRate ?? ''} onChange={(v) => set('payRate', v)} prefix="₹" inputMode="decimal" />
          </FormField>
        </FieldRow>
        {d.supply === 'own' && (
          <FormField label="Statutory cost (an hour)" optional helper="PF, ESI and the like the company pays on this person.">
            <TextField value={d.statutoryPerHour ?? ''} onChange={(v) => set('statutoryPerHour', v)} prefix="₹" inputMode="decimal" />
          </FormField>
        )}
        {error && <InlineAlert tone="danger" title="That didn’t work">{error}</InlineAlert>}
      </div>
    </Drawer>
  );
}
