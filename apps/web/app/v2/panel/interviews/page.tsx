'use client';

// v2 panel Interviews — format-only re-skin of app/(panel)/interviews onto the v2 kit. Same
// useMyInterviews hook, same time/location/status columns and client search (location OR status);
// old ListView → shared DataTable, StatusBadge → Pill. Matches the v2 Staff Users conventions.
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useMyInterviews } from '../../../../lib/hooks/useInterviews';
import type { Interview, InterviewStatus } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };

// Demoted metric for the quiet strip (Workfox rule 4/8): label + tabular number, no rainbow icon
// stat tiles -- one card, thin dividers between cells.
function QuietStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '14px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>{label}</div>
      <div className="v2-mono" style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', marginTop: 6 }}>{value.toLocaleString()}</div>
    </div>
  );
}

const STATUS_TONE: Record<InterviewStatus, string> = {
  proposed: VIZ.azure,
  confirmed: STATUS.ok,
  declined: STATUS.bad,
  reschedule_requested: STATUS.warn,
  cancelled: 'var(--muted)',
};

// GET /interviews/mine (listMine) only includes `slots` -- no candidate/job -- so this renders
// time/location/status only, not candidate name or job title.
function timeLabel(interview: Interview): string {
  const slot = interview.confirmedSlotId ? interview.slots.find((s) => s.id === interview.confirmedSlotId) : interview.slots[0];
  if (!slot) return 'No time proposed';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: interview.timeZone }).format(new Date(slot.startsAt));
}

export default function V2PanelInterviewsPage() {
  const [search, setSearch] = useState('');
  const { data: interviews, isLoading, isError } = useMyInterviews();
  const q = search.trim().toLowerCase();
  const rows = q
    ? (interviews ?? []).filter((i) => i.location.toLowerCase().includes(q) || i.status.toLowerCase().includes(q))
    : (interviews ?? []);

  // Stats strip reflects every assigned interview, not the current search.
  const allInterviews = interviews ?? [];
  const stats = useMemo(() => ({
    total: allInterviews.length,
    confirmed: allInterviews.filter((i) => i.status === 'confirmed').length,
    proposed: allInterviews.filter((i) => i.status === 'proposed').length,
    needsAction: allInterviews.filter((i) => i.status === 'reschedule_requested').length,
  }), [allInterviews]);

  const sortHead = (label: string) => ({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (d?: boolean) => void } }) =>
    <SortHead label={label} sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />;

  const columns: ColumnDef<typeof DT_FEATURES, Interview>[] = [
    { id: 'time', accessorFn: (i) => i.slots[0]?.startsAt ?? '', header: sortHead('Time'), cell: ({ row }) => <span style={{ color: 'var(--ink)' }}>{timeLabel(row.original)}</span> },
    { id: 'location', accessorFn: (i) => i.location, header: sortHead('Location'), cell: ({ row }) => <span style={dt.muted}>{row.original.location}</span> },
    { id: 'status', accessorFn: (i) => i.status, header: sortHead('Status'), cell: ({ row }) => <Pill c={STATUS_TONE[row.original.status] ?? 'var(--muted)'} label={row.original.status} /> },
  ];

  return (
    <div className="v2-rise">
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Panel</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>Interviews</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>The interviews assigned to you, with their proposed times and status.</p>
      </div>

      {/* Quiet metric strip — one card, thin dividers, no rainbow icon stat tiles (Workfox rule 4/8). */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }} className="wf-hero-kpis">
        <QuietStat label="Assigned" value={stats.total} />
        <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Confirmed" value={stats.confirmed} /></div>
        <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Proposed" value={stats.proposed} /></div>
        <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Needs action" value={stats.needsAction} /></div>
      </div>

      <DataTable
        columns={columns} data={rows} getRowId={(i) => i.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search interviews…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load interviews." emptyMessage={q ? 'No matches.' : 'No interviews assigned yet.'}
        columnLabels={{ time: 'Time', location: 'Location', status: 'Status' }}
      />
    </div>
  );
}
