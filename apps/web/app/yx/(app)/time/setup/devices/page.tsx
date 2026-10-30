'use client';

import { DevicesScreen, type DevicesData, type KioskKey, type TrainingPerson, type TrainingRow } from '@yukthix/ui/time';
import { timeState, useTime, useTimeRead, useTimeWrite } from '../../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Devices and kiosks (TIM-14): leave.settings.manage for the whole company. Kiosks (register, reset key), new
// phone requests (approve / refuse with a reason), employees' phones (remote sign-out) and training sessions (add,
// change before they start, cancel); the API checks each call.
export default function YxTimeDevicesPage() {
  const devices = useTime<DevicesData>('/devices');
  const training = useTime<TrainingRow[]>('/devices/training');
  const write = useTimeWrite();
  const read = useTimeRead();
  return (
    <DevicesScreen
      live={{
        state: timeState(devices),
        onRetry: () => void devices.refetch(),
        data: devices.data ?? null,
        onRegister: (input) => write<KioskKey>('/devices/kiosks', 'POST', input),
        onReset: (kid) => write<KioskKey>(`/devices/kiosks/${id(kid)}/reset`, 'POST'),
        onApprove: (rid) => write(`/devices/phones/${id(rid)}/approve`, 'POST'),
        onRefuse: (rid, reason) => write(`/devices/phones/${id(rid)}/refuse`, 'POST', { reason }),
        onSignOut: (pid) => write(`/devices/phones/${id(pid)}/sign-out`, 'POST'),
        training: {
          rows: training.data ?? [],
          state: training.isLoading ? 'loading' : training.isError ? 'error' : 'ready',
          onRetry: () => void training.refetch(),
          onFindPeople: (q) => read<TrainingPerson[]>(`/devices/training/people?q=${id(q)}`),
          onAdd: (input) => write('/devices/training', 'POST', input),
          onEdit: (row, input) => write(`/devices/training/${id(row.id)}`, 'PUT', { ...input, version: row.version }),
          onCancel: (row) => write(`/devices/training/${id(row.id)}/cancel`, 'POST'),
        },
      }}
    />
  );
}
