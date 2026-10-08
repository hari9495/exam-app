'use client';

import { TimeSetupScreen, type TimeSetup, type YearEndPreview } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Leave and attendance set-up (TIM-26 / 27 / 28 / 29): leave.settings.manage for the whole company.
export default function YxTimeSetupPage() {
  const setup = useTime<TimeSetup>('/setup');
  const read = useTimeRead();
  const write = useTimeWrite();
  return (
    <TimeSetupScreen
      state={timeState(setup)}
      onRetry={() => void setup.refetch()}
      data={setup.data ?? null}
      onSaveType={(tid, input) => (tid ? write(`/setup/types/${id(tid)}`, 'PUT', input) : write('/setup/types', 'POST', input))}
      onCreatePolicy={(name) => write('/setup/policies', 'POST', { name })}
      onAddVersion={(pid, input) => write(`/setup/policies/${id(pid)}/versions`, 'POST', input)}
      onAssign={(pid, input) => write(`/setup/policies/${id(pid)}/assign`, 'POST', input)}
      onRemoveAssignment={(aid) => write(`/setup/assignments/${id(aid)}/remove`)}
      onCreateCalendar={(input) => write('/setup/calendars', 'POST', input)}
      onAddHoliday={(cid, input) => write(`/setup/calendars/${id(cid)}/holidays`, 'POST', input)}
      onRemoveHoliday={(hid) => write(`/setup/holidays/${id(hid)}/remove`)}
      onSetRule={(lid, input) => write(`/setup/locations/${id(lid)}/rule`, 'POST', input)}
      onYearEndPreview={(yearEnd) => read<YearEndPreview>(`/setup/year-end?yearEnd=${yearEnd}`)}
      onYearEndRun={(yearEnd) => write('/setup/year-end', 'POST', { yearEnd })}
    />
  );
}
