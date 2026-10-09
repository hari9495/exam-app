'use client';

import { PlansScreen, type Product } from '@yukthix/ui/console';
import { loadState, todayIst, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../lib/yx-console';

// Console › Plans and prices (P14 §4, YX-BILL-01/13/14). Changing a price is a step-up action: apiFetch asks the
// staff member for their security key, then resends.
export default function ConsolePlansPage() {
  const products = useConsole<Product[]>('/products');
  const can = useConsoleKeys();
  const write = useConsoleWrite();
  return (
    <PlansScreen
      state={loadState(products)}
      onRetry={() => void products.refetch()}
      products={products.data ?? []}
      canManage={can('platform.plans.manage')}
      today={todayIst()}
      onSchedule={(code, input) => write(`/products/${encodeURIComponent(code)}/prices`, 'POST', input).then(() => undefined)}
      onWithdraw={(priceId) => write(`/products/prices/${encodeURIComponent(priceId)}`, 'DELETE').then(() => undefined)}
    />
  );
}
