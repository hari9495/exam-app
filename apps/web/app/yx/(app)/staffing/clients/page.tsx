'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClientSheet, ClientsScreen, type ClientRowView } from '@yukthix/ui/hiring';
import { deskState, useStaffing, useStaffingWrite } from '../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../lib/auth-context';

type Choice = { value: string; label: string };
type List = { canManage: boolean; choices: { states: Choice[]; people: Choice[] } | null; rows: ClientRowView[] };

// Staffing desk › Clients (HIR-14): the designed ClientsScreen with `live`. Account managers add clients; recruiters
// with the view key read them. The desk must be on (Settings › Staffing desk); the API checks every call.
export default function YxStaffingClientsPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const list = useStaffing<List>('/clients');
  const terms = useStaffing<{ values: Record<string, string> }>('/settings', Boolean(list.data?.canManage));
  const write = useStaffingWrite();
  const [adding, setAdding] = useState(false);
  const canManage = Boolean(list.data?.canManage) && !(impersonating || actingSuperAdmin);
  return (
    <>
      <ClientsScreen
        live={{
          state: deskState(list),
          onRetry: () => void list.refetch(),
          rows: list.data?.rows ?? [],
          canManage,
          onAdd: () => setAdding(true),
          onOpen: (id) => router.push(`/yx/staffing/clients/${encodeURIComponent(id)}`),
        }}
      />
      {adding && list.data?.choices && (
        <ClientSheet
          open
          onOpenChange={(o) => !o && setAdding(false)}
          initial={null}
          states={list.data.choices.states}
          people={list.data.choices.people}
          defaultTermsDays={Number(terms.data?.values['staffing.payment_terms_days'] ?? 30)}
          onSave={async (input) => {
            const made = await write<{ id: string }>('POST', '/clients', input);
            router.push(`/yx/staffing/clients/${encodeURIComponent(made.id)}`);
          }}
        />
      )}
    </>
  );
}
