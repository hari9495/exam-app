'use client';

import { ShiftsSetupScreen, type ShiftSetup } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Shifts set-up (M02 §B2, Q7, §B7, OSH Code night work): leave.settings.manage for the whole company.
export default function YxShiftsSetupPage() {
  const setup = useTime<ShiftSetup>('/shifts/setup');
  const write = useTimeWrite();
  return (
    <ShiftsSetupScreen
      state={timeState(setup)}
      onRetry={() => void setup.refetch()}
      data={setup.data ?? null}
      onCreateShift={(input) => write('/shifts', 'POST', input, true, 'Shift added')}
      onShiftTimes={(sid, input) => write(`/shifts/${id(sid)}/versions`, 'POST', input, true, 'Shift times saved')}
      onShiftDetails={(sid, input) => write(`/shifts/${id(sid)}`, 'PUT', input, true, 'Shift saved')}
      onCreatePattern={(input) => write('/patterns', 'POST', input, true, 'Pattern added')}
      onAssignPattern={(pid, input) => write(`/patterns/${id(pid)}/assign`, 'POST', input, true, 'Pattern applied')}
      onRemoveAssignment={(aid) => write(`/pattern-assignments/${id(aid)}/remove`, 'POST', undefined, true, 'Pattern removed from there')}
      onCreateOtRule={(input) => write('/ot-rules', 'POST', input, true, 'Overtime rule added')}
      onRemoveOtRule={(rid) => write(`/ot-rules/${id(rid)}/remove`, 'POST', undefined, true, 'Overtime rule removed')}
      onSaveProject={(pid, input) => (pid ? write(`/projects/${id(pid)}`, 'PUT', input, true, 'Project saved') : write('/projects', 'POST', input, true, 'Project added'))}
      onAddConsent={(input) => write('/night/consents', 'POST', input, true, 'Night-work consent recorded')}
      onWithdrawConsent={(cid, on) => write(`/night/consents/${id(cid)}/withdraw`, 'POST', { on }, true, 'Withdrawal of consent recorded')}
      onAttest={(input) => write('/night/safeguards', 'POST', input, true, 'Safeguard check recorded')}
    />
  );
}
