'use client';

import { CalendarClock } from 'lucide-react';
import { useMyInterviews } from '../../../lib/hooks/useInterviews';
import { StatusBadge, type Column, type StatusTone } from '../../../components/ui';
import { ListView } from '../../(platform)/components/ListView';
import { Interview, InterviewStatus } from '../../../lib/types';

const STATUS_TONE: Record<InterviewStatus, StatusTone> = {
  proposed: 'info',
  confirmed: 'success',
  declined: 'danger',
  reschedule_requested: 'warning',
  cancelled: 'neutral',
};

// GET /interviews/mine (InterviewsService.listMine) only includes `slots` -- no candidate/job --
// so this renders time/location/status only, not candidate name or job title.
function timeLabel(interview: Interview): string {
  const slot = interview.confirmedSlotId ? interview.slots.find((s) => s.id === interview.confirmedSlotId) : interview.slots[0];
  if (!slot) return 'No time proposed';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: interview.timeZone }).format(
    new Date(slot.startsAt),
  );
}

const columns: Column<Interview>[] = [
  {
    key: 'time',
    header: 'Time',
    render: (interview) => timeLabel(interview),
    sortValue: (interview) => interview.slots[0]?.startsAt ?? '',
  },
  {
    key: 'location',
    header: 'Location',
    render: (interview) => interview.location,
    sortValue: (interview) => interview.location,
  },
  {
    key: 'status',
    header: 'Status',
    render: (interview) => <StatusBadge tone={STATUS_TONE[interview.status]}>{interview.status}</StatusBadge>,
    sortValue: (interview) => interview.status,
  },
];

export default function PanelInterviewsPage() {
  const { data: interviews, isLoading, isError } = useMyInterviews();

  return (
    <ListView<Interview>
      title="Interviews"
      icon={<CalendarClock size={20} />}
      columns={columns}
      rows={interviews ?? []}
      rowKey={(interview) => interview.id}
      searchMatch={(interview, query) => interview.location.toLowerCase().includes(query) || interview.status.toLowerCase().includes(query)}
      storageKey="panel-interviews"
      isLoading={isLoading}
      isError={isError}
      searchPlaceholder="Search interviews…"
      emptyMessage="No interviews assigned yet."
    />
  );
}
