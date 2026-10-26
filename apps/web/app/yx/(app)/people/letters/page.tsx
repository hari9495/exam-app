'use client';

import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { IssuedLettersRegister } from '@yukthix/ui/frame';
import { BulkLetterDialog, type Letter, type LetterTemplate, type LetterTemplates, type Signatory } from '@yukthix/ui/lifecycle';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetchBlob } from '../../../../../lib/api-client';
import { decodeJwtPayload } from '../../../../../lib/jwt';
import { useYxPermissions, loadState } from '../../../../../lib/yx-org';
import { useLetterDownload, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { usePeople } from '../../../../../lib/yx-people';
import { verifyUrl } from '../../../../../lib/yx-pay';

// People › Documents & letters › Letters (PPL-28, design audit step 3; P05 §4.3): every letter issued to people in
// scope, with its reference, signature and status; issue one letter (type, template, preview with real data) or many.
function Letters() {
  const { toast } = useToast();
  const { accessToken } = useAuth();
  const perms = useYxPermissions();
  const rows = useLife<Letter[]>('/letters/issued');
  const download = useLetterDownload();
  const write = useLifeWrite();
  const templates = useLife<LetterTemplates>('/letters/templates');
  const signatories = useLife<Signatory[]>('/letters/signatories');
  const people = usePeople<{ id: string; personId?: string; name: string; employeeCode?: string | null; legalEntityId: string | null }[]>('/employees');
  const active = (templates.data?.templates ?? []).filter((t) => t.status === 'active');
  const types = [...new Map(active.map((t) => [t.letterType, { value: t.letterType, label: t.name }])).values()];
  const choices = (people.data ?? []).filter((x) => x.personId).map((x) => ({ value: x.personId!, label: x.employeeCode ? `${x.name} · ${x.employeeCode}` : x.name, legalEntityId: x.legalEntityId }));
  // Issue letter from the directory or a record: ?people= the employee records chosen there. One opens the issue
  // sheet with them chosen; more open the bulk issue.
  const params = useSearchParams();
  const asked = new Set((params?.get('people') ?? '').split(',').filter(Boolean));
  const picked = (people.data ?? []).filter((x) => asked.has(x.id) && x.personId).map((x) => x.personId!);
  const [bulk, setBulk] = useState<boolean | null>(null);
  const bulkOpen = bulk ?? picked.length > 1;
  // The preview PDF's object URL: the last one is let go when the next is made.
  const shown = useRef<string | null>(null);
  const me = accessToken ? decodeJwtPayload(accessToken)?.sub : null;
  const nameOf = (personId: string) => choices.find((c) => c.value === personId)?.label.split(' · ')[0] ?? 'the person';
  const typeOf = (letterType: string) => types.find((t) => t.value === letterType)?.label ?? 'Letter';
  const canIssue = perms.has('letter.issue') && types.length > 0 && choices.length > 0;
  return (
    <IssuedLettersRegister
      rows={[]}
      live={{
        state: loadState(rows),
        onRetry: () => void rows.refetch(),
        rows: rows.data ?? [],
        verifyUrl,
        onDownload: (l) => void download(l.id, 'letter', `${l.referenceNo ?? 'letter'}.pdf`),
        ...(perms.has('letter.template.manage') ? { templatesHref: '/yx/settings/letters' } : {}),
        ...(canIssue
          ? {
              issue: {
                templates: active,
                people: choices,
                // The API's rule: the entity's first signatory approves, unless that is the issuer (then a company admin).
                approverFor: (legalEntityId: string | null) => {
                  const s = (signatories.data ?? []).find((x) => x.legalEntityId === legalEntityId);
                  return s && s.userId !== me ? s.name : null;
                },
                onPreview: async (personId: string, t: LetterTemplate) => {
                  const { blob } = await apiFetchBlob('/letters/preview', { method: 'POST', body: JSON.stringify({ letterType: t.letterType, personId, templateId: t.id }) }, accessToken ?? undefined);
                  if (shown.current) URL.revokeObjectURL(shown.current);
                  return (shown.current = URL.createObjectURL(blob));
                },
                onIssue: async (personId: string, t: LetterTemplate) => {
                  await write('POST', '/letters/issue', { letterType: t.letterType, personId, templateId: t.id });
                  toast({ tone: 'success', title: `${t.name} for ${nameOf(personId)} ${t.requiresApproval ? 'sent for approval' : 'issued'}` });
                },
                onBulk: () => setBulk(true),
                ...(picked.length === 1 ? { person: picked[0] } : {}),
              },
            }
          : {}),
        children: canIssue && bulkOpen && (
          <BulkLetterDialog
            types={types}
            people={choices}
            defaultPicked={picked}
            defaultType={params?.get('type') ?? null}
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
