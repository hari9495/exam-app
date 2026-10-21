'use client';

import { useState } from 'react';
import { useToast } from '@yukthix/ui';
import { UpcomingExits } from '@yukthix/ui/frame';
import { ContractDialog, type UpcomingExit } from '@yukthix/ui/lifecycle';
import { todayIst, useYxPermissions } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// People › Retirements and contract ends (PPL-49, designed 20 Oct 2026; LIFE-5.06, YX-LC-19 / 20).
export default function YxUpcomingExitsPage() {
  const { toast } = useToast();
  const perms = useYxPermissions();
  const canChange = perms.has('employee.change.manage');
  const data = useLife<{ today: string; rows: UpcomingExit[] }>('/lifecycle/upcoming-exits');
  const places = useJoinerPlaces(canChange);
  const write = useLifeWrite();
  const [ask, setAsk] = useState<{ employeeId: string | null; action: 'set' | 'extend' | 'convert' } | null>(null);
  const today = data.data?.today ?? todayIst();
  const nameOf = (employeeId: string) => data.data?.rows.find((r) => r.employeeId === employeeId)?.name ?? places.managers.find((m) => m.value === employeeId)?.label.split(',')[0] ?? 'the employee';
  return (
    <>
      <UpcomingExits
        rows={data.data?.rows ?? []}
        today={new Date(`${today}T00:00:00`)}
        state={data.isError ? 'error' : data.data ? 'ready' : 'loading'}
        onRetry={() => void data.refetch()}
        {...(canChange
          ? {
              onSet: () => setAsk({ employeeId: null, action: 'set' }),
              onExtend: (employeeId: string) => setAsk({ employeeId, action: 'extend' }),
              onConvert: (employeeId: string) => setAsk({ employeeId, action: 'convert' }),
            }
          : {})}
      />
      {ask && (
        <ContractDialog
          ask={ask}
          people={places.managers}
          types={places.employmentTypes}
          today={today}
          onClose={() => setAsk(null)}
          onSave={async (employeeId, x) => {
            await write('PUT', `/lifecycle/contracts/${encodeURIComponent(employeeId)}`, x);
            const name = nameOf(employeeId);
            toast({ tone: 'success', title: x.action === 'convert' ? `${name}'s move to permanent sent for approval` : x.action === 'extend' ? `${name}'s contract extended` : `Contract end set for ${name}` });
          }}
        />
      )}
    </>
  );
}
