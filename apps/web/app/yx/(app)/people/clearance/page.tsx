'use client';

import { ClearanceScreen, type MyClearanceItem } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// People › Clearance (PPL-20; design §10.6): sign-offs for leavers that I or my team own.
export default function YxClearancePage() {
  const data = useLife<{ today: string; rows: MyClearanceItem[] }>('/lifecycle/clearance/mine');
  const write = useLifeWrite();
  return (
    <ClearanceScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      rows={data.data?.rows ?? null}
      onSignOff={(item, x) => write('POST', `/lifecycle/clearance/${encodeURIComponent(item.id)}/sign-off`, { action: x.action, version: item.version, ...(x.note ? { note: x.note } : {}), ...(x.recoveryAmount ? { recoveryAmount: x.recoveryAmount, recoveryReason: x.recoveryReason } : {}) })}
    />
  );
}
