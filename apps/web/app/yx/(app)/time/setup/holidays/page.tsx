'use client';

import { useRouter } from 'next/navigation';
import { HolidayCalendarsScreen, type TimeSetup } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Holiday calendars (TIM-26): one calendar per location; a state template or a clone to next year waits as a
// draft until HR publishes it.
export default function YxTimeHolidaysPage() {
  const router = useRouter();
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
        onChangeHoliday: (hid, on) => write(`/setup/holidays/${id(hid)}/date`, 'POST', { on }, true, 'Holiday date changed'),
        onTemplate: (locationId, name) => write('/setup/calendars/template', 'POST', { locationId }, true, `${name} draft created from the template`),
        onClone: (cid, name, year) => write(`/setup/calendars/${id(cid)}/clone`, 'POST', undefined, true, `${year} draft created for ${name}`),
        onConfirmDraft: (did, on) => write(`/setup/holiday-drafts/${id(did)}/confirm`, 'POST', { on }, true, 'Date confirmed'),
        onRemoveDraft: (did) => write(`/setup/holiday-drafts/${id(did)}/remove`, 'POST', undefined, true, 'Removed from the draft'),
        onPublish: (cid, name, year) => write(`/setup/calendars/${id(cid)}/publish`, 'POST', { year }, true, `${name} ${year} calendar published`),
        onReviewFeed: () => router.push('/yx/time/setup/holiday-feeds'),
        // Batch A item 9 (D11): a holiday or weekly off marked as a working day.
        onMarkWorking: (cid, input) => write(`/setup/calendars/${id(cid)}/working-days`, 'POST', input, true, 'Marked as a working day'),
        onUnmarkWorking: (wid) => write(`/setup/working-days/${id(wid)}/remove`, 'POST', undefined, true, 'Working day removed'),
      }}
    />
  );
}
