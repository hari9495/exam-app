'use client';

import { MyLettersScreen } from '@yukthix/ui/lifecycle';
import type { Letter } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLetterDownload, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › My letters (P05 §4.6): letters issued to me; the ones I accept with a one-time code (G-19 once).
export default function YxMyLettersPage() {
  const data = useLife<{ letters: Letter[]; esignAccepted: boolean }>('/letters/me');
  const download = useLetterDownload();
  const write = useLifeWrite();
  return (
    <MyLettersScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      onDownload={(l, which) => download(l.id, which, `${l.referenceNo ?? 'letter'}.pdf`)}
      onSignCode={(l) => write('POST', `/letters/${encodeURIComponent(l.id)}/sign/code`)}
      onSign={(l, x) => write('POST', `/letters/${encodeURIComponent(l.id)}/sign`, x)}
    />
  );
}
