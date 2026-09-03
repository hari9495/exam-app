'use client';

// v2 panel Interviews — format-only re-skin of app/(panel)/interviews onto the v2 kit. Same
// useMyInterviews hook, same time/location/status columns and client search (location OR status);
// old ListView → shared DataTable, StatusBadge → Pill. Matches the v2 Staff Users conventions.
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, CircleCheck, Clock, AlertCircle } from 'lucide-react';
import { useMyInterviews } from '../../../../lib/hooks/useInterviews';
import type { Interview, InterviewStatus } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, IconStatCard } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';

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
    <>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Panel</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>Interviews</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>The interviews assigned to you, with their proposed times and status.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }} className="wf-hero-kpis">
        <IconStatCard title="Assigned" value={stats.total} icon={<CalendarDays size={22} />} accent={VIZ.azure} />
        <IconStatCard title="Confirmed" value={stats.confirmed} icon={<CircleCheck size={22} />} accent={VIZ.teal} />
        <IconStatCard title="Proposed" value={stats.proposed} icon={<Clock size={22} />} accent={VIZ.violet} />
        <IconStatCard title="Needs action" value={stats.needsAction} icon={<AlertCircle size={22} />} accent={VIZ.amber} />
      </div>

      <DataTable
        columns={columns} data={rows} getRowId={(i) => i.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search interviews…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load interviews." emptyMessage={q ? 'No matches.' : 'No interviews assigned yet.'}
        columnLabels={{ time: 'Time', location: 'Location', status: 'Status' }}
      />
    </>
  );
}
