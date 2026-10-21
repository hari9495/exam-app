'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { IssuedLettersRegister } from '@yukthix/ui/frame';
import { BulkLetterDialog, type Letter, type LetterTemplates } from '@yukthix/ui/lifecycle';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { useLetterDownload, useLife, useLifeWrite, usePdfPost } from '../../../../../lib/yx-lifecycle';
import { usePeople } from '../../../../../lib/yx-people';
import { verifyUrl } from '../../../../../lib/yx-pay';

// People › Documents & letters › Letters (PPL-28, design audit step 3; P05 §4.3): every letter issued to people in
// scope, with its reference, signature and status; issue one letter or many from the active templates.
function Letters() {
  const { toast } = useToast();
  const perms = useYxPermissions();
  const rows = useLife<Letter[]>('/letters/issued');
  const download = useLetterDownload();
  const pdf = usePdfPost();
  const write = useLifeWrite();
  const templates = useLife<LetterTemplates>('/letters/templates');
  const people = usePeople<{ id: string; personId?: string; name: string; employeeCode?: string | null }[]>('/employees');
  const types = [...new Map((templates.data?.templates ?? []).filter((t) => t.status === 'active').map((t) => [t.letterType, { value: t.letterType, label: t.name }])).values()];
  const choices = (people.data ?? []).filter((x) => x.personId).map((x) => ({ value: x.personId!, label: x.employeeCode ? `${x.name} · ${x.employeeCode}` : x.name }));
  // Issue letter from the directory: ?people= the employee records chosen there, opened in the bulk issue.
  const asked = new Set((useSearchParams()?.get('people') ?? '').split(',').filter(Boolean));
  const picked = (people.data ?? []).filter((x) => asked.has(x.id) && x.personId).map((x) => x.personId!);
  const [bulk, setBulk] = useState<boolean | null>(null);
  const bulkOpen = bulk ?? picked.length > 0;
  const nameOf = (personId: string) => choices.find((c) => c.value === personId)?.label.split(' · ')[0] ?? 'the person';
  const typeOf = (letterType: string) => types.find((t) => t.value === letterType)?.label ?? 'Letter';
  const canIssue = perms.has('letter.issue') && types.length > 0 && choices.length > 0;
  return (
    <IssuedLettersRegister
      rows={[]}
      live={{
        state: rows.isError ? 'error' : rows.data ? 'ready' : 'loading',
        onRetry: () => void rows.refetch(),
        rows: rows.data ?? [],
        verifyUrl,
        onDownload: (l) => void download(l.id, 'letter', `${l.referenceNo ?? 'letter'}.pdf`),
        ...(canIssue
          ? {
              issue: {
                types,
                people: choices,
                onPreview: (letterType: string, personId: string) => pdf('/letters/preview', { letterType, personId }, 'preview.pdf'),
                onIssue: async (letterType: string, personId: string) => {
                  await write('POST', '/letters/issue', { letterType, personId });
                  toast({ tone: 'success', title: `${typeOf(letterType)} for ${nameOf(personId)} issued` });
                },
                onBulk: () => setBulk(true),
              },
            }
          : {}),
        children: canIssue && bulkOpen && (
          <BulkLetterDialog
            types={types}
            people={choices}
            defaultPicked={picked}
            onClose={() => setBulk(false)}
            onIssue={async (letterType, personIds) => {
              const r = await write<{ issued: number; failed: { personId: string; message: string }[] }>('POST', '/letters/bulk', { letterType, personIds });
              toast({ tone: r.failed.length ? 'error' : 'success', title: `${r.issued} ${typeOf(letterType).toLowerCase()} ${r.issued === 1 ? 'letter' : 'letters'} issued`, ...(r.failed.length ? { description: `${r.failed.length} not issued: ${r.failed[0].message}` } : {}) });
            }}
          />
        ),
      }}
    />
  );
}

export default function YxLettersPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Letters />
    </Suspense>
  );
}
