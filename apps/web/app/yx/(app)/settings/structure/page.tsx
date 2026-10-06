'use client';

import { KINDS, StructureScreen, type LegalEntity, type MasterKind, type MasterLists, type MasterRecord, type PayRange } from '@yukthix/ui/org';
import { companyRules, loadState, todayIst, useOrg, useOrgRead, useOrgWrite, useYxPermissions } from '../../../../../lib/yx-org';

const id = encodeURIComponent;

// Settings › Organisation › Structure (P01 §4.3): departments, designations, grades, employment types and
// cost centres. Grade pay ranges are pay data (founder rule R1): asked for only with pay.range.view, each
// opening recorded by the API; changes are step-up actions.
export default function YxStructurePage() {
  const lists = {
    departments: useOrg<MasterRecord[]>('/masters/departments?includeArchived=true'),
    designations: useOrg<MasterRecord[]>('/masters/designations?includeArchived=true'),
    grades: useOrg<MasterRecord[]>('/masters/grades?includeArchived=true'),
    'employment-types': useOrg<MasterRecord[]>('/masters/employment-types?includeArchived=true'),
    'cost-centres': useOrg<MasterRecord[]>('/masters/cost-centres?includeArchived=true'),
  } satisfies Record<MasterKind, unknown>;
  const entities = useOrg<LegalEntity[]>('/legal-entities?includeArchived=true');
  const settings = useOrg<Parameters<typeof companyRules>[0]>('/settings');
  const perms = useYxPermissions();
  const write = useOrgWrite();
  const read = useOrgRead();
  const queries = [...Object.values(lists), entities];
  const masters = Object.fromEntries(KINDS.map(({ kind }) => [kind, lists[kind].data ?? []])) as MasterLists;
  return (
    <StructureScreen
      state={loadState(...queries)}
      onRetry={() => void Promise.all(queries.map((q) => q.refetch()))}
      masters={masters}
      entities={entities.data ?? []}
      canManage={perms.has('org.settings.manage')}
      defaultOwnership={companyRules(settings.data)?.defaultOwnership.value ?? 'shared'}
      pay={{
        canView: perms.has('pay.range.view'),
        canManage: perms.has('pay.range.manage'),
        today: todayIst(),
        onLoad: (gradeId) => read<PayRange[]>(`/grades/${id(gradeId)}/pay-ranges`),
        onCreate: async (gradeId, input) => void (await write('POST', `/grades/${id(gradeId)}/pay-ranges`, input)),
        onUpdate: async (rangeId, amounts) => void (await write('PUT', `/pay-ranges/${id(rangeId)}`, amounts)),
        onDelete: async (rangeId) => void (await write('DELETE', `/pay-ranges/${id(rangeId)}`)),
      }}
      onSave={async (kind, recordId, input) => {
        await write(recordId ? 'PUT' : 'POST', recordId ? `/masters/${kind}/${id(recordId)}` : `/masters/${kind}`, input);
      }}
      onArchive={async (kind, recordId) => void (await write('POST', `/masters/${kind}/${id(recordId)}/archive`))}
      onRestore={async (kind, recordId) => void (await write('POST', `/masters/${kind}/${id(recordId)}/restore`))}
      onDelete={async (kind, recordId) => void (await write('DELETE', `/masters/${kind}/${id(recordId)}`))}
    />
  );
}
