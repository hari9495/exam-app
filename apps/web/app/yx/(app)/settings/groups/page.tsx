'use client';

import { GroupsScreen } from '@yukthix/ui/access';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { useGroupsPanel } from '../../../../../lib/yx-groups';

// Settings › People & Access › Groups (answer 2905): HR's groups key (people.group.manage) keeps the company's groups
// without the access key: the same groups panel as Roles & access › Groups. The API checks every call.
export default function YxGroupsSettingsPage() {
  const perms = useYxPermissions();
  const allowed = perms.has('people.group.manage') || perms.has('users:manage_groups');
  const { panel, groups } = useGroupsPanel(allowed);
  const state = perms.isLoading ? 'loading' : !allowed ? 'no-access' : groups.isError ? 'error' : panel ? 'ready' : 'loading';
  return <GroupsScreen state={state} onRetry={() => void groups.refetch()} groups={panel} />;
}
