'use client';

import { PayImportsScreen, type GoLiveCheck, type ImportBatch, type SetupEntity } from '@yukthix/ui/pay';
import { payState, usePay, usePayWrite } from '../../../../../lib/yx-pay';
import { todayIndia } from '../../../../../lib/yx-time';

// Payroll › Import from the old payroll (PAY-2.12): rows checked, then committed; imported months are locked.
export default function YxPayImportsPage() {
  const entities = usePay<SetupEntity[]>('/setup/entities');
  const write = usePayWrite();
  return (
    <PayImportsScreen
      state={payState(entities)}
      onRetry={() => void entities.refetch()}
      entities={(entities.data ?? []).filter((x) => x.keys.includes('payroll.import.run'))}
      today={todayIndia()}
      onStage={(legalEntityId, kind, rows) => write<ImportBatch>('/imports', { legalEntityId, kind, rows })}
      onCommit={(id) => write(`/imports/${encodeURIComponent(id)}/commit`)}
      onGoLive={(legalEntityId, goLiveMonth) =>
        write<GoLiveCheck>('/imports/go-live-check', {
          legalEntityId,
          goLiveMonth,
        })
      }
    />
  );
}
