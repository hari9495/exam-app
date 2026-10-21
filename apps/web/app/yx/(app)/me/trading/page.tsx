'use client';

import { EmptyState, ErrorState, PageHeader, Spinner, useToast } from '@yukthix/ui';
import { TradingPreclearance, type PreclearView } from '@yukthix/ui/frame';
import { usePeople } from '../../../../../lib/yx-people';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

type Me = { enabled: false } | { enabled: true; designated: false } | { enabled: true; designated: true; today: string; window: { closedTo: string; reason: string } | null; requests: PreclearView[] };

// Me › Trading pre-clearance (PPL-44): a designated person asks before a trade, never in a closed trading window, and
// reports the trade with its contract note. The compliance officer decides; the API checks everything.
export default function YxTradingPage() {
  const { toast } = useToast();
  const me = useLife<Me>('/compliance/me');
  const person = usePeople<{ personId: string }>('/me/disability');
  const call = useLifeWrite();
  if (me.isError) return <ErrorState title="We couldn't load your requests" description="Try again in a moment." onRetry={() => void me.refetch()} />;
  if (!me.data) return <Spinner label="Loading" size="md" />;
  if (!me.data.enabled || !me.data.designated)
    return (
      <>
        <PageHeader title="Trading pre-clearance" />
        <EmptyState title="Not needed" description={me.data.enabled ? 'Only designated persons ask pre-clearance before trading.' : 'Your company does not use trading pre-clearance.'} />
      </>
    );
  const d = me.data;
  return (
    <TradingPreclearance
      today={new Date(`${d.today}T00:00:00`)}
      live={{
        today: d.today,
        window: d.window,
        requests: d.requests,
        onRequest: async (input) => {
          const out = await call<{ ref: string }>('POST', '/compliance/me/preclearance', input);
          toast({ tone: 'success', title: `Pre-clearance ${out.ref} sent to the compliance officer` });
        },
        onUploadNote: async (file) => {
          const form = new FormData();
          form.append('file', file);
          return (await call<{ id: string }>('POST', `/documents/people/${encodeURIComponent(person.data!.personId)}/contract_note`, form)).id;
        },
        onReport: async (r, input) => {
          const out = await call<{ late: boolean }>('POST', `/compliance/me/preclearance/${encodeURIComponent(r.id)}/report`, { ...input, version: r.version });
          toast({ tone: 'success', title: `Trade ${r.ref} reported`, ...(out.late ? { description: 'It was after the approval ended: the compliance officer is told.' } : {}) });
        },
      }}
    />
  );
}
