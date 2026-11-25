'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateInvoicesSheet, ExportSheet, InvoicesScreen, type ExportOptions, type InvoiceOptions, type InvoiceRowView } from '@yukthix/ui/hiring';
import { deskState, useStaffing, useStaffingDownload, useStaffingWrite } from '../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../lib/auth-context';

// Staffing desk › Invoices (HIR-18): the designed list with `live`. Staffing finance creates drafts from client-approved
// hours and issues them; account managers read. Recruiters have no invoices (the API answers 403).
export default function YxStaffingInvoicesPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const list = useStaffing<{ canCreate: boolean; rows: InvoiceRowView[] }>('/invoices');
  const canCreate = Boolean(list.data?.canCreate) && !(impersonating || actingSuperAdmin);
  const options = useStaffing<InvoiceOptions>('/invoices/options', canCreate);
  const write = useStaffingWrite();
  const [creating, setCreating] = useState(false);
  // Answer 522: Export to accounting.
  const [exporting, setExporting] = useState(false);
  const exportOptions = useStaffing<ExportOptions>('/exports/options', exporting);
  const download = useStaffingDownload();
  return (
    <>
      <InvoicesScreen
        live={{
          state: deskState(list),
          onRetry: () => void list.refetch(),
          rows: list.data?.rows ?? [],
          canCreate,
          onCreate: () => setCreating(true),
          onOpen: (id) => router.push(`/yx/staffing/invoices/${encodeURIComponent(id)}`),
          onExport: () => setExporting(true),
        }}
      />
      {exporting && exportOptions.data && (
        <ExportSheet open onOpenChange={(o) => !o && setExporting(false)} options={exportOptions.data} onExport={(q) => download(`/exports?${new URLSearchParams({ seriesId: q.seriesId, month: q.month, format: q.format })}`, `export-${q.month}.${q.format === 'tally' ? 'xml' : 'zip'}`)} />
      )}
      {creating && options.data && (
        <CreateInvoicesSheet
          open
          onOpenChange={(o) => !o && setCreating(false)}
          options={options.data}
          onSave={async ({ po, ...input }) => {
            const r = await write<{ ids: string[] }>('POST', '/invoices/draft', { ...input, ...(po ? { po } : {}) });
            if (r.ids.length === 1) router.push(`/yx/staffing/invoices/${encodeURIComponent(r.ids[0]!)}`);
          }}
        />
      )}
    </>
  );
}
