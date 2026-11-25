'use client';

import { useMemo, useState } from 'react';
import { SETTINGS_GROUPS, SettingsPageScreen, DocumentTypeDrawer, documentTypesPage, type DocTypeRow } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';
import { useAuth } from '../../../../../../lib/auth-context';

const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '5.1')!;

// Settings › Documents & Communication › 5.1 Document types (S-8, answer 1331): the drawn page with YukthiX's starter
// types (read-only) and the company's own, which HR's settings key adds, changes and retires (never while acting for
// someone else). Everyone who may open the page sees it; the API checks every change.
export default function YxDocumentTypesPage() {
  const { impersonating, actingSuperAdmin } = useAuth();
  const types = useLife<DocTypeRow[]>('/documents/types');
  const write = useLifeWrite();
  const canEdit = useYxPermissions().has('org.settings.manage') && !impersonating && !actingSuperAdmin;
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const rows = types.data ?? [];
  const page = useMemo(() => (types.data ? documentTypesPage(design, types.data) : design), [types.data]);
  const state = loadState(types);
  const current = typeof open === 'number' ? rows[open] ?? null : null;
  return (
    <>
      <SettingsPageScreen
        groups={SETTINGS_GROUPS}
        pageId="5.1"
        live={{
          page,
          canEdit,
          lastChange: null,
          state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : state === 'no-access' ? 'no-access' : 'error',
          onRetry: () => void types.refetch(),
          onSave: async () => undefined,
          listEditors: canEdit ? { 'doc.types': setOpen } : undefined,
        }}
      />
      {open !== null && (
        <DocumentTypeDrawer
          initial={current}
          onClose={() => setOpen(null)}
          onSave={(input) => (current ? write('PUT', `/documents/types/${current.key}`, input) : write('POST', '/documents/types', input))}
          onRetire={current && !current.system ? () => write('POST', `/documents/types/${current.key}/retire`) : undefined}
          onReset={current?.ownChoices ? () => write('POST', `/documents/types/${current.key}/reset`) : undefined}
        />
      )}
    </>
  );
}
