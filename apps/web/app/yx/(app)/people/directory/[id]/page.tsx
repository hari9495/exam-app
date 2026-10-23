'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Spinner } from '@yukthix/ui';
import { PersonRecord } from '../../person-record';

// People › Directory › a person's record (PPL-03).
function Person() {
  const { id } = useParams<{ id: string }>();
  return <PersonRecord personParam={id} path={`/yx/people/directory/${encodeURIComponent(id)}`} />;
}

export default function YxPersonPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" size="md" />}>
      <Person />
    </Suspense>
  );
}
