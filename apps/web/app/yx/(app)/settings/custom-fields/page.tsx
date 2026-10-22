'use client';

import { EmployeeFieldsScreen, type EmployeeFieldDef } from '@yukthix/ui/frame';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';

// Settings › People & Access › Custom fields (PPL-03 Additional details, P18): the company's own employee fields, each
// with the data class that decides who sees and changes its values. The API checks org.settings.manage.
export default function YxCustomFieldsPage() {
  const fields = usePeople<EmployeeFieldDef[]>('/custom-fields');
  const perms = useYxPermissions();
  const write = usePeopleWrite();
  return (
    <EmployeeFieldsScreen
      state={loadState(fields)}
      onRetry={() => void fields.refetch()}
      fields={fields.data ?? []}
      canManage={perms.has('org.settings.manage')}
      onCreate={async (f) => void (await write('POST', '/custom-fields', { entityType: 'employee', label: f.label, fieldType: f.fieldType, dataClass: f.dataClass, ...(f.options ? { options: f.options } : {}) }))}
      onUpdate={async (id, f) => void (await write('PUT', `/custom-fields/${encodeURIComponent(id)}`, { label: f.label, dataClass: f.dataClass, ...(f.options ? { options: f.options } : {}) }))}
      onArchive={async (id) => void (await write('POST', `/custom-fields/${encodeURIComponent(id)}/archive`))}
    />
  );
}
