'use client';

// v2 panel Interviews — format-only re-skin of app/(panel)/interviews onto the v2 kit. Same
// useMyInterviews hook, same time/location/status columns and client search (location OR status);
// old ListView → shared DataTable, StatusBadge → Pill. Matches the v2 Staff Users conventions.
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useMyInterviews } from '../../../../lib/hooks/useInterviews';
import type { Interview, InterviewStatus } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill } from '../../../../components/ui-v2';
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

  const sortHead = (label: string) => ({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (d?: boolean) => void } }) =>
    <SortHead label={label} sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />;

  const columns: ColumnDef<typeof DT_FEATURES, Interview>[] = [
    { id: 'time', accessorFn: (i) => i.slots[0]?.startsAt ?? '', header: sortHead('Time'), cell: ({ row }) => <span style={{ color: 'var(--ink)' }}>{timeLabel(row.original)}</span> },
    { id: 'location', accessorFn: (i) => i.location, header: sortHead('Location'), cell: ({ row }) => <span style={dt.muted}>{row.original.location}</span> },
    { id: 'status', accessorFn: (i) => i.status, header: sortHead('Status'), cell: ({ row }) => <Pill c={STATUS_TONE[row.original.status] ?? 'var(--muted)'} label={row.original.status} /> },
  ];

  return (
    <>
      <h1 className="v2-title" style={{ fontSize: 22, margin: '0 0 16px' }}>Interviews</h1>
      <DataTable
        columns={columns} data={rows} getRowId={(i) => i.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search interviews…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load interviews." emptyMessage={q ? 'No matches.' : 'No interviews assigned yet.'}
        columnLabels={{ time: 'Time', location: 'Location', status: 'Status' }}
      />
    </>
  );
}
