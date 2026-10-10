'use client';

import { BatchesScreen, type Batch, type JoinerBoard } from '@yukthix/ui/lifecycle';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Campus batches (PPL-14; LIFE-5.02): joiners who start together; a new batch day moves everyone.
export default function YxBatchesPage() {
  const perms = useYxPermissions();
  const canManage = perms.has('lifecycle.onboarding.manage');
  const data = useLife<{ today: string; rows: Batch[] }>('/lifecycle/batches');
  const board = useLife<JoinerBoard>(canManage ? '/lifecycle/joiners' : null);
  const places = useJoinerPlaces(canManage);
  const write = useLifeWrite();
  const waiting = (board.data?.joiners ?? []).filter((j) => j.status === 'invited' && !j.batchId) as (JoinerBoard['joiners'][number] & { legalEntityId?: string })[];
  return (
    <BatchesScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      rows={data.data?.rows ?? null}
      today={data.data?.today ?? ''}
      entities={places.entities}
      joiners={waiting.map((j) => ({ value: j.id, label: `${j.name} (joins ${j.joiningOn})`, entityId: j.legalEntityId ?? '' }))}
      canManage={canManage}
      onSave={(batchId, x) => (batchId ? write('PUT', `/lifecycle/batches/${id(batchId)}`, x) : write('POST', '/lifecycle/batches', x))}
      onAdd={(b, preboardingIds) => write('POST', `/lifecycle/batches/${id(b.id)}/members`, { preboardingIds })}
      onLoi={(b) => write<{ issued: number; failed: { message: string }[] }>('POST', `/lifecycle/batches/${id(b.id)}/loi`)}
    />
  );
}
