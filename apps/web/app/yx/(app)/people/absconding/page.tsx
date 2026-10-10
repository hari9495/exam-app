'use client';

import { AbscondingScreen, type AbscondingRow } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useJoinerPlaces, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

const id = encodeURIComponent;

// People › Absconding (PPL-24; LIFE-5.05, YX-LC-17): the company's timeline for unauthorised absence.
export default function YxAbscondingPage() {
  const data = useLife<{ today: string; rows: AbscondingRow[] }>('/lifecycle/absconding');
  const places = useJoinerPlaces(true);
  const write = useLifeWrite();
  return (
    <AbscondingScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      rows={data.data?.rows ?? null}
      today={data.data?.today ?? ''}
      people={places.managers}
      onStart={(x) => write('POST', '/lifecycle/absconding', x)}
      onStop={(r, reason) => write('POST', `/lifecycle/absconding/${id(r.id)}/stop`, { reason, version: r.version })}
      onResume={(r) => write('POST', `/lifecycle/absconding/${id(r.id)}/resume`, { version: r.version })}
      onDispatch={(r, key, ref) => write('PUT', `/lifecycle/absconding/${id(r.id)}/steps/${id(key)}/dispatch`, { ref, version: r.version })}
    />
  );
}
