'use client';

import { LetterTemplatesScreen, type Choice, type LetterTemplates, type Signatory } from '@yukthix/ui/lifecycle';
import type { LegalEntity } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useFileGet, useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Settings › Letter templates (PPL-29; P05 Q1 / Q3, YX-DOC-15): YukthiX starters, Word uploads checked for safety and
// placeholders, the sample preview before a template is used, and who signs for each legal entity.
export default function YxLetterTemplatesPage() {
  const perms = useYxPermissions();
  const data = useLife<LetterTemplates>('/letters/templates');
  const signatories = useLife<Signatory[]>('/letters/signatories');
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const users = useLife<Choice[]>(perms.has('letter.signatory.manage') ? '/letters/signatories/people' : null);
  const write = useLifeWrite();
  const get = useFileGet();
  return (
    <LetterTemplatesScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      data={data.data ?? null}
      signatories={signatories.data ?? []}
      entities={(entities.data ?? []).filter((e) => !e.archivedAt).map((e) => ({ value: e.id, label: e.name }))}
      users={users.data ?? []}
      onStarter={(letterType) => write('POST', '/letters/templates/starter', { letterType })}
      onUpload={(x) => {
        const form = new FormData();
        form.append('letterType', x.letterType);
        form.append('name', x.name);
        form.append('requiresApproval', String(x.requiresApproval));
        form.append('personSigns', String(x.personSigns));
        form.append('file', x.file);
        return write('POST', '/letters/templates', form);
      }}
      onPreview={(t) => get(`/letters/templates/${encodeURIComponent(t.id)}/preview`, 'preview.pdf')}
      onWord={(t) => get(`/letters/templates/${encodeURIComponent(t.id)}/docx`, `${t.letterType}.docx`)}
      onStatus={(t, status) => write('POST', `/letters/templates/${encodeURIComponent(t.id)}/${status === 'active' ? 'activate' : 'retire'}`)}
      onAddSignatory={(x) => {
        const form = new FormData();
        form.append('legalEntityId', x.legalEntityId);
        form.append('userId', x.userId);
        form.append('title', x.title);
        if (x.image) form.append('file', x.image);
        return write('POST', '/letters/signatories', form);
      }}
      onRemoveSignatory={(s) => write('POST', `/letters/signatories/${encodeURIComponent(s.id)}/remove`)}
    />
  );
}
