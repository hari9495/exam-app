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
      onCreateShift={(input) => write('/shifts', 'POST', input)}
      onShiftTimes={(sid, input) => write(`/shifts/${id(sid)}/versions`, 'POST', input)}
      onShiftDetails={(sid, input) => write(`/shifts/${id(sid)}`, 'PUT', input)}
      onCreatePattern={(input) => write('/patterns', 'POST', input)}
      onAssignPattern={(pid, input) => write(`/patterns/${id(pid)}/assign`, 'POST', input)}
      onRemoveAssignment={(aid) => write(`/pattern-assignments/${id(aid)}/remove`)}
      onCreateOtRule={(input) => write('/ot-rules', 'POST', input)}
      onRemoveOtRule={(rid) => write(`/ot-rules/${id(rid)}/remove`)}
      onSaveProject={(pid, input) => (pid ? write(`/projects/${id(pid)}`, 'PUT', input) : write('/projects', 'POST', input))}
      onAddConsent={(input) => write('/night/consents', 'POST', input)}
      onWithdrawConsent={(cid, on) => write(`/night/consents/${id(cid)}/withdraw`, 'POST', { on })}
      onAttest={(input) => write('/night/safeguards', 'POST', input)}
    />
  );
}
