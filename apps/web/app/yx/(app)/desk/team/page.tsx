'use client';

import { useEffect, useState } from 'react';
import { TeamScreen, type AgentMailbox, type AvailabilityRow, type DeskSummary, type ForecastView, type ShiftView, type TeamMember } from '@yukthix/ui/desk';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Team and shifts (M14 SD-2.25, SD-2.26, SD-2.24): my presence, the team now (presence, open work,
// capacity and languages, set by leads), the roster with CSV import, the staff forecast and the availability report
// (report view), and my own mailbox sync. The API checks the seat on the desk for every call.
const istDay = (offset = 0) => new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);

export default function YxDeskTeamPage() {
  const perms = useYxPermissions();
  const desks = useDesk<DeskSummary[]>('/desks');
  const [deskId, setDeskId] = useState<string | null>(null);
  useEffect(() => {
    if (!deskId && desks.data?.length) setDeskId(desks.data[0].id);
  }, [desks.data, deskId]);
  const canLead = perms.has('desk.ticket.assign');
  const canReport = perms.has('desk.report.view');
  const isAgent = perms.has('desk.ticket.work');
  const range = { from: istDay(0), to: istDay(6) };
  const status = useDesk<{ status: 'available' | 'away' | 'busy' | 'offline' }>(isAgent ? '/me/status' : null);
  const team = useDesk<TeamMember[]>(deskId && (canLead || canReport) ? `/desks/${deskId}/team` : null);
  const shifts = useDesk<ShiftView[]>(deskId ? `/desks/${deskId}/shifts?from=${range.from}&to=${range.to}` : null);
  const forecast = useDesk<ForecastView>(deskId && canReport ? `/desks/${deskId}/forecast?days=7` : null);
  const availability = useDesk<AvailabilityRow[]>(deskId && canReport ? `/desks/${deskId}/availability?from=${range.from}&to=${range.from}` : null);
  const mailbox = useDesk<{ mailbox: AgentMailbox | null; devAllowed: boolean }>(isAgent ? '/me/mailbox' : null);
  const write = useDeskWrite();
  return (
    <TeamScreen
      state={deskState(desks)}
      onRetry={() => void desks.refetch()}
      desks={(desks.data ?? []).map((d) => ({ id: d.id, name: d.name }))}
      deskId={deskId}
      onDesk={setDeskId}
      canLead={canLead}
      canReport={canReport}
      me={isAgent && status.data ? { presence: status.data.status } : null}
      onPresence={(p) => write('/me/presence', 'PUT', { status: p })}
      team={team.data}
      onRouting={(userId, input) => write(`/desks/${deskId}/agents/${encodeURIComponent(userId)}/routing`, 'PUT', input)}
      shifts={shifts.data ?? []}
      range={range}
      onAddShift={(input) => write(`/desks/${deskId}/shifts`, 'POST', input)}
      onRemoveShift={(s) => write(`/shifts/${encodeURIComponent(s.id)}`, 'DELETE')}
      onImportShifts={(csv) => write<{ added: number }>(`/desks/${deskId}/shifts/import`, 'POST', { csv, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
      forecast={forecast.data}
      availability={availability.data}
      mailbox={
        isAgent && mailbox.data
          ? {
              current: mailbox.data.mailbox,
              devAllowed: mailbox.data.devAllowed,
              onLink: (kind, config) => write('/me/mailbox', 'POST', { kind, ...(config ? { config } : {}) }),
              onUnlink: () => write('/me/mailbox', 'DELETE'),
            }
          : null
      }
    />
  );
}
