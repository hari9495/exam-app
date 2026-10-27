'use client';

import { EmptyState, useToast } from '@yukthix/ui';
import { BfsiDeclarations, type BfsiHolding, type BfsiRelated } from '@yukthix/ui/frame';
import { todayIst } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';

interface Mine {
  designated: boolean;
  cycle: string;
  due: string;
  status: 'draft' | 'submitted';
  submittedAt: string | null;
  holdings: BfsiHolding[];
  related: BfsiRelated[];
  coi: { answer: 'yes' | 'no'; details: string | null } | null;
}

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

// Me › Annual declarations (PPL-43): a designated person's holdings, related persons and conflicts each financial
// year, and the code of conduct attested with a one-time code.
export default function YxAnnualDeclarationsPage() {
  const { toast } = useToast();
  const mine = usePeople<Mine>('/me/bfsi');
  const write = usePeopleWrite();
  const m = mine.data;
  const ready = Boolean(m?.designated);
  if (m && !m.designated) return <EmptyState title="No declarations for you" description="Only designated persons make these declarations. The compliance officer names them." />;
  return (
    <BfsiDeclarations
      key={m ? `${m.cycle}-${m.status}` : 'loading'}
      today={day(todayIst())}
      live={{
        state: mine.isError ? 'error' : ready ? 'ready' : 'loading',
        onRetry: () => void mine.refetch(),
        cycle: m?.cycle ?? '',
        due: day(m?.due ?? todayIst()),
        submittedAt: m?.submittedAt ? new Date(m.submittedAt) : null,
        holdings: m?.holdings ?? [],
        related: m?.related ?? [],
        coi: m?.coi ?? null,
        onAddHolding: async (h) => {
          await write('POST', '/me/bfsi/holdings', h);
          toast({ tone: 'success', title: 'Holding added' });
        },
        onRemoveHolding: async (id) => void (await write('DELETE', `/me/bfsi/holdings/${encodeURIComponent(id)}`)),
        onAddRelated: async (r) => {
          await write('POST', '/me/bfsi/related', r);
          toast({ tone: 'success', title: 'Related person added' });
        },
        onRemoveRelated: async (id) => void (await write('DELETE', `/me/bfsi/related/${encodeURIComponent(id)}`)),
        onSaveCoi: async (c) => {
          await write('PUT', '/me/bfsi/coi', c);
          toast({ tone: 'success', title: 'Draft saved' });
        },
        onSubmit: async () => {
          await write('POST', '/me/bfsi/submit');
          toast({ tone: 'success', title: 'Declarations submitted' });
        },
      }}
    />
  );
}
