'use client';

import { CoverageMonitorPanel, type CoverageRow, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay } from '../../../../../lib/yx-pay';

// Payroll › Statutory coverage (PAY-30, PAY-2.11): head count against the legal thresholds, checked daily; read only.
export default function YxPayCoveragePage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const rows = usePay<CoverageRow[]>('/coverage');
  return <CoverageMonitorPanel live={{ state: payState(entities, rows), onRetry: () => void rows.refetch(), entities: entities.data ?? [], rows: rows.data ?? null, setupHref: '/yx/payroll/setup' }} />;
}
