'use client';

import { DeskPage, DuplicatesCard, type DuplicatePerson } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Service desk › People to check (founder decision 8 Oct 2026): a login with no person got a new one on its first
// ticket. We never link by email on our own; HR (employee.change.manage for the whole company) links them here.
export default function YxDeskPeoplePage() {
  const rows = useDesk<DuplicatePerson[]>('/people/possible-duplicates');
  const write = useDeskWrite();
  return (
    <DeskPage title="People to check" description="Logins that raised a ticket before they were linked to a person." state={deskState(rows)} onRetry={() => void rows.refetch()} what="the people to check" grantedBy="your HR admin">
      <DuplicatesCard
        rows={rows.data ?? []}
        onLink={async (personId, intoPersonId) => {
          await write(`/people/possible-duplicates/${encodeURIComponent(personId)}/link`, 'POST', { intoPersonId });
        }}
      />
    </DeskPage>
  );
}
