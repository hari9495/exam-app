'use client';

import { useState } from 'react';
import { PrivacyScreen, type PrivacyRequestRow, type PrivacySettings, type PrivacyStatus } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Privacy requests (SD-1.30): copies and erasures people asked for, and what is kept (retention, legal
// hold, recycle bin). Service Desk admins (desk.desk.create). Deciding and saving need a fresh second factor: apiFetch
// asks for it (StepUpProvider) and sends the request again.
export default function YxDeskPrivacyPage() {
  const [status, setStatus] = useState<PrivacyStatus>('open');
  const requests = useDesk<{ legalHold: boolean; requests: PrivacyRequestRow[] }>(`/privacy/requests?status=${status}`, { keepPrevious: true });
  const settings = useDesk<PrivacySettings>('/privacy/settings');
  const write = useDeskWrite();
  return (
    <PrivacyScreen
      state={deskState(requests, settings)}
      onRetry={() => void Promise.all([requests.refetch(), settings.refetch()])}
      status={status}
      onStatus={setStatus}
      requests={requests.data?.requests ?? []}
      legalHold={requests.data?.legalHold ?? settings.data?.legalHold ?? false}
      settings={settings.data ?? null}
      onDecide={(r, action, note) => write(`/privacy/requests/${encodeURIComponent(r.id)}/decide`, 'POST', { action, ...(note ? { note } : {}) })}
      onSaveSettings={async (s) => {
        await write('/privacy/settings', 'PUT', s);
      }}
    />
  );
}
