'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The old reviews list is retired (founder 3 Nov 2026, Q4): the PRF-01 home lists my reviews to do and my team's, the
// control room lists everyone in a cycle and hand-overs have their own page. Old links land on the home.
export default function YxReviewsPage() {
  const router = useRouter();
  useEffect(() => router.replace('/yx/performance'), [router]);
  return null;
}
