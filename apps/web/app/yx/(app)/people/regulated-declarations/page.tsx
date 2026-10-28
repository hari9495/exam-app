'use client';

import { useToast } from '@yukthix/ui';
import { BfsiComplianceList, type BfsiHolding, type BfsiRelated } from '@yukthix/ui/frame';
import { usePeople, usePeopleDownload, usePeopleRead, usePeopleWrite } from '../../../../../lib/yx-people';

interface Row {
  employeeId: string;
  name: string;
  due: string;
  status: 'Pending' | 'Overdue' | 'Done';
}
interface Review {
  submittedAt: string;
  holdings: BfsiHolding[];
  related: BfsiRelated[];
  coi: { answer: 'yes' | 'no'; details: string | null } | null;
}

// People › More › Regulated declarations (PPL-43): the compliance officer's register of designated persons.
export default function YxRegulatedDeclarationsPage() {
  const { toast } = useToast();
  const register = usePeople<{ cycle: string; rows: Row[] }>('/bfsi/register');
  const candidates = usePeople<{ employeeId: string; name: string; code: string | null }[]>('/bfsi/candidates');
  const read = usePeopleRead();
  const write = usePeopleWrite();
  const download = usePeopleDownload();
  return (
    <BfsiComplianceList
      live={{
        state: register.isError ? 'error' : register.data ? 'ready' : 'loading',
        onRetry: () => void register.refetch(),
        rows: (register.data?.rows ?? []).map((r) => ({ ...r, due: new Date(`${r.due}T00:00:00`) })),
        onExport: () => void download('/bfsi/register.csv', `declarations-register-${register.data?.cycle ?? ''}.csv`),
        onRemind: async (id) => {
          await write('POST', `/bfsi/declarations/${encodeURIComponent(id)}/remind`);
          toast({ tone: 'success', title: 'Reminder sent' });
        },
        onReview: async (id) => {
          const r = await read<Review>(`/bfsi/declarations/${encodeURIComponent(id)}`);
          return { ...r, submittedAt: new Date(r.submittedAt) };
        },
        people: (candidates.data ?? []).map((p) => ({ value: p.employeeId, label: p.code ? `${p.name} · ${p.code}` : p.name })),
        onDesignate: async (id) => {
          await write('POST', `/bfsi/designations/${encodeURIComponent(id)}`);
          toast({ tone: 'success', title: 'Designated person added' });
        },
        onUndesignate: async (id) => {
          await write('DELETE', `/bfsi/designations/${encodeURIComponent(id)}`);
          toast({ tone: 'success', title: 'No longer a designated person' });
        },
      }}
    />
  );
}
