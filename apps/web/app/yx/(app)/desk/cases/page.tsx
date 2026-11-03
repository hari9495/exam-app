'use client';

import { useRouter } from 'next/navigation';
import { CaseListScreen, type CaseListRow } from '@yukthix/ui/desk';
import { deskState, useDesk } from '../../../../../lib/yx-desk';

// Helpdesk › Cases: the designed HLP-08 case list with `live`. Only the cases the person is a member of (and has not
// stepped aside from), plus the accident cases (HLP-12) for the safety team and each case's HR handler; a row opens its
// case. The API checks membership (docs/yukthix/helpdesk-design-map.md 4f, 4g).
export default function YxCasesPage() {
  const router = useRouter();
  const list = useDesk<CaseListRow[]>('/cases');
  const accidents = useDesk<CaseListRow[]>('/accidents');
  const cases = [...(list.data ?? []), ...(accidents.data ?? [])];
  return (
    <CaseListScreen
      live={{
        state: deskState(list, accidents),
        onRetry: () => void Promise.all([list.refetch(), accidents.refetch()]),
        cases,
        onOpen: (c) => router.push(`/yx/desk/${cases.find((x) => x.id === c)?.kind === 'accident' ? 'accidents' : 'cases'}/${encodeURIComponent(c)}`),
      }}
    />
  );
}
