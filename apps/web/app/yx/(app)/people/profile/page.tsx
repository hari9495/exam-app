'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { ProfileScreen, type ProfileRequest, type ProfileView } from '@yukthix/ui/access';
import type { PersonOption } from '@yukthix/ui/history';
import { loadState, useOrg, useYxPermissions, type Reference } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';

const id = encodeURIComponent;

// People › Profile (PPL-03 / PPL-32; P02 §4.4–4.5): one's own record, or for HR anyone their grants reach.
// The API decides every class: Personal for the person and personal-data access, identity and bank masked
// with a recorded "Show", changes to them sent for approval with a fresh second factor (asked by the client
// when the API needs it). Pay stays on Job history (R1).
function Profile() {
  const router = useRouter();
  const params = useSearchParams();
  const perms = useYxPermissions();
  const me = usePeople<{ employeeId: string }>('/me');
  const personId = params.get('person') ?? me.data?.employeeId ?? null;
  const hr = perms.has('employee.profile.view');
  const people = usePeople<PersonOption[]>(hr ? '/employees' : null);
  const profile = usePeople<ProfileView>(personId ? `/employees/${id(personId)}/profile` : null);
  const requests = usePeople<{ rows: ProfileRequest[] }>(personId ? '/profile-requests?status=pending' : null);
  const reference = useOrg<Reference>('/reference');
  const write = usePeopleWrite();
  const waiting = !personId && me.isLoading;
  return (
    <ProfileScreen
      state={waiting ? 'loading' : personId ? loadState(profile) : 'ready'}
      onRetry={() => void profile.refetch()}
      profile={profile.data ?? null}
      people={hr ? (people.data ?? []) : undefined}
      onPickPerson={hr ? (person) => router.replace(`/yx/people/profile?person=${id(person)}`) : undefined}
      states={(reference.data?.states ?? []).filter((s) => s.country === 'IN')}
      requests={(requests.data?.rows ?? []).filter((r) => r.employeeId === personId)}
      onSavePersonal={async (input) => void (await write('PUT', `/employees/${id(personId!)}/personal`, input))}
      onReveal={async (field) => (await write<{ value: string }>('POST', `/employees/${id(personId!)}/identity/reveal`, { field })).value}
      onRequestChange={async (input) => void (await write('POST', `/employees/${id(personId!)}/profile-requests`, input))}
      onCancelRequest={async (requestId, reason) => void (await write('POST', `/profile-requests/${id(requestId)}/cancel`, { reason }))}
      onOpenHistory={personId ? () => router.push(`/yx/people/history?person=${id(personId)}`) : undefined}
    />
  );
}

export default function YxProfilePage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Profile />
    </Suspense>
  );
}
