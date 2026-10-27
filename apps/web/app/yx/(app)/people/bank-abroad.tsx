'use client';

import { useRouter } from 'next/navigation';
import { ErrorState, Spinner, useToast } from '@yukthix/ui';
import { InternationalBankPhone, InternationalBankTab, type LiveIntlBank } from '@yukthix/ui/frame';
import type { ProfileView } from '@yukthix/ui/access';
import { usePeople, usePeopleWrite } from '../../../../lib/yx-people';

// PPL-46 International bank details: the salary account abroad goes to approval like any bank change (the API asks
// for a fresh second factor, applies the cooling period and tells the old contact). HR raises it for someone from
// their record; the person raises their own from the Pay tab.
export function BankAbroad({ employeeId, back }: { employeeId: string | null; back: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const me = usePeople<{ employeeId: string }>(employeeId ? null : '/me');
  const id = employeeId ?? me.data?.employeeId ?? null;
  const profile = usePeople<ProfileView>(id ? `/employees/${encodeURIComponent(id)}/profile` : null);
  const write = usePeopleWrite();
  const p = profile.data;
  if (profile.isError || me.isError) return <ErrorState title="We couldn't load the bank details" description="Retry in a moment." onRetry={() => void profile.refetch()} />;
  if (!p?.identity) return <Spinner label="Loading" size="md" />;
  const a = p.identity.internationalAccount;
  const live: LiveIntlBank = {
    name: p.name,
    current: a ? { ...a, usableFrom: new Date(a.usableFrom) } : null,
    waiting: p.identity.pending.some((x) => x.kind === 'bank_international'),
    onSend: async (value) => {
      await write('POST', `/employees/${encodeURIComponent(id!)}/profile-requests`, { kind: 'bank_international', value });
      toast({ tone: 'success', title: 'Salary account abroad sent for approval' });
      router.push(back);
    },
    onCancel: () => router.push(back),
  };
  return p.self ? <InternationalBankPhone live={live} /> : <InternationalBankTab persona="hr" splits={[]} net={0} live={live} />;
}
