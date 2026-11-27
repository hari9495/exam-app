'use client';

import type { UserGroupsPanelProps } from '@yukthix/ui/access';
import type { LegalEntity, MasterRecord, OrgLocation } from '@yukthix/ui/org';
import { useOrg } from './yx-org';
import { useCreateUserGroup, useDeleteUserGroup, useSetGroupMembers, useUpdateUserGroup, useUserGroups } from './hooks/useUserGroups';
import { useTeammates } from './hooks/useUserDirectory';

const choices = (rows: { id: string; name: string }[] | undefined) => (rows ?? []).map((r) => ({ value: r.id, label: r.name }));

/**
 * T2-G 42 and answer 2905: the company's groups panel (hand-picked or worked out from rules), the same for Roles & access ›
 * Groups and Settings › People & Access › Groups. Undefined until the groups load (or when the viewer may not keep them).
 */
export function useGroupsPanel(enabled: boolean) {
  const groups = useUserGroups(enabled);
  const staff = useTeammates(enabled);
  const entities = useOrg<LegalEntity[]>('/legal-entities', enabled);
  const locations = useOrg<OrgLocation[]>('/locations', enabled);
  const departments = useOrg<MasterRecord[]>('/masters/departments', enabled);
  const grades = useOrg<MasterRecord[]>('/masters/grades', enabled);
  const types = useOrg<MasterRecord[]>('/masters/employment-types', enabled);
  const tags = useOrg<MasterRecord[]>('/masters/tags', enabled);
  const createGroup = useCreateUserGroup();
  const updateGroup = useUpdateUserGroup();
  const setMembers = useSetGroupMembers();
  const deleteGroup = useDeleteUserGroup();
  const panel: UserGroupsPanelProps | undefined =
    enabled && groups.data
      ? {
          groups: groups.data,
          people: (staff.data ?? []).map((p) => ({ value: p.id, label: p.name ? `${p.name} · ${p.email}` : p.email })),
          onCreate: (input) => createGroup.mutateAsync(input),
          onUpdate: (groupId, input) => updateGroup.mutateAsync({ groupId, ...input }),
          onMembers: (groupId, userIds) => setMembers.mutateAsync({ groupId, userIds }),
          onDelete: (groupId) => deleteGroup.mutateAsync(groupId),
          ruleChoices: {
            legalEntityIds: choices(entities.data),
            locationIds: choices(locations.data),
            departmentIds: choices(departments.data),
            gradeIds: choices(grades.data),
            employmentTypeIds: choices(types.data),
            tagIds: choices(tags.data),
          },
        }
      : undefined;
  return { panel, groups };
}
