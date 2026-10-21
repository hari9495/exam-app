'use client';

import { EmptyState, ErrorState, PageHeader, Spinner, useToast } from '@yukthix/ui';
import { BfsiDeclarations, type BfsiDeclarationView, type PreclearView } from '@yukthix/ui/frame';
import { useLife, useLifeWrite } from '../../../../../../lib/yx-lifecycle';

type Me = { enabled: false } | { enabled: true; designated: false } | { enabled: true; designated: true; today: string; declaration: BfsiDeclarationView; relations: string[]; requests: PreclearView[] };

// Me › Annual declarations (PPL-43): a designated person's holdings, related persons and conflicts for the financial
// year, attested with a one-time code. Only for companies that use BFSI compliance; the API checks everything.
export default function YxAnnualDeclarationsPage() {
  const { toast } = useToast();
  const me = useLife<Me>('/compliance/me');
  const call = useLifeWrite();
  if (me.isError) return <ErrorState title="We couldn't load your declarations" description="Try again in a moment." onRetry={() => void me.refetch()} />;
  if (!me.data) return <Spinner label="Loading" size="md" />;
  if (!me.data.enabled || !me.data.designated)
    return (
      <>
        <PageHeader title="Annual declarations" />
        <EmptyState title="Nothing to declare" description={me.data.enabled ? 'You are not a designated person. The compliance officer tells you if you become one.' : 'Your company does not use regulated declarations.'} />
      </>
    );
  const d = me.data;
  return (
    <BfsiDeclarations
      live={{
        today: d.today,
        declaration: d.declaration,
        relations: d.relations,
        onSave: async (input) => {
          await call('PUT', '/compliance/me/declaration', input);
          toast({ tone: 'success', title: 'Draft saved' });
        },
        onSendOtp: () => call<{ sentTo: string }>('POST', '/compliance/me/declaration/otp'),
        onSubmit: async (code) => {
          await call('POST', '/compliance/me/declaration/submit', { code, attest: true });
          toast({ tone: 'success', title: `Declarations ${d.declaration.year} submitted`, description: 'The compliance officer reviews them.' });
        },
      }}
    />
  );
}
