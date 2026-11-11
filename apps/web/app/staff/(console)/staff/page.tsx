'use client';

import { StaffRolesScreen, type StaffRoleDef, type StaffRow } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleWrite } from '../../../../lib/yx-console';

// Console › Staff and roles (answers 1058, 1086): who holds which staff role. Only a Security lead opens it (the API
// refuses everyone else) and changes another member of staff's roles, with the security key again (asked by the API
// client) and a reason; never their own; the last Security lead keeps the role.
export default function ConsoleStaffPage() {
  const q = useConsole<{ roles: StaffRoleDef[]; staff: StaffRow[] }>('/staff');
  const write = useConsoleWrite();
  return (
    <StaffRolesScreen
      state={loadState(q)}
      onRetry={() => void q.refetch()}
      roles={q.data?.roles ?? []}
      staff={q.data?.staff ?? []}
      onSave={(id, roles, reason) => write(`/staff/${encodeURIComponent(id)}/roles`, 'PUT', { roles, reason }).then(() => undefined)}
      // Answer 1164: add (an invitation; no role until one is given) and deactivate, each with the security key again.
      onInvite={(input) => write('/staff', 'POST', input).then(() => undefined)}
      onDeactivate={(id, reason) => write(`/staff/${encodeURIComponent(id)}/deactivate`, 'POST', { reason }).then(() => undefined)}
    />
  );
}
