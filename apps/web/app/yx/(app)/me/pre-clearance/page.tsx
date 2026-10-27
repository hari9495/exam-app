'use client';

import { EmptyState, useToast } from '@yukthix/ui';
import { TradingPreclearance, type PreclearanceRules } from '@yukthix/ui/frame';
import { todayIst } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { useLifeWrite } from '../../../../../lib/yx-lifecycle';
import { preclearanceItem, type PreclearanceRow } from '../../../../../lib/yx-preclearance';

// Me › Trading pre-clearance (PPL-44): a designated person asks the compliance officer before trading, then reports
// the trade with its contract note.
export default function YxMyPreclearancePage() {
  const { toast } = useToast();
  const mine = usePeople<{ personId: string; rules: PreclearanceRules; requests: PreclearanceRow[] }>('/me/pre-clearance');
  const write = usePeopleWrite();
  const upload = useLifeWrite();
  const forbidden = (mine.error as { status?: number } | null)?.status === 403;
  if (forbidden) return <EmptyState title="No pre-clearance for you" description="Only designated persons ask for pre-clearance. The compliance officer names them." />;
  return (
    <TradingPreclearance
      today={new Date(`${todayIst()}T00:00:00`)}
      live={{
        state: mine.isError ? 'error' : mine.data ? 'ready' : 'loading',
        onRetry: () => void mine.refetch(),
        rules: mine.data?.rules ?? { threshold: 0, validDays: 0, decideDays: 0 },
        requests: (mine.data?.requests ?? []).map(preclearanceItem),
        onRequest: async (input) => {
          const r = await write<{ referenceNo: string }>('POST', '/me/pre-clearance', input);
          toast({ tone: 'success', title: `Pre-clearance ${r.referenceNo} sent to the compliance officer` });
        },
        onUploadNote: async (file) => {
          const body = new FormData();
          body.append('file', file);
          return (await upload<{ id: string }>('POST', `/documents/people/${encodeURIComponent(mine.data!.personId)}/contract_note`, body)).id;
        },
        onReport: async (id, report) => {
          await write('POST', `/me/pre-clearance/${encodeURIComponent(id)}/report`, report);
          toast({ tone: 'success', title: 'Trade reported' });
        },
      }}
    />
  );
}
