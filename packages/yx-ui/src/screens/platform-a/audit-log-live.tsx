// PLT-16 Audit log, live (Settings S-5, answer 1563): the company's audit log for audit.view, newest first, from the
// same query, scope and masking as Payroll's own audit page (restricted areas stay with their members; pay and identity
// values masked without their keys). Filter by area, person and date; entries can't be edited or deleted.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { DescriptionList, PageHeader } from '../../components/shell';
import { EmptyState, InlineAlert, NoAccessState } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { PersonLabel } from '../../components/display';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate } from '../../lib/format';
import { timeOf } from '../../lib/dates';
import { DiffTable, type DiffRow } from './platform-kit';

export interface LiveAuditEntry {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string;
  actorRole: string | null;
  /** Answer 1723: web, phone or api; none before it was recorded and for jobs. */
  channel?: string | null;
  details: unknown;
}
export interface LiveAuditFilters {
  area?: string;
  actor?: string;
  from?: string;
  to?: string;
}
export interface LiveAuditLog {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  entries: LiveAuditEntry[];
  areas: { value: string; label: string }[];
  filters: LiveAuditFilters;
  onFilters: (f: LiveAuditFilters) => void;
  onMore?: () => void;
  /** Payroll keeps its own audit page (holds): offered when the viewer may open it. */
  onOpenPayroll?: () => void;
  /** Answer 1722: the latest daily integrity check of the company's log (none yet: no badge). */
  chain?: { result: 'ok' | 'broken'; at: string; problem: string | null } | null;
  /** Answer 1722: the recorded export of what the filters show (audit.export). */
  onExport?: () => void;
}

const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined);
const day = (s?: string) => (s ? new Date(`${s}T00:00:00`) : null);
const stamp = (s: string) => `${formatDate(new Date(s))}, ${timeOf(new Date(s))}`;
const CHANNEL: Record<string, string> = { web: 'Web', phone: 'Phone', api: 'API' };
const words = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

/** The before and after an entry recorded (a setting change, or field changes), as the API sent them (masked there). */
export function diffOf(details: unknown): DiffRow[] {
  if (!details || typeof details !== 'object') return [];
  const d = details as Record<string, unknown>;
  if ('from' in d || 'to' in d) return [{ field: typeof d.key === 'string' ? d.key : 'Value', before: words(d.from), after: words(d.to) }];
  if (d.before && d.after && typeof d.before === 'object' && typeof d.after === 'object') {
    const b = d.before as Record<string, unknown>;
    const a = d.after as Record<string, unknown>;
    return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => words(b[k]) !== words(a[k])).map((k) => ({ field: k, before: words(b[k]), after: words(a[k]) }));
  }
  return [];
}

export function LiveAuditLogScreen({ live }: { live: LiveAuditLog }) {
  const [open, setOpen] = useState<string | null>(null);
  const [actor, setActor] = useState(live.filters.actor ?? '');
  const current = live.entries.find((e) => e.id === open);
  const set = (f: Partial<LiveAuditFilters>) => live.onFilters({ ...live.filters, ...f });
  const applyActor = () => {
    if ((actor.trim() || undefined) !== live.filters.actor) set({ actor: actor.trim() || undefined });
  };
  const columns: TableColumn<LiveAuditEntry>[] = [
    { key: 'at', header: 'Time', value: (r) => r.at, render: (r) => stamp(r.at), width: 170 },
    { key: 'actor', header: 'Who', type: 'person', value: (r) => r.actor, person: (r) => ({ name: r.actor, secondary: r.actorRole ?? undefined }) },
    { key: 'action', header: 'Action', value: (r) => r.action, width: 260 },
    { key: 'subject', header: 'Subject', value: (r) => r.entityType },
    // Answer 1723: shown once any entry has it.
    ...(live.entries.some((e) => e.channel) ? [{ key: 'channel', header: 'From', value: (r: LiveAuditEntry) => (r.channel ? (CHANNEL[r.channel] ?? r.channel) : '—'), width: 90 }] : []),
  ];
  const diff = current ? diffOf(current.details) : [];
  if (live.state === 'no-access') return <NoAccessState grantedBy="your System Admin" what="the audit log" />;
  return (
    <div className="yx-plt-stack">
      <PageHeader
        title="Audit log"
        description="Every change, view, export, sign-in and approval at your company, newest first. Entries can't be edited or deleted."
        status={live.chain ? live.chain.result === 'ok' ? <Badge tone="success">Chain verified {stamp(live.chain.at)}</Badge> : <Badge tone="danger">Chain check failed</Badge> : undefined}
        actions={
          <>
            {live.onOpenPayroll && <Button onClick={live.onOpenPayroll}>Payroll audit log</Button>}
            {live.onExport && <Button onClick={live.onExport}>Export CSV</Button>}
          </>
        }
      />
      {live.chain?.result === 'broken' && (
        <InlineAlert tone="danger" title={`The integrity check found a problem on ${stamp(live.chain.at)}`}>
          {live.chain.problem ?? 'Entries do not match the daily check.'} YukthiX security has been alerted; keep an export for your records.
        </InlineAlert>
      )}
      <FieldRow>
        <FormField label="Area">
          <Select value={live.filters.area ?? null} onChange={(v) => set({ area: v ?? undefined })} options={live.areas} placeholder="All areas" clearable />
        </FormField>
        <FormField label="Person" helper="Any part of a name or email.">
          <TextField value={actor} onChange={setActor} onBlur={applyActor} onKeyDown={(e) => e.key === 'Enter' && applyActor()} maxLength={100} />
        </FormField>
        <FormField label="From">
          <DatePicker value={day(live.filters.from)} onChange={(d) => set({ from: iso(d) })} />
        </FormField>
        <FormField label="To">
          <DatePicker value={day(live.filters.to)} onChange={(d) => set({ to: iso(d) })} />
        </FormField>
      </FieldRow>
      {live.filters.from && live.filters.to && live.filters.from > live.filters.to && <InlineAlert tone="warning" title="From is after To, so nothing matches." />}
      <DataTable
        label="Audit entries"
        columns={columns}
        rows={live.entries}
        getRowId={(r) => r.id}
        state={live.state}
        onRetry={live.state === 'error' ? live.onRetry : undefined}
        empty={<EmptyState title="No audit entries for these filters." />}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
      />
      {live.onMore && <Button onClick={live.onMore}>Show older entries</Button>}
      {current && (
        <Drawer open onOpenChange={(o) => !o && setOpen(null)} title={current.action} subtitle={stamp(current.at)} meta={<PersonLabel name={current.actor} secondary={current.actorRole ?? undefined} />} size="lg">
          <div className="yx-plt-stack">
            <DescriptionList items={[{ label: 'Subject', value: current.entityType }, { label: 'Record', value: current.entityId ?? '—', mono: true }, ...(current.channel ? [{ label: 'From', value: CHANNEL[current.channel] ?? current.channel }] : [])]} />
            {diff.length ? <DiffTable caption="Changes" rows={diff} /> : <p className="yx-plt-muted">No field changes for this entry.</p>}
          </div>
        </Drawer>
      )}
    </div>
  );
}
