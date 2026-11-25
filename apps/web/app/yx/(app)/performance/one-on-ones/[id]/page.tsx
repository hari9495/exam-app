'use client';

import { useParams } from 'next/navigation';
import { OneOnOnesPage } from '../one-on-ones-view';

// PRF-11: one 1:1, opened in the drawer of the 1:1s list (deep links from reminders and notifications).
export default function YxOneOnOnePage() {
  const { id } = useParams<{ id: string }>();
  return <OneOnOnesPage openId={id} />;
}
