'use client';

import { useRouter } from 'next/navigation';
import { DeclarationsSwitch, type DeclarationsPage } from '@yukthix/ui/frame';
import { useWorkspaceCounts } from './yx-shell';

const HREF: Record<DeclarationsPage, string> = { disability: '/yx/me/declarations', annual: '/yx/me/declarations/annual', preclearance: '/yx/me/declarations/pre-clearance' };

/** Me › Declarations for a designated person: the switch between their declarations pages (none for anyone else). */
export function useDeclarationsSwitch(page: DeclarationsPage) {
  const router = useRouter();
  const counts = useWorkspaceCounts();
  const due = counts.data?.declarationsDue;
  // The counts carry declarationsDue only for a designated person (the server decides).
  if (due === undefined) return undefined;
  return <DeclarationsSwitch value={page} onChange={(p) => router.push(HREF[p])} due={due || undefined} />;
}
