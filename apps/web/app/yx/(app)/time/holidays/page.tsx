'use client';

import { HolidayCalendarsScreen, type TimeSetup } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Holiday calendars (TIM-26): leave.settings.manage for the whole company.
export default function YxTimeHolidaysPage() {
  const setup = useTime<TimeSetup>('/setup');
  const write = useTimeWrite();
  return (
    <HolidayCalendarsScreen
      live={{
        state: timeState(setup),
        onRetry: () => void setup.refetch(),
        data: setup.data ?? null,
        onCreateCalendar: (input) => write('/setup/calendars', 'POST', input),
        onUpdateCalendar: (cid, input) => write(`/setup/calendars/${id(cid)}`, 'PUT', input),
        onAddHoliday: (cid, input) => write(`/setup/calendars/${id(cid)}/holidays`, 'POST', input),
        onRemoveHoliday: (hid) => write(`/setup/holidays/${id(hid)}/remove`),
      }}
    />
  );
}
