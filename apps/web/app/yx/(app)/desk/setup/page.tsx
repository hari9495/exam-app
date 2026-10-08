'use client';

import { useEffect, useState } from 'react';
import { DeskSetupScreen, type Calendar, type CannedResponse, type DeskDetail, type DeskSummary, type SeatCost } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Desk set-up (APX-D §5.8, M14 SD-1.01/1.02): desks, seats (cost shown first), groups, categories, types,
// statuses, priority matrix, saved replies, scenarios, numbering, files and business calendars.
export default function YxDeskSetupPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const perms = useYxPermissions();
  const desks = useDesk<DeskSummary[]>('/desks');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!selected && desks.data?.length) setSelected(desks.data[0].id);
  }, [desks.data, selected]);
  const detail = useDesk<DeskDetail>(selected ? `/desks/${selected}` : null);
  const canned = useDesk<CannedResponse[]>(selected ? `/desks/${selected}/canned-responses` : null);
  const canCalendars = perms.has('desk.sla.manage');
  const calendars = useDesk<Calendar[]>(canCalendars ? '/calendars' : null);
  const write = useDeskWrite();
  const base = `/desks/${selected}`;
  const version = detail.data?.desk.version ?? 0;
  return (
    <DeskSetupScreen
      state={deskState(desks)}
      onRetry={() => void desks.refetch()}
      desks={desks.data ?? []}
      canCreate={perms.has('desk.desk.create')}
      selectedId={selected}
      onSelect={setSelected}
      detail={detail.data ?? null}
      canned={canned.data ?? []}
      calendars={calendars.data ?? []}
      canCalendars={canCalendars}
      onCreateDesk={async (input) => {
        const d = await write<DeskSummary>('/desks', 'POST', input);
        setSelected(d.id);
      }}
      onUpdateDesk={async (change) => {
        await write(base, 'PATCH', { version, ...change });
      }}
      onSearchUsers={(q) => apiFetch(`/desk/users?search=${encodeURIComponent(q)}`, {}, token)}
      onSeatCost={(userId, role) => apiFetch(`/desk${base}/members/cost?userId=${encodeURIComponent(userId)}&role=${role}`, {}, token) as Promise<SeatCost>}
      onAddMember={async (input) => {
        await write(`${base}/members`, 'POST', input);
      }}
      onEndMember={async (memberId) => {
        await write(`${base}/members/${encodeURIComponent(memberId)}`, 'DELETE');
      }}
      onSaveGroup={async (id, input) => {
        await write(id ? `${base}/groups/${id}` : `${base}/groups`, id ? 'PATCH' : 'POST', input);
      }}
      onSaveCategory={async (id, input) => {
        await write(id ? `${base}/categories/${id}` : `${base}/categories`, id ? 'PATCH' : 'POST', input);
      }}
      onSaveType={async (id, input) => {
        await write(id ? `${base}/ticket-types/${id}` : `${base}/ticket-types`, id ? 'PATCH' : 'POST', id ? { name: input.name, active: input.active } : input);
      }}
      onSaveStatus={async (id, input) => {
        await write(id ? `${base}/statuses/${id}` : `${base}/statuses`, id ? 'PATCH' : 'POST', id ? { label: input.label, active: input.active } : input);
      }}
      onSaveMatrix={async (cells) => {
        await write(`${base}/priority-matrix`, 'PUT', { cells });
      }}
      onSaveCanned={async (id, input) => {
        await write(id ? `${base}/canned-responses/${id}` : `${base}/canned-responses`, id ? 'PATCH' : 'POST', input);
      }}
      onSaveScenario={async (id, input) => {
        await write(id ? `${base}/scenarios/${id}` : `${base}/scenarios`, id ? 'PATCH' : 'POST', input);
      }}
      onAddHoliday={async (calendarId, input) => {
        await write(`/calendars/${calendarId}/holidays`, 'POST', input);
      }}
      onSetHours={async (calendarId, input) => {
        await write(`/calendars/${calendarId}/hours`, 'PUT', input);
      }}
    />
  );
}
