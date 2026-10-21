'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { PersonRecord } from '../person-record';

// Me › Profile: the person's own record (PPL-03). An older link with ?person= opens that person's record in the Directory.
function Profile() {
  const router = useRouter();
  const person = useSearchParams().get('person');
  useEffect(() => {
    if (person) router.replace(`/yx/people/directory/${encodeURIComponent(person)}`);
  }, [person, router]);
  return person ? <Spinner label="Loading" size="md" /> : <PersonRecord personParam={null} path="/yx/people/profile" />;
}

export default function YxProfilePage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Profile />
    </Suspense>
  );
}
