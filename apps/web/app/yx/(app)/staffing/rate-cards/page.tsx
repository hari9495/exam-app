'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RateCardScreen, RateLineSheet, type ClientRowView, type RateRowView } from '@yukthix/ui/hiring';
import { FormField, Select } from '@yukthix/ui';
import { deskState, rupees, useStaffing, useStaffingWrite } from '../../../../../lib/yx-staffing';
import { useAuth } from '../../../../../lib/auth-context';

type Card = { client: { id: string; name: string }; canManage: boolean; showPay: boolean; defaults: { ot: string; holiday: string; backdateDays: number; today: string }; rows: RateRowView[] };

// Staffing desk › Rate cards (HIR-15): the designed RateCardScreen with `live`, one client at a time. Account managers
// add roles and make dated changes (bill and pay rate, margin); recruiters see bill rates only. Money goes to the API as
// exact rupee text; the API keeps paise.
export default function YxStaffingRateCardsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { impersonating, actingSuperAdmin } = useAuth();
  const clients = useStaffing<{ rows: ClientRowView[] }>('/clients');
  const clientId = params.get('client') ?? clients.data?.rows[0]?.id ?? null;
  const [history, setHistory] = useState(false);
  const card = useStaffing<Card>(clientId ? `/clients/${encodeURIComponent(clientId)}/rates${history ? '?history=1' : ''}` : null);
  const write = useStaffingWrite();
  const [adding, setAdding] = useState(false);
  const listState = deskState(clients);
  const state = listState !== 'ready' ? listState : clientId ? deskState(card) : 'ready';
  const canManage = Boolean(card.data?.canManage) && !(impersonating || actingSuperAdmin);
  const today = new Date(`${card.data?.defaults.today ?? new Date().toISOString().slice(0, 10)}T00:00:00`);
  return (
    <>
      <RateCardScreen
        live={{
          state,
          onRetry: () => void Promise.all([clients.refetch(), card.refetch()]),
          clientName: card.data?.client.name ?? null,
          rows: card.data?.rows ?? [],
          showPay: Boolean(card.data?.showPay),
          canManage,
          history,
          onHistory: setHistory,
          today,
          onAdd: () => setAdding(true),
          onChange: (rateId, input) => write('POST', `/rates/${encodeURIComponent(rateId)}/change`, { validFrom: input.validFrom, billRate: rupees(input.billRate), payRate: rupees(input.payRate), reason: input.reason }),
          extra:
            (clients.data?.rows.length ?? 0) > 0 ? (
              <FormField label="Client" hideLabel>
                <Select aria-label="Client" value={clientId} onChange={(v) => v && router.push(`/yx/staffing/rate-cards?client=${encodeURIComponent(v)}`)} options={(clients.data?.rows ?? []).map((c) => ({ value: c.id, label: c.name }))} searchable />
              </FormField>
            ) : undefined,
        }}
      />
      {adding && card.data && clientId && (
        <RateLineSheet
          open
          onOpenChange={(o) => !o && setAdding(false)}
          defaults={{ ot: card.data.defaults.ot, holiday: card.data.defaults.holiday, today }}
          onSave={(input) => write('POST', `/clients/${encodeURIComponent(clientId)}/rates`, { ...input, billRate: rupees(input.billRate), payRate: rupees(input.payRate) })}
        />
      )}
    </>
  );
}
