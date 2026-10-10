'use client';

import { LettersRegisterScreen, type Letter, type LetterTemplates } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLetterDownload, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { usePeople } from '../../../../../lib/yx-people';
import { verifyUrl } from '../../../../../lib/yx-pay';

// People › Letters (PPL-28 register; P05 §4.3): every letter issued to people in scope, with its reference, status,
// acceptance and public check page.
export default function YxLettersPage() {
  const rows = useLife<Letter[]>('/letters/issued');
  const download = useLetterDownload();
  const write = useLifeWrite();
  // 6e bulk wizard: the active templates, and the people in scope (by their person record).
  const templates = useLife<LetterTemplates>('/letters/templates');
  const people = usePeople<{ id: string; personId?: string; name: string }[]>('/employees');
  const types = [...new Map((templates.data?.templates ?? []).filter((t) => t.status === 'active').map((t) => [t.letterType, { value: t.letterType, label: t.name }])).values()];
  const choices = (people.data ?? []).filter((x) => x.personId).map((x) => ({ value: x.personId!, label: x.name }));
  return <LettersRegisterScreen state={loadState(rows)} onRetry={() => void rows.refetch()} rows={rows.data ?? null} onDownload={(l, which) => download(l.id, which, `${l.referenceNo ?? 'letter'}.pdf`)} verifyUrl={verifyUrl} bulk={types.length && choices.length ? { types, people: choices, onIssue: (letterType, personIds) => write('POST', '/letters/bulk', { letterType, personIds }) } : undefined} />;
}
