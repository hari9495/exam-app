'use client';

import { AssetSuppliersScreen, type SupplierRow } from '@yukthix/ui/frame';
import { loadState } from '../../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';

// People › Asset suppliers (IT assets part 3, answer 2716): the IT and Admin supplier list, separate from hiring's
// staffing vendors and contract-labour contractors. Read with asset.view; asset managers add, change and retire. The
// API checks every call.
export default function YxAssetSuppliersPage() {
  const data = useLife<{ canManage: boolean; rows: SupplierRow[] }>('/lifecycle/asset-suppliers');
  const write = useLifeWrite();
  return (
    <AssetSuppliersScreen
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        rows: data.data?.rows ?? [],
        canManage: Boolean(data.data?.canManage),
        onSave: (id, x) => (id ? write('PUT', `/lifecycle/asset-suppliers/${encodeURIComponent(id)}`, x) : write('POST', '/lifecycle/asset-suppliers', x)),
      }}
    />
  );
}
