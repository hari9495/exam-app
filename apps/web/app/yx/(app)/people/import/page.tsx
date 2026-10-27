'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { EmployeeImportWizard, type ImportDraftState, type ImportDraftSummary, type ImportFile, type ImportInput, type ImportResult } from '@yukthix/ui/frame';
import { useLife, useLifeWrite, useJoinerPlaces } from '../../../../../lib/yx-lifecycle';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useScope } from '../../../../../lib/yx-shell';
import { saveBlob } from '../../../../../lib/yx-pay';

const DRAFT = '/people/employee-import/draft';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// People › Import (PPL-07): employees from a CSV or Excel file. The API reads the file, checks every row through the
// hire path ("Add employee"), and creates only the rows that pass; employee.change.manage, scoped per row.
export default function YxEmployeeImportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { scope } = useScope();
  const places = useJoinerPlaces(true);
  const write = useLifeWrite();
  const { accessToken } = useAuth();
  // "Save and exit": the person's own saved import (nobody else sees it).
  const draft = useLife<{ draft: ImportDraftSummary | null }>(DRAFT);
  return (
    <EmployeeImportWizard
      live={{
        entities: places.entities,
        defaultEntity: scope.entity ?? null,
        onRead: (file) => {
          const form = new FormData();
          form.append('file', file);
          return write<ImportFile>('POST', '/people/employee-import/read', form);
        },
        onCheck: (input: ImportInput) => write<ImportResult>('POST', '/people/employee-import/check', input),
        onImport: async (input: ImportInput) => {
          const out = await write<ImportResult>('POST', '/people/employee-import', input);
          const skipped = input.rows.length - (out.created ?? 0);
          toast({ tone: 'success', title: `${out.created} ${out.created === 1 ? 'employee' : 'employees'} imported from ${input.fileName}`, ...(skipped ? { description: `${skipped} ${skipped === 1 ? 'row was' : 'rows were'} skipped.` } : {}) });
          router.push('/yx/people/directory');
          return out;
        },
        draft: draft.data?.draft ?? null,
        onSaveDraft: async (state: ImportDraftState) => {
          try {
            const out = await write<{ keptUntil: string }>('PUT', DRAFT, state);
            toast({ tone: 'success', title: `Import of ${state.file.name} saved`, description: `Resume it from People › Import until ${day(out.keptUntil)}.` });
            router.push('/yx/people/directory');
          } catch (e) {
            toast({ tone: 'error', title: e instanceof Error ? e.message : 'The import was not saved. Try again.' });
          }
        },
        onExit: () => router.push('/yx/people/directory'),
        onResume: () => apiFetch(`${DRAFT}/content`, {}, accessToken ?? undefined) as Promise<ImportDraftState>,
        onDiscard: async () => {
          const name = draft.data?.draft?.fileName ?? 'the file';
          await write('DELETE', DRAFT);
          toast({ tone: 'success', title: `Saved import of ${name} discarded` });
        },
        // With a byte-order mark, so Excel opens the names in the right letters.
        onSaveFile: (name, csv) => saveBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), name),
      }}
    />
  );
}
