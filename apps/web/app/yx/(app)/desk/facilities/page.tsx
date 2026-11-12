'use client';

import { useRouter } from 'next/navigation';
import { FacilitiesScreen, type EquipmentPageView, type FacilitiesRegister } from '@yukthix/ui/desk';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk plan item 4: buildings (the company's locations), their floors or areas, and equipment owned by a team of a
// facilities desk. The facilities desks' staff read it; only a facilities desk's admins change it. The equipment page
// lists its work orders and recurring maintenance.
export default function YxDeskFacilitiesPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const router = useRouter();
  const register = useDesk<FacilitiesRegister>('/facilities');
  const write = useDeskWrite();
  return (
    <FacilitiesScreen
      state={deskState(register)}
      onRetry={() => void register.refetch()}
      register={register.data ?? null}
      onSaveArea={(id, input) => write(id ? `/facilities/areas/${encodeURIComponent(id)}` : '/facilities/areas', id ? 'PATCH' : 'POST', input)}
      onSaveEquipment={(id, input) => write(id ? `/facilities/equipment/${encodeURIComponent(id)}` : '/facilities/equipment', id ? 'PATCH' : 'POST', input)}
      onOpenEquipment={(id) => apiFetch(`/desk/facilities/equipment/${encodeURIComponent(id)}`, {}, token) as Promise<EquipmentPageView>}
      onOpenTicket={(id) => router.push(`/yx/desk/tickets/${encodeURIComponent(id)}`)}
    />
  );
}
