'use client';

import { HolidayCalendarsScreen, type TimeSetup } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Holiday calendars (TIM-26): one calendar per location.
export default function YxTimeHolidaysPage() {
  const setup = useTime<TimeSetup>('/setup');
  const write = useTimeWrite();
  return (
    <HolidayCalendarsScreen
      live={{
        state: timeState(setup),
        onRetry: () => void setup.refetch(),
        data: setup.data ?? null,
        onCreateCalendar: (input) => write('/setup/calendars', 'POST', input, true, 'Holiday calendar added'),
        onUpdateCalendar: (cid, input) => write(`/setup/calendars/${id(cid)}`, 'PUT', input, true, 'Calendar rules saved'),
        onAddHoliday: (cid, input) => write(`/setup/calendars/${id(cid)}/holidays`, 'POST', input, true, 'Holiday added'),
        onRemoveHoliday: (hid) => write(`/setup/holidays/${id(hid)}/remove`, 'POST', undefined, true, 'Holiday removed'),
      }}
    />
  );
}
