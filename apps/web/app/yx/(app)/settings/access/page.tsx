'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { RolesAccessScreen, type AccessRequestRow, type AccessRole, type AccessUser, type EffectiveAccess, type Grant, type RoleTemplate } from '@yukthix/ui/access';
import type { LegalEntity, MasterRecord, OrgLocation } from '@yukthix/ui/org';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { useAccess, useAccessRead, useAccessWrite } from '../../../../../lib/yx-access';
import { loadState, todayIst, useOrg } from '../../../../../lib/yx-org';

const id = encodeURIComponent;

// Settings › Roles & access (PLT-11; P02 §4.2–4.3, §4.6): grants with scope and dates, the approval queue,
// roles from templates, the effective-access preview and who is a System Admin. The API checks every rule (access.role.manage,
// step-up, second admin, risk confirmation).
export default function YxRolesAccessPage() {
  const me = useCurrentUser();
  const users = useAccess<AccessUser[]>('/users');
  const roles = useAccess<AccessRole[]>('/roles');
  const templates = useAccess<RoleTemplate[]>('/role-templates');
  const grants = useAccess<Grant[]>('/grants');
  // Answer 946: requests from "You don't have access" pages (the inbox and the bell link to ?view=requests).
  const requests = useAccess<{ maxDays: number; rows: AccessRequestRow[] }>('/requests');
  const view = useSearchParams()?.get('view');
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const locations = useOrg<OrgLocation[]>('/locations');
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  const read = useAccessRead();
  const write = useAccessWrite();
  const loadEffective = useCallback((userId: string) => read<EffectiveAccess>(`/users/${id(userId)}/effective`), [read]);
  return (
    <RolesAccessScreen
      state={loadState(users, roles, templates, grants)}
      onRetry={() => void Promise.all([users.refetch(), roles.refetch(), templates.refetch(), grants.refetch()])}
      users={users.data ?? []}
      roles={roles.data ?? []}
      templates={templates.data ?? []}
      grants={grants.data ?? []}
      scopes={{
        entities: (entities.data ?? []).map((e) => ({ value: e.id, label: e.name })),
        locations: (locations.data ?? []).map((l) => ({ value: l.id, label: l.name })),
        departments: (departments.data ?? []).map((d) => ({ value: d.id, label: d.name })),
      }}
      meId={me.data?.id ?? ''}
      today={todayIst()}
      loadEffective={loadEffective}
      onGrant={async (input) => void (await write('/grants', input))}
      onApprove={async (grantId) => void (await write(`/grants/${id(grantId)}/approve`, {}))}
      onReject={async (grantId, reason) => void (await write(`/grants/${id(grantId)}/reject`, { reason }))}
      onRevoke={async (grantId, reason) => void (await write(`/grants/${id(grantId)}/revoke`, { reason }))}
      onFromTemplate={async (templateKey, name) => void (await write('/roles/from-template', { templateKey, name }))}
      onDeleteRole={async (roleId, reason) => void (await write(`/roles/${id(roleId)}/delete`, { reason }))}
      requests={requests.data?.rows ?? []}
      maxDays={requests.data?.maxDays ?? 30}
      initialView={view === 'requests' || view === 'waiting' ? view : undefined}
      onApproveRequest={async (requestId, input) => {
        const { userId: _person, ...grant } = input;
        void _person;
        await write(`/requests/${id(requestId)}/approve`, grant);
      }}
      onRefuseRequest={async (requestId, reason) => void (await write(`/requests/${id(requestId)}/refuse`, { reason }))}
      onSystemAdmin={async (userId, makeAdmin, reason) => void (await write(`/users/${id(userId)}/system-admin${makeAdmin ? '' : '/remove'}`, { reason }))}
    />
  );
}
