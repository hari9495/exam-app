'use client';

import { useParams, useRouter } from 'next/navigation';
import { AssetPageScreen, type AssetPageData } from '@yukthix/ui/frame';
import { loadState } from '../../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';

// People › Assets › an asset (IT assets plan, 26 Nov 2026): Details and History for whoever sees the asset (asset.view
// over its place); asset managers of its place edit the details. The API checks every call. Answer 2722: the Tickets tab
// (the tickets the viewer may see on the Helpdesk; the count for everyone else) opens a ticket on the Helpdesk.
export default function YxAssetPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const data = useLife<AssetPageData>(`/lifecycle/assets/${encodeURIComponent(id)}`);
  const write = useLifeWrite();
  const a = data.data?.asset;
  // IT assets part 1 (answer 2712): Edit details picks the category from the company list.
  const cats = useLife<{ rows: { id: string; name: string }[] }>(data.data?.canManage ? '/lifecycle/asset-categories' : null);
  // IT assets part 3 (answer 2716): Edit details may name an active supplier.
  const suppliers = useLife<{ rows: { id: string; name: string; retired: boolean }[] }>(data.data?.canManage ? '/lifecycle/asset-suppliers' : null);
  return (
    <AssetPageScreen
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onBack: () => router.push('/yx/people/assets'),
        categories: cats.data?.rows.map((c) => ({ value: c.id, label: c.name })),
        suppliers: suppliers.data?.rows.filter((s) => !s.retired).map((s) => ({ value: s.id, label: s.name })),
        onOpenTicket: (t) => router.push(`/yx/desk/tickets/${encodeURIComponent(t)}`),
        // Answer 2717: a covering contract opens on People › Asset contracts.
        onOpenContract: (k) => router.push(`/yx/people/assets/contracts?open=${encodeURIComponent(k)}`),
        // Answer 2718: a licence with a seat on the device opens on People › Software licences.
        onOpenLicence: (l) => router.push(`/yx/people/assets/licences?open=${encodeURIComponent(l)}`),
        // The update sends the whole asset (tag and place stay as they are; the category as picked), with its version.
        onSave: (x) => write('PUT', `/lifecycle/assets/${encodeURIComponent(id)}`, { ...(a!.categoryId ? { categoryId: a!.categoryId } : { category: a!.category }), tag: a!.tag, legalEntityId: a!.legalEntityId, locationId: a!.locationId, ...x, version: a!.version }),
      }}
    />
  );
}
