'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Links to one goal (notifications, e-mails) open the goal's drawer on PRF-02 My goals.
export default function YxGoalPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  useEffect(() => router.replace(`/yx/performance/goals?goal=${encodeURIComponent(id)}`), [router, id]);
  return null;
}
