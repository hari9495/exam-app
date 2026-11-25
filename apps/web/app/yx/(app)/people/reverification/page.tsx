'use client';

import { useRouter } from 'next/navigation';
import { NoAccessState, useToast } from '@yukthix/ui';
import { ReverificationCycles, type ReverifData, type ReverifRow, type ReverifRule } from '@yukthix/ui/frame';
import { todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

type Rules = {
  rules: ReverifRule[];
  types: { key: string; name: string }[];
  entities: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  canManageCompany: boolean;
};

// People › More › Re-verification (PPL-42): HR's dated rules per legal entity, who is due and overdue, asking for a
// fresh copy (the documents engine) and the verification queue. document.manage plus each type's class (the API checks).
export default function YxReverificationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const allowed = useYxPermissions().has('document.manage');
  const rules = useLife<Rules>(allowed ? '/documents/reverification/rules' : null);
  const due = useLife<{ rows: ReverifRow[] }>(allowed ? '/documents/reverification/due' : null);
  const write = useLifeWrite();
  const r = rules.data;
  const data: ReverifData | null =
    r && due.data
      ? {
          rules: r.rules,
          rows: due.data.rows,
          types: r.types.map((t) => ({ value: t.key, label: t.name })),
          entities: r.entities.map((e) => ({ value: e.id, label: e.name })),
          departments: r.departments.map((d) => ({ value: d.id, label: d.name })),
          designations: r.designations.map((d) => ({ value: d.id, label: d.name })),
          canManageCompany: r.canManageCompany,
        }
      : null;
  if (!allowed) return <NoAccessState what="re-verification" grantedBy="your HR team" />;
  return (
    <ReverificationCycles
      today={todayIst()}
      data={data}
      state={rules.isError || due.isError ? 'error' : data ? 'ready' : 'loading'}
      onRetry={() => {
        void rules.refetch();
        void due.refetch();
      }}
      onAddRule={async (input) => {
        await write('POST', '/documents/reverification/rules', input);
        toast({ tone: 'success', title: `Rule added: ${r?.types.find((t) => t.key === input.typeKey)?.name ?? 'document'} every ${input.everyMonths} months` });
      }}
      onEndRule={async (rule) => {
        await write('POST', `/documents/reverification/rules/${encodeURIComponent(rule.id)}/end`, {});
        toast({ tone: 'success', title: `${rule.typeName} rule ends today` });
      }}
      onAsk={async (row) => {
        await write('POST', '/documents/reverification/ask', { ruleId: row.ruleId, employeeId: row.employeeId });
        toast({ tone: 'success', title: `${row.name} was asked for a fresh ${row.typeName}` });
      }}
      onOpenQueue={() => router.push('/yx/people/documents')}
    />
  );
}
