'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorState, Spinner } from '@yukthix/ui';
import { ProblemsScreen, type ProblemRow, type ProblemSuggestion } from '@yukthix/ui/desk';
import { useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk ITSM-3 (docs/yukthix/helpdesk-itsm-plan.md; answers 1939-1941): an IT desk's problems and, for its leads, the
// repeat suggestions. Only the desk's agents, leads and admins see it (the API answers 404 or no access).
type Row = Omit<ProblemRow, 'openedOn'> & { openedOn: string };
type ProblemList =
  | { access: false }
  | { access: true; desk: { id: string; name: string }; desks: { id: string; name: string }[]; rows: Row[]; canRaise: boolean; suggestions: ProblemSuggestion[] };

export default function YxDeskProblemsPage() {
  const router = useRouter();
  const [deskId, setDeskId] = useState<string | null>(null);
  const list = useDesk<ProblemList>(deskId ? `/problems?deskId=${encodeURIComponent(deskId)}` : '/problems');
  const write = useDeskWrite();
  if (list.isError) return <ErrorState title="The problems did not load." description="Try again in a moment." onRetry={() => void list.refetch()} />;
  if (!list.data) return <Spinner label="Loading" size="md" />;
  const d = list.data;
  if (!d.access) return <ProblemsScreen rows={[]} access={false} />;
  return (
    <ProblemsScreen
      rows={d.rows.map((r) => ({ ...r, openedOn: new Date(r.openedOn) }))}
      suggestions={d.suggestions}
      live={{
        desks: d.desks,
        deskId: d.desk.id,
        onDesk: setDeskId,
        canRaise: d.canRaise,
        onOpen: (id) => router.push(`/yx/desk/problems/${encodeURIComponent(id)}`),
        onCreate: (input) => write<{ id: string; number: string }>('/problems', 'POST', { deskId: d.desk.id, ...input }),
      }}
    />
  );
}
