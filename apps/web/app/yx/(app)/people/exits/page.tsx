'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ExitCasesList } from '@yukthix/ui/frame';
import { StartExitDialog, type ExitRow, type IrOverview } from '@yukthix/ui/lifecycle';
import { todayIst, useYxPermissions, loadState } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';
import { exitRows } from '../../../../../lib/yx-exits';

// People › Exit cases (PPL-19, design audit step 3; design §10): open resignations and company exits in scope with their
// stage and F&F due day; HR starts company exits here. The API decides who sees which case.
export default function YxExitsPage() {
  const sp = useScopeParams();
  const router = useRouter();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const canStart = perms.has('lifecycle.exit.manage');
  const data = useLife<{ today: string; rows: ExitRow[] }>(withParams('/lifecycle/exits', sp.entity));
  const places = useJoinerPlaces(canStart);
  const write = useLifeWrite();
  const ir = useLife<IrOverview>(canStart ? '/lifecycle/ir-permissions' : null);
  const [starting, setStarting] = useState(false);
  const today = data.data?.today ?? todayIst();
  const open = (caseId: string) => router.push(`/yx/people/exits/${encodeURIComponent(caseId)}`);
  return (
    <ExitCasesList
      rows={exitRows(data.data?.rows ?? [])}
      persona={perms.has('employee.profile.view') || perms.has('lifecycle.exit.view') || canStart ? 'hr' : 'mgr'}
      today={new Date(`${today}T00:00:00`)}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        onOpen: open,
        ...(canStart ? { onStart: () => setStarting(true) } : {}),
        children: starting && (
          <StartExitDialog
            people={places.managers}
            permissions={(ir.data?.requests ?? []).filter((r) => r.kind !== 'layoff' && r.status !== 'refused').map((r) => ({ value: r.id, label: `${r.kind} applied ${r.appliedOn} (${r.status})` }))}
            today={today}
            onClose={() => setStarting(false)}
            onStart={async (x) => {
              const k = await write<{ id: string }>('POST', '/lifecycle/exits', x);
              toast({ tone: 'success', title: `Exit started for ${places.managers.find((m) => m.value === x.employeeId)?.label.split(',')[0] ?? 'the employee'}` });
              open(k.id);
              return k;
            }}
          />
        ),
      }}
    />
  );
}
