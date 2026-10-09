'use client';

import { LettersRegisterScreen, type Letter } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLetterDownload, useLife } from '../../../../../lib/yx-lifecycle';
import { verifyUrl } from '../../../../../lib/yx-pay';

// People › Letters (PPL-28 register; P05 §4.3): every letter issued to people in scope, with its reference, status,
// acceptance and public check page.
export default function YxLettersPage() {
  const rows = useLife<Letter[]>('/letters/issued');
  const download = useLetterDownload();
  return <LettersRegisterScreen state={loadState(rows)} onRetry={() => void rows.refetch()} rows={rows.data ?? null} onDownload={(l, which) => download(l.id, which, `${l.referenceNo ?? 'letter'}.pdf`)} verifyUrl={verifyUrl} />;
}
