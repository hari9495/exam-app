'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BenchBoardScreen, BenchSheet, type BenchRowView } from '@yukthix/ui/hiring';
import { deskState, useStaffing, useStaffingWrite } from '../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../lib/auth-context';

type Bench = { canManage: boolean; policy: { maxDays: number; payPct: number; after: 'review' | 'unpaid' }; rows: BenchRowView[] };
type Choice = { value: string; label: string };

// Staffing desk › Bench (HIR-17 bench board): employees between placements against the company's bench policy
// (Settings › Staffing desk). Account managers add someone or take them off; submitting goes to the submissions sheet.
export default function YxStaffingBenchPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const bench = useStaffing<Bench>('/bench');
  const canManage = Boolean(bench.data?.canManage) && !(impersonating || actingSuperAdmin);
  const people = useStaffing<Choice[]>('/bench/candidates', canManage);
  const write = useStaffingWrite();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <BenchBoardScreen
        live={{
          state: deskState(bench),
          onRetry: () => void bench.refetch(),
          rows: bench.data?.rows ?? [],
          policy: bench.data?.policy ?? { maxDays: 30, payPct: 50, after: 'review' },
          canManage,
          onAdd: () => setAdding(true),
          onRemove: (id) => write('DELETE', `/bench/${encodeURIComponent(id)}`),
          onSubmit: () => router.push('/yx/staffing/submissions?submit=1'),
          onPlacements: () => router.push('/yx/staffing/placements'),
        }}
      />
      {adding && people.data && <BenchSheet open onOpenChange={(o) => !o && setAdding(false)} people={people.data} today={new Date()} onSave={(input) => write('POST', '/bench', { ...input, ...(input.note ? {} : { note: undefined }) })} />}
    </>
  );
}
