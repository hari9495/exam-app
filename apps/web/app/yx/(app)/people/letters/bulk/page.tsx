'use client';

import { Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { BulkLetterWizard } from '@yukthix/ui/frame';
import type { BulkLetterCheck, LetterTemplate, LetterTemplates } from '@yukthix/ui/lifecycle';
import { useAuth } from '../../../../../../lib/auth-context';
import { apiFetch, apiFetchBlob } from '../../../../../../lib/api-client';
import { useYxPermissions, loadState } from '../../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';
import { usePeople } from '../../../../../../lib/yx-people';

// People › Letters › Bulk issue (PPL-28): one template to many people. The API previews each person's letter (or why
// it can't be made), HR opens anyone's letter, and the issue needs the typed count, which the API counts again.
// Opened from the Letters page, or with ?people= (employee records chosen in the directory or a restructure) and
// ?type= (the letter type to start with).
function BulkLetters() {
  const { toast } = useToast();
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const perms = useYxPermissions();
  const write = useLifeWrite();
  const templates = useLife<LetterTemplates>('/letters/templates');
  const people = usePeople<{ id: string; personId?: string; name: string; employeeCode?: string | null }[]>('/employees');
  const asked = new Set((params?.get('people') ?? '').split(',').filter(Boolean));
  const listed = (people.data ?? []).filter((x) => x.personId);
  // The preview PDF's object URL: the last one is let go when the next is made.
  const shown = useRef<string | null>(null);
  const state = perms.has('letter.issue') ? loadState(templates, people) : 'no-access';
  return (
    <BulkLetterWizard
      // The wizard starts once the people are known, so ?people= chooses them.
      key={state}
      live={{
        state,
        onRetry: () => void Promise.all([templates.refetch(), people.refetch()]),
        templates: (templates.data?.templates ?? []).filter((t) => t.status === 'active'),
        people: listed.map((x) => ({ value: x.personId!, label: x.employeeCode ? `${x.name} · ${x.employeeCode}` : x.name })),
        picked: listed.filter((x) => asked.has(x.id)).map((x) => x.personId!),
        letterType: params?.get('type') ?? undefined,
        onCheck: (q) => apiFetch('/letters/bulk/check', { method: 'POST', body: JSON.stringify(q) }, accessToken ?? undefined) as Promise<BulkLetterCheck>,
        onPreview: async (personId: string, t: LetterTemplate) => {
          const { blob } = await apiFetchBlob('/letters/preview', { method: 'POST', body: JSON.stringify({ letterType: t.letterType, personId, templateId: t.id }) }, accessToken ?? undefined);
          if (shown.current) URL.revokeObjectURL(shown.current);
          return (shown.current = URL.createObjectURL(blob));
        },
        onIssue: async (q, confirm, t) => {
          const r = await write<{ issued: number; failed: { name: string | null; message: string }[] }>('POST', '/letters/bulk', { ...q, confirm });
          const done = `${r.issued} ${r.issued === 1 ? 'letter' : 'letters'} ${t.requiresApproval ? 'sent for approval' : 'issued'}`;
          toast(r.failed.length ? { tone: 'error', title: done, description: `${r.failed.length} not made: ${r.failed[0].name ?? 'someone'}, ${r.failed[0].message}` } : { tone: 'success', title: done });
          router.push('/yx/people/letters');
        },
      }}
    />
  );
}

export default function YxBulkLettersPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <BulkLetters />
    </Suspense>
  );
}
