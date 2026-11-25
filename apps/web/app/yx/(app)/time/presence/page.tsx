'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { PresenceDayScreen, type MyPresence, type TeamPresence } from '@yukthix/ui/time';
import { timeState, todayIndia, useTime, useTimeWrite } from '../../../../../lib/yx-time';
import { useScopeParams, withParams } from '../../../../../lib/yx-shell';

// Presence days (TIM-36). ?view=me: my work-from-home days and my consent (no key). Otherwise a manager's team or HR's
// people (attendance.view): the day's status and total active time only, and for HR the consent record.
function YxPresenceInner() {
  const me = useSearchParams().get('view') === 'me';
  const { entity } = useScopeParams();
  const [month, setMonth] = useState(todayIndia().slice(0, 7));
  const mine = useTime<MyPresence>(me ? `/me/presence?month=${month}` : null);
  const team = useTime<TeamPresence>(me ? null : withParams(`/presence?month=${month}`, entity));
  const write = useTimeWrite();
  return me ? (
    <PresenceDayScreen
      live={{ state: timeState(mine), onRetry: () => void mine.refetch(), month, onMonth: setMonth, mine: mine.data ?? null, onConsent: (action) => write('/me/presence/consent', 'POST', { action }, true, action === 'give' ? 'Consent given' : 'Consent withdrawn. Tracking has stopped and your presence trail is deleted.') }}
    />
  ) : (
    <PresenceDayScreen live={{ state: timeState(team), onRetry: () => void team.refetch(), month, onMonth: setMonth, team: team.data ?? null, musterHref: '/yx/time/muster' }} />
  );
}

export default function YxPresencePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <YxPresenceInner />
    </Suspense>
  );
}
