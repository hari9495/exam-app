'use client';

import { CoverageLiveScreen, type CoverageRow, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay } from '../../../../../lib/yx-pay';

// Payroll › Statutory coverage (PAY-30, PAY-2.11): head count against the PF and ESI thresholds, checked daily.
export default function YxPayCoveragePage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const rows = usePay<CoverageRow[]>('/coverage');
  return <CoverageLiveScreen state={payState(entities, rows)} onRetry={() => void rows.refetch()} entities={entities.data ?? []} rows={rows.data ?? null} />;
}
