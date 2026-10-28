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
      onSaveType={(tid, input) => (tid ? write(`/setup/types/${id(tid)}`, 'PUT', input, true, 'Leave type saved') : write('/setup/types', 'POST', input, true, 'Leave type added'))}
      onCreatePolicy={(name) => write('/setup/policies', 'POST', { name }, true, 'Policy added')}
      onAddVersion={(pid, input) => write(`/setup/policies/${id(pid)}/versions`, 'POST', input, true, 'Policy change saved')}
      onAssign={(pid, input) => write(`/setup/policies/${id(pid)}/assign`, 'POST', input, true, 'Policy applied')}
      onRemoveAssignment={(aid) => write(`/setup/assignments/${id(aid)}/remove`, 'POST', undefined, true, 'Policy removed from there')}
      onCreateCalendar={(input) => write('/setup/calendars', 'POST', input, true, 'Holiday calendar added')}
      onAddHoliday={(cid, input) => write(`/setup/calendars/${id(cid)}/holidays`, 'POST', input, true, 'Holiday added')}
      onRemoveHoliday={(hid) => write(`/setup/holidays/${id(hid)}/remove`, 'POST', undefined, true, 'Holiday removed')}
      onSetRule={(lid, input) => write(`/setup/locations/${id(lid)}/rule`, 'POST', input, true, 'Shift and weekly offs saved')}
      onYearEndPreview={(yearEnd) => read<YearEndPreview>(`/setup/year-end?yearEnd=${yearEnd}`)}
      onYearEndRun={(yearEnd) => write('/setup/year-end', 'POST', { yearEnd })}
    />
  );
}
