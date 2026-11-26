'use client';

import { LedgerMappingScreen, type LedgerMappingRow, type PayComponent } from '@yukthix/ui/pay';
import type { LegalEntity, MasterRecord } from '@yukthix/ui/org';
import { useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Pay › Ledger mapping (PAY-62, Enterprise E4 O19-O20): which ledger account each pay line goes to, with overrides per
// legal entity or cost centre, and the suspense account. Payroll's ledger key changes it; the journal export key reads it.
export default function YxLedgerMappingPage() {
  const perms = useYxPermissions();
  const rows = usePay<LedgerMappingRow[]>('/ledger-mappings');
  const components = usePay<PayComponent[]>('/components');
  const entities = useOrg<LegalEntity[]>('/legal-entities');
  const ccs = useOrg<MasterRecord[]>('/masters/cost-centres');
  const write = usePayWrite();
  const st = payState(rows);
  return (
    <LedgerMappingScreen
      state={st === 'no-access' ? 'forbidden' : st}
      onRetry={() => void rows.refetch()}
      rows={rows.data ?? null}
      options={{
        lines: (components.data ?? []).map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })),
        entities: (entities.data ?? []).filter((e) => !e.archivedAt).map((e) => ({ value: e.id, label: e.name })),
        costCentres: (ccs.data ?? []).filter((c) => !c.archivedAt).map((c) => ({ value: c.id, label: c.name })),
      }}
      canEdit={perms.has('payroll.ledger.manage')}
      onSave={async (input) => {
        await write('/ledger-mappings', input, 'PUT');
      }}
      onRemove={async (id) => {
        await write(`/ledger-mappings/${encodeURIComponent(id)}/remove`);
      }}
    />
  );
}
