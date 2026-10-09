'use client';

import { MyAssetsScreen, type MyAsset } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › My assets (PPL-25 acknowledge): what the company issued to me; I confirm I received it.
export default function YxMyAssetsPage() {
  const data = useLife<{ rows: MyAsset[] }>('/lifecycle/me/assets');
  const write = useLifeWrite();
  return <MyAssetsScreen state={loadState(data)} onRetry={() => void data.refetch()} rows={data.data?.rows ?? null} onAcknowledge={(a) => write('POST', `/lifecycle/me/assets/${encodeURIComponent(a.assignmentId)}/acknowledge`)} />;
}
