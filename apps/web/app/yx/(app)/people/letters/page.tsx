'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, useToast } from '@yukthix/ui';
import { IssuedLettersRegister } from '@yukthix/ui/frame';
import type { Letter, LetterTemplate, LetterTemplates, Signatory } from '@yukthix/ui/lifecycle';
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
  const choices = (people.data ?? []).filter((x) => x.personId).map((x) => ({ value: x.personId!, label: x.employeeCode ? `${x.name} · ${x.employeeCode}` : x.name, legalEntityId: x.legalEntityId }));
  // Issue letter from the directory, a record or a restructure: ?people= the employee records chosen there (and
  // ?type= the letter). One opens the issue sheet with them chosen; more open the bulk issue with the same query.
  const router = useRouter();
  const params = useSearchParams();
  const asked = new Set((params?.get('people') ?? '').split(',').filter(Boolean));
  const picked = (people.data ?? []).filter((x) => asked.has(x.id) && x.personId).map((x) => x.personId!);
  const many = asked.size > 1;
  useEffect(() => {
    if (many) router.replace(`/yx/people/letters/bulk?${params}`);
  }, [many, params, router]);
  // The preview PDF's object URL: the last one is let go when the next is made.
  const shown = useRef<string | null>(null);
  const me = accessToken ? decodeJwtPayload(accessToken)?.sub : null;
  const nameOf = (personId: string) => choices.find((c) => c.value === personId)?.label.split(' · ')[0] ?? 'the person';
  const canIssue = perms.has('letter.issue') && active.length > 0 && choices.length > 0;
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
        ...(perms.has('letter.issue')
          ? {
              // PPL-15: a drafted letter is reviewed in the issue preview (its own words kept), then issued or discarded.
              draft: {
                onPreview: async (l: Letter) => {
                  const { blob } = await apiFetchBlob(`/letters/${encodeURIComponent(l.id)}/preview`, { method: 'POST' }, accessToken ?? undefined);
                  if (shown.current) URL.revokeObjectURL(shown.current);
                  return (shown.current = URL.createObjectURL(blob));
                },
                onIssue: async (l: Letter) => {
                  await write('POST', `/letters/${encodeURIComponent(l.id)}/issue`);
                  toast({ tone: 'success', title: `${l.title.split(': ')[0]} for ${l.person ?? 'the person'} issued` });
                },
                onDiscard: async (l: Letter, reason: string) => {
                  await write('POST', `/letters/${encodeURIComponent(l.id)}/discard`, { reason });
                  toast({ tone: 'success', title: `Draft ${l.title.split(': ')[0].toLowerCase()} for ${l.person ?? 'the person'} discarded` });
                },
              },
              onRetryRender: async (l: Letter) => {
                try {
                  const after = await write<Letter>('POST', `/letters/${encodeURIComponent(l.id)}/render`);
                  if (after.status === 'rendering') toast({ tone: 'error', title: `${l.referenceNo ?? 'The letter'} still couldn't be made`, description: after.renderError ?? undefined });
                  else toast({ tone: 'success', title: `${l.referenceNo ?? 'The letter'} made` });
                } catch (e) {
                  toast({ tone: 'error', title: 'Not tried again', description: (e as Error).message });
                }
              },
            }
          : {}),
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
                onIssue: async (personId: string, t: LetterTemplate, supersedes?: Letter) => {
                  await write('POST', '/letters/issue', { letterType: t.letterType, personId, templateId: t.id, ...(supersedes ? { supersedesId: supersedes.id } : {}) });
                  toast({ tone: 'success', title: `${supersedes ? 'Correction of ' : ''}${t.name} for ${nameOf(personId)} ${t.requiresApproval ? 'sent for approval' : 'issued'}` });
                },
                onBulk: () => router.push('/yx/people/letters/bulk'),
                ...(picked.length === 1 ? { person: picked[0] } : {}),
              },
            }
          : {}),
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
