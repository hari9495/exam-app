'use client';

import { CoverageMonitorPanel, type CoverageRow, type SetupEntity } from '@yukthix/ui/pay';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';

// Payroll › Statutory coverage (PAY-30, PAY-2.11): head count against the legal thresholds, checked daily. A crossed
// threshold is switched on (registration number and start) or recorded as applied for, by people with the statutory
// set-up key (second sign-in step, as in statutory set-up).
export default function YxPayCoveragePage() {
  const perms = useYxPermissions();
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const rows = usePay<CoverageRow[]>('/coverage');
  const write = usePayWrite();
  return (
    <CoverageMonitorPanel
      live={{
        state: payState(entities, rows),
        onRetry: () => void rows.refetch(),
        entities: entities.data ?? [],
        rows: rows.data ?? null,
        setupHref: '/yx/payroll/setup',
        onSettle: perms.has('payroll.statutory.setup')
          ? (row, x) =>
              write(
                `/entities/${encodeURIComponent(row.legalEntityId)}/statutory-registrations`,
                { registrations: [{ statute: row.statute, status: x.applied ? 'applied_awaited' : 'on', ...(x.applied ? { appliedOn: x.from } : { registrationNo: x.registrationNo, startOn: x.from }) }] },
                'PUT',
              )
          : undefined,
      }}
    />
  );
}
