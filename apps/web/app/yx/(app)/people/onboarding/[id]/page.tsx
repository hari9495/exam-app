'use client';

import { useParams, useRouter } from 'next/navigation';
import { JourneyScreen, type Joiner, type Journey } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../../lib/yx-org';
import { useLife, useLifeWrite, useTaskActions } from '../../../../../../lib/yx-lifecycle';

// People › Onboarding › one checklist (PPL-13; YX-LC-02 / 13): every task with its owner and due date; owners do their
// own tasks, HR runs the checklist, uploads documents for the joiner and moves the joining day.
export default function YxJourneyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const journey = useLife<Journey>(`/lifecycle/journeys/${encodeURIComponent(id)}`);
  const j = journey.data;
  const hrJoiner = j?.canManage && j.subjectType === 'preboarding';
  const joiner = useLife<Joiner>(hrJoiner ? `/lifecycle/joiners/${encodeURIComponent(j.subjectId)}` : null);
  const actions = useTaskActions(j?.canManage ? j.personId : null);
  const write = useLifeWrite();
  return (
    <JourneyScreen
      state={loadState(journey)}
      onRetry={() => void journey.refetch()}
      data={j ?? null}
      {...actions}
      onPostpone={hrJoiner && joiner.data ? (joiningOn, reason) => write('POST', `/lifecycle/joiners/${encodeURIComponent(j.subjectId)}/postpone`, { joiningOn, reason, version: joiner.data!.version }) : undefined}
      onBack={() => router.push('/yx/people/onboarding')}
    />
  );
}
