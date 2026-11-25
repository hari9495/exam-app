'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InvoiceSeriesSheet, SETTINGS_GROUPS, SettingsPageScreen, staffingEntityChanges, staffingSettingsChanges, staffingSettingsPage, type StaffingSettingsData } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useStaffing, useStaffingWrite } from '../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../lib/auth-context';

const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.2')!;

// Settings › Hiring & Assessments › Staffing desk (6.2): the designed settings page with `live`. Turning the desk on
// opens the staffing menu for the company. Account managers or HR with the settings key (whole company) change it,
// never while acting for someone else; each change is a company setting, audited. Invoice series are added and changed
// in their sheet (one per GSTIN per financial year; the next number only goes up).
export default function YxStaffingSettingsPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const data = useStaffing<StaffingSettingsData>('/settings');
  const write = useStaffingWrite();
  const [series, setSeries] = useState<number | 'new' | null>(null);
  const state = loadState(data);
  const page = useMemo(() => (data.data ? staffingSettingsPage(design, data.data) : design), [data.data]);
  const canEdit = Boolean(data.data?.canEdit) && !acting;
  const current = typeof series === 'number' ? data.data?.series[series] : undefined;
  return (
    <>
      <SettingsPageScreen
        groups={SETTINGS_GROUPS}
        pageId="6.2"
        live={{
          page,
          canEdit,
          lastChange: data.data?.lastChange ? { by: data.data.lastChange.by, role: '', at: data.data.lastChange.at, what: data.data.lastChange.what } : null,
          state: state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : 'error',
          onRetry: () => void data.refetch(),
          savedTitle: 'Staffing desk settings saved',
          onSave: async (values, _rows, overrides) => {
            // Answer 495: e-invoicing chosen per legal entity goes with the company values.
            const changes = [...staffingSettingsChanges(values), ...staffingEntityChanges(overrides ?? [], data.data?.entities ?? [])];
            if (changes.length) await write('PUT', '/settings', { changes });
          },
          listEditors: canEdit ? { 'staff.invoice_series': setSeries } : undefined,
          onOpenScreen: (screenId) => (screenId === 'HIR-15' ? router.push('/yx/staffing/rate-cards') : screenId === 'HIR-14' ? router.push('/yx/staffing/clients') : undefined),
        }}
      />
      {series !== null && data.data && (
        <InvoiceSeriesSheet
          key={current?.id ?? 'new'}
          open
          onOpenChange={(o) => !o && setSeries(null)}
          initial={current ? { id: current.id, legalEntityId: current.legalEntityId, gstin: current.gstin, financialYear: current.financialYear, prefix: current.prefix, nextNumber: current.nextNumber } : null}
          entities={data.data.entities}
          financialYear={data.data.financialYear}
          onSave={(input) => (current ? write('PUT', `/invoice-series/${encodeURIComponent(current.id)}`, { ...input, version: current.version }) : write('POST', '/invoice-series', input))}
        />
      )}
    </>
  );
}
