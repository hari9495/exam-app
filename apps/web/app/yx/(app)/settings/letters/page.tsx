'use client';

import { useRef, useState } from 'react';
import { useToast } from '@yukthix/ui';
import { LetterTemplatesList, type TemplateSpec } from '@yukthix/ui/frame';
import { SignatoriesDrawer, type Choice, type EditorParagraph, type LetterTemplate, type LetterTemplates, type Signatory } from '@yukthix/ui/lifecycle';
import type { LegalEntity } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useFileGet, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { usePeople } from '../../../../../lib/yx-people';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch, apiFetchBlob } from '../../../../../lib/api-client';

// Settings › Letter templates (PPL-29, design audit step 3; P05 Q1 / Q3, YX-DOC-15): the designed list and workspace.
// Several templates per letter type, made from a Word upload (checked for safety and placeholders), the editor or a
// YukthiX starter; a test render must be seen before a template is switched on. Who signs sits behind "Signatories".
export default function YxLetterTemplatesPage() {
  const perms = useYxPermissions();
  const { toast } = useToast();
  const { accessToken } = useAuth();
  const data = useLife<LetterTemplates>('/letters/templates');
  const canSign = perms.has('letter.signatory.manage');
  const signatories = useLife<Signatory[]>(canSign ? '/letters/signatories' : null);
  const users = useLife<Choice[]>(canSign ? '/letters/signatories/people' : null);
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const people = usePeople<{ personId?: string; name: string; employeeCode?: string | null }[]>(perms.has('letter.issue') ? '/employees' : null);
  const write = useLifeWrite();
  const get = useFileGet();
  const [signing, setSigning] = useState(false);
  // The test render's object URL: the last one is let go when the next is made.
  const shown = useRef<string | null>(null);
  const t = (x: LetterTemplate) => `/letters/templates/${encodeURIComponent(x.id)}`;
  const entityChoices = (entities.data ?? []).filter((e) => !e.archivedAt).map((e) => ({ value: e.id, label: e.name }));
  const spec = (x: TemplateSpec) => ({ letterType: x.letterType, name: x.name, ...(x.legalEntityId ? { legalEntityId: x.legalEntityId } : {}), requiresApproval: x.requiresApproval, personSigns: x.personSigns, onePerPerson: x.onePerPerson });
  return (
    <LetterTemplatesList
      rows={[]}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        entities: entityChoices,
        people: (people.data ?? []).filter((p) => p.personId).map((p) => ({ value: p.personId!, label: p.employeeCode ? `${p.name} · ${p.employeeCode}` : p.name })),
        onUpload: ({ file, fixes, ...x }) => {
          const form = new FormData();
          for (const [k, v] of Object.entries(spec(x))) form.append(k, String(v));
          if (fixes) form.append('fixes', JSON.stringify(fixes));
          form.append('file', file);
          return write<LetterTemplate>('POST', '/letters/templates', form);
        },
        onCompose: ({ paragraphs, ...x }) => write<LetterTemplate>('POST', '/letters/templates/compose', { ...spec(x), paragraphs }),
        onStarter: (letterType) => write<LetterTemplate>('POST', '/letters/templates/starter', { letterType }),
        onParagraphs: async (x) => ((await apiFetch(`${t(x)}/paragraphs`, {}, accessToken ?? undefined)) as { paragraphs: EditorParagraph[] }).paragraphs,
        onWord: (x) => void get(`${t(x)}/docx`, `${x.letterType}.docx`),
        wordFile: async (x) => {
          const { blob, filename } = await apiFetchBlob(`${t(x)}/docx`, {}, accessToken ?? undefined);
          return new File([blob], filename ?? `${x.letterType}.docx`, { type: blob.type });
        },
        onTestRender: async (x, personId) => {
          const { blob } = await apiFetchBlob(`${t(x)}/preview${personId ? `?personId=${encodeURIComponent(personId)}` : ''}`, {}, accessToken ?? undefined);
          void data.refetch(); // seeing it allows switching the template on
          if (shown.current) URL.revokeObjectURL(shown.current);
          return (shown.current = URL.createObjectURL(blob));
        },
        onStatus: async (x, status) => {
          await write('POST', `${t(x)}/${status === 'active' ? 'activate' : 'retire'}`);
        },
        ...(canSign ? { onSignatories: () => setSigning(true) } : {}),
        listHref: '/yx/settings/letters',
        children: signing && (
          <SignatoriesDrawer
            onClose={() => setSigning(false)}
            signatories={signatories.data ?? []}
            entities={entityChoices}
            users={users.data ?? []}
            onAdd={async ({ image, ...x }) => {
              const form = new FormData();
              for (const [k, v] of Object.entries(x)) form.append(k, v);
              if (image) form.append('file', image);
              await write('POST', '/letters/signatories', form);
              toast({ tone: 'success', title: `${users.data?.find((u) => u.value === x.userId)?.label ?? 'The signatory'} added` });
            }}
            onRemove={async (s) => {
              await write('POST', `/letters/signatories/${encodeURIComponent(s.id)}/remove`);
              toast({ tone: 'success', title: `${s.name} removed` });
            }}
          />
        ),
      }}
    />
  );
}
