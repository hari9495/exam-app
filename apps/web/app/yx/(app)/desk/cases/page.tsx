'use client';

import { useRouter } from 'next/navigation';
import { CaseListScreen, type CaseListRow, type DraftReport, type RaiseInput } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk › Cases: the designed HLP-08 case list with `live`. Only the cases the person is a member of (and has not
// stepped aside from), plus the accident cases (HLP-12) for the safety team and each case's HR handler; a row opens its
// case. HR with case.disciplinary.raise also gets "Open a case" for the people in their HR scope (answer 34; the people
// list is refused, 403, to everyone else, so the button never shows for them). The API checks membership and scope again
// (docs/yukthix/helpdesk-design-map.md 4f, 4g).
export default function YxCasesPage() {
  const router = useRouter();
  const list = useDesk<CaseListRow[]>('/cases');
  const accidents = useDesk<CaseListRow[]>('/accidents');
  const people = useDesk<{ people: { id: string; name: string; email: string }[] }>('/cases/disciplinary/people');
  // Answer 55: managers' reports waiting for this HR person (refused, 403, without the key, like the people list).
  const drafts = useDesk<DraftReport[]>(people.data ? '/cases/disciplinary/drafts' : null);
  const write = useDeskWrite();
  const cases = [...(list.data ?? []), ...(accidents.data ?? [])];
  return (
    <CaseListScreen
      live={{
        state: deskState(list, accidents),
        onRetry: () => void Promise.all([list.refetch(), accidents.refetch()]),
        cases,
        onOpen: (c) => router.push(`/yx/desk/${cases.find((x) => x.id === c)?.kind === 'accident' ? 'accidents' : 'cases'}/${encodeURIComponent(c)}`),
        ...(people.data
          ? {
              raise: {
                people: people.data.people,
                onRaise: (input: RaiseInput) => write<{ id: string; ref: string }>('/cases/disciplinary', 'POST', input),
                drafts: drafts.data ?? [],
                onOpenDraft: (id: string) => write<{ id: string }>(`/cases/disciplinary/drafts/${encodeURIComponent(id)}/open`, 'POST'),
                onDeclineDraft: async (id: string, reason: string) => {
                  await write(`/cases/disciplinary/drafts/${encodeURIComponent(id)}/decline`, 'POST', { reason });
                },
              },
            }
          : {}),
      }}
    />
  );
}
