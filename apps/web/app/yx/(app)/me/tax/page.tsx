'use client';

import { MyTaxScreen, type MyTaxWorkspace, type RegimeComparison } from '@yukthix/ui/pay';
import { payState } from '../../../../../lib/yx-pay';
import { useApi, useApiWrite } from '../../../../../lib/yx-pay-5j';

// Me › Tax (PAY-10.03, PAY-22 / PAY-41; PAY-10.05 the regime planner): compare the regimes and choose one.
export default function YxMyTaxPage() {
  const ws = useApi<MyTaxWorkspace>('/tax/me/workspace');
  const write = useApiWrite();
  return (
    <MyTaxScreen
      state={payState(ws)}
      onRetry={() => void ws.refetch()}
      workspace={ws.data ?? null}
      onCompare={() => write<RegimeComparison>('/tax/me/regime-compare')}
      onChooseRegime={(regime) => write('/tax/me/workspace', { regime }, 'PATCH')}
    />
  );
}
