'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The cycles list lives on the PRF-01 HR home ("Review cycles"); old links go there.
export default function YxReviewCyclesPage() {
  const router = useRouter();
  useEffect(() => router.replace('/yx/performance#cycles'), [router]);
  return null;
}
