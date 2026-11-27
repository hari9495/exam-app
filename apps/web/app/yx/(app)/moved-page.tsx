'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MovedPageState } from '@yukthix/ui/frame';
import { todayIst } from '../../../lib/yx-org';
import { MOVES, showsStub } from '../../../lib/yx-moved';

// T2-F 82 (answer 2887): the old address of a page that moved inside the app: the kit's stub for 6 months (opens the
// new page after 5 seconds), then straight to the new page.
export function MovedPage({ from }: { from: keyof typeof MOVES }) {
  const router = useRouter();
  const move = MOVES[from];
  const stub = showsStub(move, todayIst());
  useEffect(() => {
    if (!stub) router.replace(move.to);
  }, [stub, move.to, router]);
  if (!stub) return null;
  return <MovedPageState title={move.title} href={move.to} onOpen={() => router.replace(move.to)} />;
}
