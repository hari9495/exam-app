'use client';

import { useRouter } from 'next/navigation';
import { CatalogScreen, type Catalogue, type CatalogItemPage, type OrderGuideView, type PickOption } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › Service catalogue (M14 SD-2.03, SD-2.04): items the person may order, the cart (one request per
// desk, each item with its own approval and tasks), order guides and live-data pickers. Open to everyone in the
// company; the API shows only the items whose audience holds for the person.
export default function YxDeskCatalogPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const catalogue = useDesk<Catalogue>('/my/catalog');
  const write = useDeskWrite();
  const id = (x: string) => encodeURIComponent(x);
  return (
    <CatalogScreen
      state={deskState(catalogue)}
      onRetry={() => void catalogue.refetch()}
      catalogue={catalogue.data ?? { items: [], guides: [] }}
      onOpenItem={(itemId) => apiFetch(`/desk/my/catalog/items/${id(itemId)}`, {}, token) as Promise<CatalogItemPage>}
      onOpenGuide={(guideId) => apiFetch(`/desk/my/catalog/guides/${id(guideId)}`, {}, token) as Promise<OrderGuideView>}
      onResolveGuide={(guideId, answers) => write(`/my/catalog/guides/${id(guideId)}/resolve`, 'POST', { answers })}
      onCheckout={(input) => write('/my/catalog/checkout', 'POST', input)}
      onPick={(kind, q) => apiFetch(`/desk/my/pick/${kind}?q=${encodeURIComponent(q)}`, {}, token) as Promise<PickOption[]>}
      onOpenRequest={(ticketId) => router.push(`/yx/desk/help/${id(ticketId)}`)}
    />
  );
}
