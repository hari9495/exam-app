'use client';

import { useState } from 'react';
import { EmployeeFieldsScreen, type EmployeeFieldDef, type FieldEntity } from '@yukthix/ui/frame';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useApi, useApiWrite } from '../../../../../lib/yx-hiring';
import { useAuth } from '../../../../../lib/auth-context';

// Settings › People & Access › Custom fields (PPL-03 Additional details, P18): the company's own employee fields, each
// with the data class that decides who sees and changes its values. The API checks org.settings.manage.
// Answer 2425 (retiring /v2): the same page switches to candidate and job fields (required, and for candidates whether
// the application form asks them), read and changed with the company settings key (org:manage_settings); never changed
// while acting for someone else (the API refuses too).
type HiringField = { id: string; label: string; fieldType: EmployeeFieldDef['fieldType']; options: string[] | null; required: boolean; showOnApply: boolean; dataClass: EmployeeFieldDef['dataClass'] };

export default function YxCustomFieldsPage() {
  const perms = useYxPermissions();
  const { impersonating, actingSuperAdmin } = useAuth();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const hiringKey = perms.has('org:manage_settings');
  const employeeKey = perms.has('org.settings.manage');
  const [entity, setEntity] = useState<FieldEntity>(employeeKey || !hiringKey ? 'employee' : 'candidate');
  const employee = usePeople<EmployeeFieldDef[]>(entity === 'employee' ? '/custom-fields' : null);
  const hiring = useApi<HiringField[]>(entity !== 'employee' && hiringKey ? `/custom-fields?entityType=${entity}` : null);
  const writePeople = usePeopleWrite();
  const write = useApiWrite();
  const fields = entity === 'employee' ? employee : hiring;
  const enc = encodeURIComponent;
  return (
    <EmployeeFieldsScreen
      entity={entity}
      onEntity={hiringKey ? setEntity : undefined}
      state={loadState(fields)}
      onRetry={() => void fields.refetch()}
      fields={(fields.data as EmployeeFieldDef[] | undefined) ?? []}
      canManage={(entity === 'employee' ? employeeKey : hiringKey) && !acting}
      onCreate={async (f) => {
        if (entity === 'employee') await writePeople('POST', '/custom-fields', { entityType: 'employee', label: f.label, fieldType: f.fieldType, dataClass: f.dataClass, ...(f.options ? { options: f.options } : {}) });
        else await write('POST', '/custom-fields', { entityType: entity, label: f.label, fieldType: f.fieldType, required: Boolean(f.required), ...(entity === 'candidate' ? { showOnApply: Boolean(f.showOnApply) } : {}), ...(f.options ? { options: f.options } : {}) });
      }}
      onUpdate={async (id, f) => {
        if (entity === 'employee') await writePeople('PUT', `/custom-fields/${enc(id)}`, { label: f.label, dataClass: f.dataClass, ...(f.options ? { options: f.options } : {}) });
        else await write('PATCH', `/custom-fields/${enc(id)}`, { label: f.label, required: Boolean(f.required), ...(entity === 'candidate' ? { showOnApply: Boolean(f.showOnApply) } : {}), ...(f.options ? { options: f.options } : {}) });
      }}
      onArchive={async (id) => {
        if (entity === 'employee') await writePeople('POST', `/custom-fields/${enc(id)}/archive`);
        else await write('DELETE', `/custom-fields/${enc(id)}`);
      }}
    />
  );
}
