'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { RolesAccessScreen, type AccessRequestRow, type AccessRole, type AccessUser, type EffectiveAccess, type Grant, type RoleTemplate } from '@yukthix/ui/access';
import type { LegalEntity, MasterRecord, OrgLocation } from '@yukthix/ui/org';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { useAccess, useAccessRead, useAccessWrite } from '../../../../../lib/yx-access';
import { loadState, todayIst, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useFieldPermissions, useUpdateFieldPermissions } from '../../../../../lib/hooks/useFieldPermissions';
import { useCreateUserGroup, useDeleteUserGroup, useSetGroupMembers, useUpdateUserGroup, useUserGroups } from '../../../../../lib/hooks/useUserGroups';
import { useTeammates } from '../../../../../lib/hooks/useUserDirectory';
import { GOVERNABLE_ROLES, GOVERNED_FIELDS } from '../../../../../lib/types';

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
  const grades = useOrg<MasterRecord[]>('/masters/grades');
  const types = useOrg<MasterRecord[]>('/masters/employment-types');
  const read = useAccessRead();
  const write = useAccessWrite();
  const loadEffective = useCallback((userId: string) => read<EffectiveAccess>(`/users/${id(userId)}/effective`), [read]);
  // Answers 2426 and 2430 (retiring /v2): hiring field access (org:manage_settings) and staff groups (users:manage_groups).
  const perms = useYxPermissions();
  const canFields = perms.has('org:manage_settings');
  // T2-G 42: HR's groups key too; groups may be worked out from rules (entity, location, department, grade, type).
  const canGroups = perms.has('users:manage_groups') || perms.has('people.group.manage');
  const fieldConfig = useFieldPermissions(canFields);
  const saveFields = useUpdateFieldPermissions();
  const groups = useUserGroups(canGroups);
  const staff = useTeammates(canGroups);
  const createGroup = useCreateUserGroup();
  const updateGroup = useUpdateUserGroup();
  const setMembers = useSetGroupMembers();
  const deleteGroup = useDeleteUserGroup();
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
      onApproveRequest={async (requestId, input) => {
        const { userId: _person, ...grant } = input;
        void _person;
        await write(`/requests/${id(requestId)}/approve`, grant);
      }}
      onRefuseRequest={async (requestId, reason) => void (await write(`/requests/${id(requestId)}/refuse`, { reason }))}
      hiringFields={
        canFields && fieldConfig.data
          ? { config: fieldConfig.data, fields: { candidate: [...GOVERNED_FIELDS.candidate], job: [...GOVERNED_FIELDS.job] }, roles: [...GOVERNABLE_ROLES], onSave: (config) => saveFields.mutateAsync(config) }
          : undefined
      }
      groups={
        canGroups && groups.data
          ? {
              groups: groups.data,
              people: (staff.data ?? []).map((p) => ({ value: p.id, label: p.name ? `${p.name} · ${p.email}` : p.email })),
              onCreate: (input) => createGroup.mutateAsync(input),
              onUpdate: (groupId, input) => updateGroup.mutateAsync({ groupId, ...input }),
              onMembers: (groupId, userIds) => setMembers.mutateAsync({ groupId, userIds }),
              onDelete: (groupId) => deleteGroup.mutateAsync(groupId),
              ruleChoices: {
                legalEntityIds: (entities.data ?? []).map((e) => ({ value: e.id, label: e.name })),
                locationIds: (locations.data ?? []).map((l) => ({ value: l.id, label: l.name })),
                departmentIds: (departments.data ?? []).map((d) => ({ value: d.id, label: d.name })),
                gradeIds: (grades.data ?? []).map((g) => ({ value: g.id, label: g.name })),
                employmentTypeIds: (types.data ?? []).map((t) => ({ value: t.id, label: t.name })),
              },
            }
          : undefined
      }
      initialView={view === 'requests' || view === 'waiting' || view === 'fields' || view === 'groups' ? view : undefined}
      onSystemAdmin={async (userId, makeAdmin, reason) => void (await write(`/users/${id(userId)}/system-admin${makeAdmin ? '' : '/remove'}`, { reason }))}
    />
  );
}
