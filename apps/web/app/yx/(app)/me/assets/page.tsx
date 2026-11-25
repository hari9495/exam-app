'use client';

import { useToast } from '@yukthix/ui';
import { MyAssetsScreen, type MyAsset } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › My assets (PPL-25 acknowledge): what the company issued to me; I confirm I received it.
export default function YxMyAssetsPage() {
  const data = useLife<{ rows: MyAsset[] }>('/lifecycle/me/assets');
  const write = useLifeWrite();
  const { toast } = useToast();
  return (
    <MyAssetsScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      rows={data.data?.rows ?? null}
      onAcknowledge={async (a) => {
        await write('POST', `/lifecycle/me/assets/${encodeURIComponent(a.assignmentId)}/acknowledge`);
        toast({ tone: 'success', title: `You confirmed you have the ${a.name}` });
      }}
    />
  );
}
