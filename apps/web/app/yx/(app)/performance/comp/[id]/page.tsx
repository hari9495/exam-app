'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CompSheetScreen, type CompSheet, type PayEquity } from '@yukthix/ui/performance';
import type { MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../../lib/yx-org';
import { usePerf, usePerfWrite } from '../../../../../../lib/yx-performance';

// A comp review sheet (PRF-10, PAY-39, M06 batch PM7): managers propose for their team; HR sets budgets, checks pay
// equity and applies (the API asks for a fresh second factor on apply).
export default function YxCompSheetPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const { id } = useParams<{ id: string }>();
  const base = `/comp-cycles/${encodeURIComponent(id)}`;
  const sheet = usePerf<CompSheet>(`${base}/sheet`);
  const departments = useOrg<MasterRecord[]>('/masters/departments');
  const designations = useOrg<MasterRecord[]>('/masters/designations', perms.has('org.structure.view') || perms.has('org.settings.manage'));
  const [dimension, setDimension] = useState<'gender' | 'grade' | 'location' | null>(null);
  const equity = usePerf<PayEquity>(dimension ? `${base}/pay-equity?dimension=${dimension}` : null);
  const write = usePerfWrite();
  const version = sheet.data?.cycle.version ?? 0;
  const choices = (rows: MasterRecord[] | undefined) => (rows ?? []).filter((r) => !r.archivedAt).map((r) => ({ value: r.id, label: r.name }));
  return (
    <CompSheetScreen
      state={loadState(sheet)}
      onRetry={() => void sheet.refetch()}
      sheet={sheet.data ?? null}
      departments={choices(departments.data)}
      designations={choices(designations.data)}
      onBack={() => router.push('/yx/performance/comp')}
      onBudgets={(budgets) => write('PUT', `${base}/budgets`, { budgets })}
      onOpenCycle={() => write('POST', `${base}/open`, { version })}
      onSave={(proposalId, input) => write('PUT', `/comp-proposals/${encodeURIComponent(proposalId)}`, input)}
      onSubmit={() => write('POST', `${base}/submit`)}
      onApply={() => write('POST', `${base}/apply`, { version })}
      equity={equity.data ?? null}
      onEquity={async (d) => (d === dimension ? equity.refetch() : setDimension(d))}
    />
  );
}
