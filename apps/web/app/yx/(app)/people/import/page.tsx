'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { EmployeeImportWizard, type ImportFile, type ImportInput, type ImportResult } from '@yukthix/ui/frame';
import { useLifeWrite, useJoinerPlaces } from '../../../../../lib/yx-lifecycle';
import { useScope } from '../../../../../lib/yx-shell';
import { saveBlob } from '../../../../../lib/yx-pay';

// People › Import (PPL-07): employees from a CSV or Excel file. The API reads the file, checks every row through the
// hire path ("Add employee"), and creates only the rows that pass; employee.change.manage, scoped per row.
export default function YxEmployeeImportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { scope } = useScope();
  const places = useJoinerPlaces(true);
  const write = useLifeWrite();
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
        // With a byte-order mark, so Excel opens the names in the right letters.
        onSaveFile: (name, csv) => saveBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), name),
      }}
    />
  );
}
