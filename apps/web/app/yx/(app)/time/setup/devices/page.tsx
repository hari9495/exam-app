'use client';

import { DevicesScreen, type DevicesData, type KioskKey } from '@yukthix/ui/time';
import { timeState, useTime, useTimeWrite } from '../../../../../../lib/yx-time';

const id = encodeURIComponent;

// HR › Devices and kiosks (TIM-14): leave.settings.manage for the whole company. Kiosks (register, reset key), new
// phone requests (approve / refuse with a reason) and employees' phones (remote sign-out); the API checks each call.
export default function YxTimeDevicesPage() {
  const devices = useTime<DevicesData>('/devices');
  const write = useTimeWrite();
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
      }}
    />
  );
}
